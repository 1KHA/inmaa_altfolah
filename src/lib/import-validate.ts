/**
 * Parsing + validation for bulk import. Pure logic, no HTTP — the route calls
 * `validateImport()` for the preview AND again before committing, so the
 * commit never trusts anything the browser sends back.
 *
 * Errors fail the row (it will not be created). Warnings are advisory and the
 * row still imports. Nothing is written unless every row is valid — a
 * half-imported file is worse than a rejected one.
 */
import crypto from 'crypto';
import { prisma } from './prisma';
import { resolveChallenge } from './challenges';
import {
  IMPORT_SPECS,
  type EntityKey,
  parseBoolean,
  isBooleanLike,
  isValidEmail,
  normalizeEmail,
} from './import-schema';

export interface RowResult {
  /** 1-based row number as seen in the spreadsheet (header is row 1). */
  rowNumber: number;
  data: Record<string, string>;
  errors: string[];
  warnings: string[];
}

export interface ValidationResult {
  entity: EntityKey;
  headers: string[];
  unknownColumns: string[];
  missingColumns: string[];
  rows: RowResult[];
  validCount: number;
  errorCount: number;
  warningCount: number;
  /** Fatal, file-level problems — nothing can be imported. */
  fatal: string[];
}

const clean = (v: unknown): string =>
  v === null || v === undefined ? '' : String(v).replace(/‏|‎/g, '').trim();

/**
 * Validate a parsed sheet (array of row objects keyed by header).
 * Cross-checks against the database: duplicate emails, unknown teams.
 */
export async function validateImport(
  entity: EntityKey,
  rawRows: Record<string, unknown>[],
  presentHeaders: string[]
): Promise<ValidationResult> {
  const spec = IMPORT_SPECS[entity];
  const known = spec.columns.map((c) => c.key);

  const result: ValidationResult = {
    entity,
    headers: presentHeaders,
    unknownColumns: presentHeaders.filter((h) => h && !known.includes(h)),
    missingColumns: spec.columns.filter((c) => c.required && !presentHeaders.includes(c.key)).map((c) => c.key),
    rows: [],
    validCount: 0,
    errorCount: 0,
    warningCount: 0,
    fatal: [],
  };

  if (rawRows.length === 0) result.fatal.push('الملف لا يحتوي على أي صفوف بيانات.');
  if (result.missingColumns.length > 0) {
    result.fatal.push(`أعمدة إلزامية مفقودة: ${result.missingColumns.join('، ')}`);
  }
  if (result.fatal.length > 0) return result;

  // ---- per-row field checks ----
  const rows: RowResult[] = rawRows.map((raw, i) => {
    const data: Record<string, string> = {};
    for (const col of spec.columns) data[col.key] = clean(raw[col.key]);
    const errors: string[] = [];
    const warnings: string[] = [];

    // The registration platform exports tracks in English. Resolve them to the
    // canonical Arabic challenge here, so a file uploaded straight from that
    // export validates instead of failing with "unknown track". Anything
    // unresolvable is left alone and fails the oneOf check below.
    if (data.hackathonTrack) {
      const resolved = resolveChallenge(data.hackathonTrack);
      if (resolved && resolved !== data.hackathonTrack) {
        warnings.push(`تم تحويل المسار «${data.hackathonTrack}» إلى «${resolved}»`);
        data.hackathonTrack = resolved;
      }
    }

    for (const col of spec.columns) {
      const value = data[col.key];
      if (col.required && value === '') {
        errors.push(`«${col.labelAr}» مطلوب`);
        continue;
      }
      if (value === '') continue;
      if (col.type === 'boolean' && !isBooleanLike(value)) {
        errors.push(`«${col.labelAr}» يجب أن يكون TRUE أو FALSE (القيمة: ${value})`);
      }
      if (col.oneOf && !col.oneOf.some((o) => o === value)) {
        const msg = `«${col.labelAr}» قيمة غير معروفة: ${value}`;
        if (col.softOneOf) warnings.push(msg);
        else errors.push(`${msg}. المسموح: ${col.oneOf.join(' / ')}`);
      }
      if (col.key === 'email' && !isValidEmail(value)) {
        errors.push(`بريد إلكتروني غير صالح: ${value}`);
      }
    }
    return { rowNumber: i + 2, data, errors, warnings }; // +2: header is row 1
  });

  // ---- duplicates inside the file ----
  const seen = new Map<string, number>();
  const dupKey = entity === 'teams' || entity === 'teams-with-leader' ? 'teamName' : 'email';
  for (const row of rows) {
    const key = dupKey === 'email' ? normalizeEmail(row.data.email || '') : (row.data.teamName || '').trim();
    if (!key) continue;
    if (seen.has(key)) row.errors.push(`مكرر داخل الملف (نفس ${dupKey === 'email' ? 'البريد' : 'اسم الفريق'} في الصف ${seen.get(key)})`);
    else seen.set(key, row.rowNumber);
  }

  // ---- cross-checks against the database ----
  const keys = Array.from(seen.keys());
  if (entity === 'mentors' && keys.length > 0) {
    const existing = await prisma.mentor.findMany({ where: { email: { in: keys } }, select: { email: true } });
    const taken = new Set(existing.map((m) => m.email.toLowerCase()));
    for (const row of rows) if (taken.has(normalizeEmail(row.data.email || ''))) row.errors.push('البريد مسجل مسبقاً كموجه');
  }

  if (entity === 'participants' && keys.length > 0) {
    const existing = await prisma.participant.findMany({ where: { email: { in: keys } }, select: { email: true } });
    const taken = new Set(existing.map((p) => p.email.toLowerCase()));
    for (const row of rows) if (taken.has(normalizeEmail(row.data.email || ''))) row.errors.push('البريد مسجل مسبقاً كمشارك');

    // every referenced team must already exist (import teams first)
    const wanted = Array.from(new Set(rows.map((r) => r.data.teamName).filter(Boolean)));
    if (wanted.length > 0) {
      const teams = await prisma.team.findMany({ where: { teamName: { in: wanted } }, select: { teamName: true } });
      const have = new Set(teams.map((t) => t.teamName));
      for (const row of rows) {
        const t = row.data.teamName;
        if (t && !have.has(t)) row.errors.push(`الفريق «${t}» غير موجود — استورد الفرق أولاً`);
      }
    }

    // exactly one leader per team, counting members already in the database
    const byTeam = new Map<string, RowResult[]>();
    for (const row of rows) {
      const t = row.data.teamName;
      if (!t) continue;
      (byTeam.get(t) ?? byTeam.set(t, []).get(t)!).push(row);
    }
    for (const [teamName, teamRows] of Array.from(byTeam.entries())) {
      const leadersInFile = teamRows.filter((r) => parseBoolean(r.data.isLeader || '') === true);
      const existingLeaders = await prisma.participant.count({
        where: { isLeader: true, team: { is: { teamName } } },
      });
      if (leadersInFile.length + existingLeaders > 1) {
        for (const r of leadersInFile) r.errors.push(`الفريق «${teamName}» له أكثر من قائد`);
      }
      if (leadersInFile.length + existingLeaders === 0) {
        for (const r of teamRows) r.warnings.push(`الفريق «${teamName}» بدون قائد`);
      }
    }
  }

  if (entity === 'teams-with-leader') {
    // Team names must be free, and each leader email must be unique in the
    // file and unused — the row creates a Team AND a Participant together.
    const names = Array.from(new Set(rows.map((r) => r.data.teamName).filter(Boolean)));
    if (names.length > 0) {
      const existingTeams = await prisma.team.findMany({ where: { teamName: { in: names } }, select: { teamName: true } });
      const takenTeams = new Set(existingTeams.map((t) => t.teamName));
      for (const row of rows) if (takenTeams.has(row.data.teamName)) row.errors.push('اسم الفريق مستخدم مسبقاً');
    }

    const emails = rows.map((r) => normalizeEmail(r.data.leaderEmail || '')).filter(Boolean);
    const seenEmail = new Map<string, number>();
    for (const row of rows) {
      const e = normalizeEmail(row.data.leaderEmail || '');
      if (!e) continue;
      if (seenEmail.has(e)) row.errors.push(`بريد القائد مكرر داخل الملف (الصف ${seenEmail.get(e)})`);
      else seenEmail.set(e, row.rowNumber);
    }
    if (emails.length > 0) {
      const existing = await prisma.participant.findMany({ where: { email: { in: emails } }, select: { email: true } });
      const taken = new Set(existing.map((p) => p.email.toLowerCase()));
      for (const row of rows) {
        if (taken.has(normalizeEmail(row.data.leaderEmail || ''))) row.errors.push('بريد القائد مسجل مسبقاً كمشارك');
      }
    }
    for (const row of rows) {
      const e = row.data.leaderEmail;
      if (e && !isValidEmail(e)) row.errors.push(`بريد قائد الفريق غير صالح: ${e}`);
    }
  }

  if (entity === 'teams' && keys.length > 0) {
    const existing = await prisma.team.findMany({ where: { teamName: { in: keys } }, select: { teamName: true } });
    const taken = new Set(existing.map((t) => t.teamName));
    for (const row of rows) if (taken.has(row.data.teamName)) row.errors.push('اسم الفريق مستخدم مسبقاً');
  }

  result.rows = rows;
  result.errorCount = rows.filter((r) => r.errors.length > 0).length;
  result.warningCount = rows.filter((r) => r.warnings.length > 0).length;
  result.validCount = rows.length - result.errorCount;
  return result;
}

/**
 * Create the rows. Caller must have confirmed `errorCount === 0`.
 * Runs in a single transaction: all rows or none.
 *
 * Forced on every record regardless of file contents:
 *   status = 'pending' · isDisabled = false · passwordHash = null
 *
 * ⚠ Round-trips matter here. This used to `create()` once per row inside an
 * interactive transaction — two per row for teams-with-leader. In production
 * the app talks to Supabase through the transaction-mode pooler (port 6543,
 * `pgbouncer=true`) from another region, so each call costs ~100 ms of network.
 * Prisma's interactive transaction defaults to a 5 s timeout, so the
 * transaction was killed after roughly 25-50 rows and every later statement
 * failed with **P2028 "Transaction not found"**.
 *
 * It now uses `createMany`, so the whole import is a handful of statements
 * regardless of row count: 1 for teams/mentors, 2 for participants and for
 * teams-with-leader (ids are generated here so the children can reference the
 * parents without reading them back).
 *
 * The two-statement case uses the ARRAY form of $transaction rather than the
 * interactive callback form. The array form is executed as one batched
 * transaction and is not governed by the interactive `timeout` at all, so the
 * P2028 failure mode is gone by construction rather than by a larger timeout.
 */

export async function commitImport(entity: EntityKey, rows: RowResult[]): Promise<number> {
  const b = (v: string) => parseBoolean(v ?? '') ?? false;

  /** Deprecated columns mirrored from the modern ones, as /api/register-team does. */
  const legacy = (o: {
    fullName: string; phone: string; major: string; prof: string; gender: string; city: string; attend: boolean;
  }) => ({
    firstName: o.fullName,
    secondName: '',
    familyName: '',
    nationalId: '',
    dob: '',
    phoneNumber: o.phone,
    education: o.major,
    major: o.major,
    employmentStatus: o.prof,
    nationality: o.gender,
    residence: o.city,
    canAttend: o.attend,
  });

  if (entity === 'teams') {
    const data = rows.map((r) => ({
      teamName: r.data.teamName,
      hackathonTrack: r.data.hackathonTrack,
      ideaDescription: r.data.ideaDescription || '',
      hearAboutUs: r.data.hearAboutUs || '',
      isTeamRegistration: true,
      status: 'pending',
      isDisabled: false,
      challenge: r.data.hackathonTrack, // deprecated mirror, as the public form does
    }));
    const res = await prisma.team.createMany({ data });
    return res.count;
  }

  if (entity === 'mentors') {
    const data = rows.map((r) => ({
      name: r.data.name,
      email: normalizeEmail(r.data.email),
      specialty: r.data.specialty,
      phone: r.data.phone || '',
      status: 'pending',
      isDisabled: false,
      passwordHash: null,
    }));
    const res = await prisma.mentor.createMany({ data });
    return res.count;
  }

  if (entity === 'teams-with-leader') {
    // Generate the team ids up front so the leaders can point at them without
    // a read-back per row. Two statements total, whatever the file size.
    const teams = rows.map((r) => ({
      id: crypto.randomUUID(),
      teamName: r.data.teamName,
      hackathonTrack: r.data.hackathonTrack,
      ideaDescription: r.data.ideaDescription || '',
      hearAboutUs: r.data.hearAboutUs || '',
      isTeamRegistration: true,
      status: 'pending',
      isDisabled: false,
      challenge: r.data.hackathonTrack,
    }));
    const leaders = rows.map((r, i) => ({
      email: normalizeEmail(r.data.leaderEmail),
      fullName: r.data.leaderFullName,
      contactNumber: r.data.leaderContactNumber || '',
      gender: r.data.leaderGender || '',
      isUniversityStudent: b(r.data.leaderIsUniversityStudent),
      university: r.data.leaderUniversity || '',
      universityMajor: r.data.leaderUniversityMajor || '',
      professionalField: r.data.leaderProfessionalField || '',
      city: r.data.leaderCity || '',
      canAttendHackathon: b(r.data.leaderCanAttendHackathon),
      isLeader: true,
      teamId: teams[i].id,
      status: 'pending',
      isDisabled: false,
      passwordHash: null,
      ...legacy({
        fullName: r.data.leaderFullName || '',
        phone: r.data.leaderContactNumber || '',
        major: r.data.leaderUniversityMajor || '',
        prof: r.data.leaderProfessionalField || '',
        gender: r.data.leaderGender || '',
        city: r.data.leaderCity || '',
        attend: b(r.data.leaderCanAttendHackathon),
      }),
    }));

    await prisma.$transaction([
      prisma.team.createMany({ data: teams }),
      prisma.participant.createMany({ data: leaders }),
    ]);
    return rows.length;
  }

  // participants — resolve team names to ids once, then a single insert
  const teamNames = Array.from(new Set(rows.map((r) => r.data.teamName).filter(Boolean)));
  const teams = teamNames.length
    ? await prisma.team.findMany({ where: { teamName: { in: teamNames } }, select: { id: true, teamName: true } })
    : [];
  const teamId = new Map(teams.map((t) => [t.teamName as string, t.id]));

  const data = rows.map((r) => ({
    email: normalizeEmail(r.data.email),
    fullName: r.data.fullName,
    contactNumber: r.data.contactNumber || '',
    gender: r.data.gender || '',
    isUniversityStudent: b(r.data.isUniversityStudent),
    university: r.data.university || '',
    universityMajor: r.data.universityMajor || '',
    professionalField: r.data.professionalField || '',
    city: r.data.city || '',
    canAttendHackathon: b(r.data.canAttendHackathon),
    isLeader: b(r.data.isLeader),
    teamId: r.data.teamName ? teamId.get(r.data.teamName) ?? null : null,
    status: 'pending',
    isDisabled: false,
    passwordHash: null,
    ...legacy({
      fullName: r.data.fullName || '',
      phone: r.data.contactNumber || '',
      major: r.data.universityMajor || '',
      prof: r.data.professionalField || '',
      gender: r.data.gender || '',
      city: r.data.city || '',
      attend: b(r.data.canAttendHackathon),
    }),
  }));
  const res = await prisma.participant.createMany({ data });
  return res.count;
}
