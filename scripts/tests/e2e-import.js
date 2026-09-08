/**
 * End-to-end test for the bulk import feature (upload → preview → commit).
 *
 * Drives POST /api/admin/import over real HTTP with real multipart uploads,
 * for CSV and XLSX, covering: the dry-run preview, every validation rule,
 * refusal to commit while errors exist, all-or-nothing behaviour, and that
 * imported records land as NOT accepted (status 'pending', no password).
 * Cleans up everything it creates.
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const XLSX = require(path.join(REPO, 'node_modules/xlsx'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const TAG = `imp${Date.now()}`;

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { if (ok) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? '  -> ' + d : ''}`); } };
const section = (s) => console.log(`\n--- ${s} ---`);
const cookie = (c) => 'token=' + jwt.sign(c, SECRET, { expiresIn: '30m' });

const TRACK = 'البنية التحتية للمياه';

/** Build a CSV string (with BOM, like the real templates). */
const csv = (rows) => '﻿' + rows.map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',')).join('\r\n');

async function upload(entity, content, { commit = false, cookie: ck, filename = 'data.csv' } = {}) {
  const fd = new FormData();
  const blob = content instanceof Buffer ? new Blob([content]) : new Blob([content], { type: 'text/csv' });
  fd.append('file', blob, filename);
  fd.append('entity', entity);
  fd.append('commit', String(commit));
  const res = await fetch(BASE + '/api/admin/import', {
    method: 'POST', body: fd, headers: ck ? { cookie: ck } : {},
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const rowErrors = (p, n) => (p.rows.find((r) => r.rowNumber === n) || {}).errors || [];

async function waitForServer() {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/admin/import', { method: 'POST' })).status === 401) return; } catch {} await new Promise(r => setTimeout(r, 2000)); }
  throw new Error('server not reachable');
}

(async () => {
  if (!SECRET) throw new Error('JWT_SECRET required');
  await waitForServer();
  const admin = await prisma.admin.upsert({ where: { username: `${TAG}-adm` }, update: {}, create: { username: `${TAG}-adm`, passwordHash: 'x' } });
  const aCookie = cookie({ id: admin.id, username: admin.username, role: 'admin' });

  section('auth + basic guards');
  let r = await upload('teams', csv([['teamName']]), {});
  check('no admin cookie -> 401', r.status === 401, String(r.status));
  r = await upload('nonsense', csv([['x']]), { cookie: aCookie });
  check('unknown entity -> 400', r.status === 400, String(r.status));

  section('teams: preview then commit');
  const teamsCsv = csv([
    ['teamName', 'hackathonTrack', 'ideaDescription', 'hearAboutUs'],
    [`${TAG} فريق أ`, TRACK, 'فكرة أ', 'تويتر'],
    [`${TAG} فريق ب`, TRACK, 'فكرة ب', 'صديق'],
  ]);
  r = await upload('teams', teamsCsv, { cookie: aCookie });
  check('preview 200', r.status === 200, JSON.stringify(r.json).slice(0, 120));
  check('2 valid rows, 0 errors', r.json.validCount === 2 && r.json.errorCount === 0, JSON.stringify({ v: r.json.validCount, e: r.json.errorCount }));
  check('preview did NOT commit', r.json.committed === false);
  check('preview created nothing in the DB', (await prisma.team.count({ where: { teamName: { startsWith: TAG } } })) === 0);

  r = await upload('teams', teamsCsv, { commit: true, cookie: aCookie });
  check('commit 200, created 2', r.status === 200 && r.json.committed === true && r.json.created === 2, JSON.stringify(r.json).slice(0, 140));
  const teams = await prisma.team.findMany({ where: { teamName: { startsWith: TAG } } });
  check('2 teams exist', teams.length === 2, String(teams.length));
  check('teams are NOT accepted (status=pending)', teams.every((t) => t.status === 'pending'), JSON.stringify(teams.map(t => t.status)));
  check('teams not disabled, track + isTeamRegistration set', teams.every((t) => t.isDisabled === false && t.hackathonTrack === TRACK && t.isTeamRegistration === true));

  section('teams: validation rules');
  r = await upload('teams', csv([['teamName', 'hackathonTrack'], [`${TAG} فريق أ`, TRACK]]), { cookie: aCookie });
  check('duplicate team name vs DB -> row error', rowErrors(r.json, 2).some((e) => e.includes('مستخدم مسبقاً')), JSON.stringify(rowErrors(r.json, 2)));
  r = await upload('teams', csv([['teamName', 'hackathonTrack'], [`${TAG} X`, 'مسار غير موجود']]), { cookie: aCookie });
  check('unknown hackathonTrack -> row error', rowErrors(r.json, 2).some((e) => e.includes('غير معروفة')), JSON.stringify(rowErrors(r.json, 2)));
  r = await upload('teams', csv([['ideaDescription'], ['x']]), { cookie: aCookie });
  check('missing required columns -> fatal', r.json.fatal.length > 0, JSON.stringify(r.json.fatal));
  r = await upload('teams', csv([['teamName', 'hackathonTrack']]), { cookie: aCookie });
  check('no data rows -> fatal', r.json.fatal.length > 0, JSON.stringify(r.json.fatal));

  section('participants: link to teams, reject bad rows');
  const goodParticipants = csv([
    ['email', 'fullName', 'teamName', 'isLeader', 'gender', 'isUniversityStudent', 'canAttendHackathon', 'professionalField', 'contactNumber'],
    [`${TAG}-a@t.local`, 'سارة', `${TAG} فريق أ`, 'TRUE', 'أنثى', 'TRUE', 'TRUE', 'برمجة', '0501111111'],
    [`${TAG}-b@t.local`, 'عمر', `${TAG} فريق أ`, 'FALSE', 'ذكر', 'نعم', 'لا', 'علم البيانات', '0502222222'],
    [`${TAG}-c@t.local`, 'هدى', '', 'FALSE', 'أنثى', 'FALSE', 'FALSE', 'ذكاء اصناعي', '0503333333'],
  ]);
  r = await upload('participants', goodParticipants, { cookie: aCookie });
  check('3 valid participants', r.json.validCount === 3 && r.json.errorCount === 0, JSON.stringify(r.json.rows.map(x => x.errors)));
  r = await upload('participants', goodParticipants, { commit: true, cookie: aCookie });
  check('committed 3', r.json.committed === true && r.json.created === 3, JSON.stringify(r.json).slice(0, 140));

  const parts = await prisma.participant.findMany({ where: { email: { startsWith: TAG } }, include: { team: true } });
  check('3 participants exist', parts.length === 3, String(parts.length));
  check('all NOT accepted (status=pending)', parts.every((p) => p.status === 'pending'));
  check('no passwords set (approval generates them)', parts.every((p) => p.passwordHash === null));
  check('none disabled', parts.every((p) => p.isDisabled === false));
  const sara = parts.find((p) => p.email.includes('-a@'));
  check('team member linked to the right team', sara.team && sara.team.teamName === `${TAG} فريق أ`, String(sara.team && sara.team.teamName));
  check('leader flag imported', sara.isLeader === true);
  const huda = parts.find((p) => p.email.includes('-c@'));
  check('individual participant has no team', huda.teamId === null);
  const omar = parts.find((p) => p.email.includes('-b@'));
  check('نعم/لا parsed as booleans', omar.isUniversityStudent === true && omar.canAttendHackathon === false,
        JSON.stringify({ u: omar.isUniversityStudent, c: omar.canAttendHackathon }));
  check('phone kept its leading zero', omar.contactNumber === '0502222222', String(omar.contactNumber));

  section('participants: validation rules');
  r = await upload('participants', csv([['email', 'fullName', 'teamName'], [`${TAG}-a@t.local`, 'x', '']]), { cookie: aCookie });
  check('email already in DB -> row error', rowErrors(r.json, 2).some((e) => e.includes('مسجل مسبقاً')), JSON.stringify(rowErrors(r.json, 2)));
  r = await upload('participants', csv([['email', 'fullName'], [`${TAG}-dup@t.local`, 'a'], [`${TAG}-dup@t.local`, 'b']]), { cookie: aCookie });
  check('duplicate email inside the file -> row error', rowErrors(r.json, 3).some((e) => e.includes('مكرر داخل الملف')), JSON.stringify(rowErrors(r.json, 3)));
  r = await upload('participants', csv([['email', 'fullName', 'teamName'], [`${TAG}-z@t.local`, 'z', 'فريق غير موجود']]), { cookie: aCookie });
  check('unknown teamName -> row error', rowErrors(r.json, 2).some((e) => e.includes('غير موجود')), JSON.stringify(rowErrors(r.json, 2)));
  r = await upload('participants', csv([['email', 'fullName', 'teamName', 'isLeader'],
    [`${TAG}-l1@t.local`, 'l1', `${TAG} فريق ب`, 'TRUE'], [`${TAG}-l2@t.local`, 'l2', `${TAG} فريق ب`, 'TRUE']]), { cookie: aCookie });
  check('two leaders in one team -> row errors', rowErrors(r.json, 2).some((e) => e.includes('أكثر من قائد')), JSON.stringify(rowErrors(r.json, 2)));
  r = await upload('participants', csv([['email', 'fullName'], ['not-an-email', 'x']]), { cookie: aCookie });
  check('invalid email -> row error', rowErrors(r.json, 2).some((e) => e.includes('غير صالح')), JSON.stringify(rowErrors(r.json, 2)));
  r = await upload('participants', csv([['email', 'fullName', 'isLeader'], [`${TAG}-bool@t.local`, 'x', 'ربما']]), { cookie: aCookie });
  check('unparseable boolean -> row error', rowErrors(r.json, 2).some((e) => e.includes('TRUE')), JSON.stringify(rowErrors(r.json, 2)));
  r = await upload('participants', csv([['email', 'fullName', 'gender'], [`${TAG}-g@t.local`, 'x', 'غير محدد']]), { cookie: aCookie });
  check('unknown gender is a WARNING, row still valid', r.json.errorCount === 0 && r.json.warningCount === 1, JSON.stringify({ e: r.json.errorCount, w: r.json.warningCount }));
  r = await upload('participants', csv([['email', 'fullName', 'nickname'], [`${TAG}-u@t.local`, 'x', 'y']]), { cookie: aCookie });
  check('unknown column reported and ignored', r.json.unknownColumns.includes('nickname') && r.json.errorCount === 0, JSON.stringify(r.json.unknownColumns));

  section('commit is refused while any row has an error (all-or-nothing)');
  const mixed = csv([['email', 'fullName'], [`${TAG}-ok@t.local`, 'ok'], ['bad-email', 'bad']]);
  r = await upload('participants', mixed, { commit: true, cookie: aCookie });
  check('mixed file -> 400, not committed', r.status === 400 && r.json.committed === false, JSON.stringify(r.json).slice(0, 120));
  check('the VALID row was not created either', (await prisma.participant.count({ where: { email: `${TAG}-ok@t.local` } })) === 0);

  section('mentors + XLSX upload');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['name', 'email', 'specialty', 'phone'],
    [`${TAG} موجه`, `${TAG}-m1@t.local`, 'الذكاء الاصطناعي', '0509999999'],
  ]), 'الموجهون');
  const xlsxBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  r = await upload('mentors', xlsxBuf, { commit: true, cookie: aCookie, filename: 'mentors.xlsx' });
  check('XLSX upload works, 1 mentor created', r.status === 200 && r.json.created === 1, JSON.stringify(r.json).slice(0, 140));
  const mentors = await prisma.mentor.findMany({ where: { email: { startsWith: TAG } } });
  check('mentor is NOT accepted (status=pending), no password', mentors.length === 1 && mentors[0].status === 'pending' && mentors[0].passwordHash === null,
        JSON.stringify(mentors.map((m) => ({ s: m.status, p: m.passwordHash }))));
  r = await upload('mentors', csv([['name', 'email'], ['x', `${TAG}-m2@t.local`]]), { cookie: aCookie });
  check('mentor missing required column specialty -> fatal', r.json.fatal.length > 0, JSON.stringify(r.json.fatal));

  section('the shipped templates parse cleanly');
  const fs = require('fs');
  for (const [entity, file] of [['teams', 'teams-template.csv'], ['participants', 'participants-template.csv'], ['mentors', 'mentors-template.csv']]) {
    const buf = fs.readFileSync(path.join(REPO, 'imports', file));
    const res = await upload(entity, buf, { cookie: aCookie, filename: file });
    // header-only template => "no data rows" fatal, but NO missing-column fatal
    const missingCols = (res.json.missingColumns || []).length;
    check(`${file}: headers match the validator exactly`, missingCols === 0, JSON.stringify(res.json.missingColumns));
  }
  const exBuf = fs.readFileSync(path.join(REPO, 'imports', 'teams-example.csv'));
  r = await upload('teams', exBuf, { cookie: aCookie, filename: 'teams-example.csv' });
  check('teams-example.csv validates with 0 errors', r.json.errorCount === 0, JSON.stringify(r.json.rows?.map(x => x.errors)));


  section('teams-with-leader: one row creates the team AND its leader');
  const combined = csv([
    ['teamName','hackathonTrack','ideaDescription','hearAboutUs','leaderEmail','leaderFullName','leaderContactNumber','leaderGender','leaderCanAttendHackathon'],
    [`${TAG} فريق مدمج`, TRACK, 'فكرة مدمجة', 'تويتر', `${TAG}-lead@t.local`, 'قائد الفريق', '0507777777', 'ذكر', 'TRUE'],
  ]);
  r = await upload('teams-with-leader', combined, { cookie: aCookie });
  check('combined preview: 1 valid row', r.json.validCount === 1 && r.json.errorCount === 0, JSON.stringify(r.json.rows?.map(x=>x.errors)));
  r = await upload('teams-with-leader', combined, { commit: true, cookie: aCookie });
  check('combined commit 200', r.status === 200 && r.json.committed === true, JSON.stringify(r.json).slice(0,140));
  const ct = await prisma.team.findFirst({ where: { teamName: `${TAG} فريق مدمج` }, include: { participants: true } });
  check('team created pending with the track', ct && ct.status === 'pending' && ct.hackathonTrack === TRACK, ct && ct.status);
  check('leader created inside that team', ct && ct.participants.length === 1, ct && String(ct.participants.length));
  const ld = ct && ct.participants[0];
  check('leader is flagged isLeader', ld && ld.isLeader === true);
  check('leader pending, no password, not disabled', ld && ld.status === 'pending' && ld.passwordHash === null && ld.isDisabled === false);
  check('leader phone kept leading zero', ld && ld.contactNumber === '0507777777', ld && ld.contactNumber);

  section('teams-with-leader: validation');
  r = await upload('teams-with-leader', csv([
    ['teamName','hackathonTrack','leaderEmail','leaderFullName'],
    [`${TAG} فريق مدمج`, TRACK, `${TAG}-new@t.local`, 'x']]), { cookie: aCookie });
  check('duplicate team name -> error', rowErrors(r.json,2).some(e=>e.includes('مستخدم مسبقاً')), JSON.stringify(rowErrors(r.json,2)));
  r = await upload('teams-with-leader', csv([
    ['teamName','hackathonTrack','leaderEmail','leaderFullName'],
    [`${TAG} جديد1`, TRACK, `${TAG}-lead@t.local`, 'x']]), { cookie: aCookie });
  check('leader email already used -> error', rowErrors(r.json,2).some(e=>e.includes('مسجل مسبقاً')), JSON.stringify(rowErrors(r.json,2)));
  r = await upload('teams-with-leader', csv([
    ['teamName','hackathonTrack','leaderEmail','leaderFullName'],
    [`${TAG} ج2`, TRACK, `${TAG}-same@t.local`, 'a'],
    [`${TAG} ج3`, TRACK, `${TAG}-same@t.local`, 'b']]), { cookie: aCookie });
  check('duplicate leader email in file -> error', rowErrors(r.json,3).some(e=>e.includes('مكرر داخل الملف')), JSON.stringify(rowErrors(r.json,3)));
  r = await upload('teams-with-leader', csv([
    ['teamName','hackathonTrack','leaderEmail','leaderFullName'],
    [`${TAG} ج4`, TRACK, 'bad-email', 'x']]), { cookie: aCookie });
  check('invalid leader email -> error', rowErrors(r.json,2).some(e=>e.includes('غير صالح')), JSON.stringify(rowErrors(r.json,2)));
  r = await upload('teams-with-leader', csv([
    ['teamName','hackathonTrack','leaderEmail','leaderFullName'],
    [`${TAG} ج5`, TRACK, `${TAG}-nolead@t.local`, '']]), { cookie: aCookie });
  check('missing leader name -> error', rowErrors(r.json,2).some(e=>e.includes('مطلوب')), JSON.stringify(rowErrors(r.json,2)));
  const beforeAtomic = await prisma.team.count({ where: { teamName: { startsWith: `${TAG} atomic` } } });
  r = await upload('teams-with-leader', csv([
    ['teamName','hackathonTrack','leaderEmail','leaderFullName'],
    [`${TAG} atomic-ok`, TRACK, `${TAG}-at1@t.local`, 'ok'],
    [`${TAG} atomic-bad`, 'مسار وهمي', `${TAG}-at2@t.local`, 'bad']]), { commit: true, cookie: aCookie });
  check('combined: bad row blocks the whole commit', r.status === 400 && r.json.committed === false);
  check('combined: no team created from the good row either',
        (await prisma.team.count({ where: { teamName: { startsWith: `${TAG} atomic` } } })) === beforeAtomic);

  section('converter: real export layout -> import file -> upload');
  const fs2 = require('fs');
  const os = require('os');
  const { execFileSync } = require('child_process');
  // Rebuild the exact awkward shape of user_template/users.xlsx:
  // 3 metadata lines, blank column A, header on row 6.
  const srcHeader = ['', 'Author Id','Author','Author - Email','Number of Team Members','Phone number','Full Name',
    'Submitted On','Date of birth','Gender','Professional Status','City','Team / Company Name (if any)',
    "Team Members’ Information",'Path','Sub Track','Project Name','Brief Description (2-4 lines)'];
  const mkSrcRow = (o) => { const r = new Array(srcHeader.length).fill('');
    r[3]=o.email; r[5]=o.phone; r[6]=o.name; r[9]=o.gender; r[15]=o.subTrack; r[16]=o.project; r[17]=o.brief;
    r[18]=o.attend; return r; };
  const srcAoa = [[], ['', 'Digital Technologies & AI'], ['', 'Active'], ['', 'Exported on: 3/9/2026'], [], srcHeader,
    mkSrcRow({ email:`${TAG}-C1@T.LOCAL`, phone:'0501234567', name:'محمد علي', gender:'Male',
               subTrack:'Digital Technologies & AI', project:`${TAG} مشروع واحد`, brief:'وصف المشروع الأول', attend:'Yes' }),
    mkSrcRow({ email:`${TAG}-c2@t.local`, phone:'0559876543', name:'نورة سعد', gender:'Female',
               subTrack:'Water Infrastructure', project:`${TAG} مشروع اثنان`, brief:'وصف المشروع الثاني', attend:'No' }),
    mkSrcRow({ email:`${TAG}-c3@t.local`, phone:'0500000003', name:'خالد', gender:'Male',
               subTrack:'Totally Unknown Track', project:`${TAG} مشروع ثلاثة`, brief:'وصف ثالث', attend:'Maybe later' }),
  ];
  // the attendance question header sits at index 18 in our synthetic sheet
  srcAoa[5][18] = 'If you qualify for the final phase, does attending the final hackathon in Jeddah from December 14 to 16 suit you?';
  const srcWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(srcWb, XLSX.utils.aoa_to_sheet(srcAoa), 'Ideas');
  const srcPath = path.join(os.tmpdir(), `${TAG}-src.xlsx`);
  const outDir = path.join(os.tmpdir(), `${TAG}-out`);          // directory now
  const outBase = path.join(outDir, 'teams-with-leader');       // files land here
  XLSX.writeFile(srcWb, srcPath);

  const conv = execFileSync('node', [path.join(REPO, 'scripts/convert-users-export.js'), srcPath, outDir], { encoding: 'utf8' });
  check('converter located the header row by name (not a fixed index)', /Header found on sheet "Ideas", row \d+/.test(conv), conv.split('\n')[0]);
  check('converter read 3 data rows', /Data rows: 3/.test(conv));
  check('converter wrote into the given DIRECTORY', fs2.existsSync(`${outBase}.xlsx`) && fs2.existsSync(`${outBase}.csv`), outDir);
  // the REAL export from the client: header genuinely sits on row 6
  const realSrc = path.join(REPO, 'user_template/users.xlsx');
  if (fs2.existsSync(realSrc)) {
    const realDir = path.join(os.tmpdir(), `${TAG}-real`);
    const realOut = execFileSync('node', [path.join(REPO, 'scripts/convert-users-export.js'), realSrc, realDir], { encoding: 'utf8' });
    check('real users.xlsx: header found on row 6', /row 6/.test(realOut), realOut.split('\n')[0]);
    check('real users.xlsx: converter reports a row count', /Data rows: \d+/.test(realOut), realOut.match(/Data rows: \d+/)?.[0]);
    try { fs2.rmSync(realDir, { recursive: true, force: true }); } catch {}
  }
  check('converter flagged the unknown track', /مسار غير معروف/.test(conv), conv.slice(-300));

  const convOut = XLSX.utils.sheet_to_json(XLSX.readFile(`${outBase}.xlsx`).Sheets['الفرق مع القائد'], { defval:'', raw:false });
  check('converted 3 rows', convOut.length === 3, String(convOut.length));
  const c1 = convOut.find(x => x.teamName === `${TAG} مشروع واحد`);
  check('English sub-track mapped to the Arabic challenge', c1 && c1.hackathonTrack === 'التقنيات الرقمية والذكاء الاصطناعي', c1 && c1.hackathonTrack);
  check('Male -> ذكر, Yes -> TRUE', c1 && c1.leaderGender === 'ذكر' && c1.leaderCanAttendHackathon === 'TRUE', JSON.stringify(c1));
  check('email lower-cased', c1 && c1.leaderEmail === `${TAG}-c1@t.local`.toLowerCase(), c1 && c1.leaderEmail);
  check('phone leading zero preserved through conversion', c1 && c1.leaderContactNumber === '0501234567', c1 && c1.leaderContactNumber);
  const c2 = convOut.find(x => x.teamName === `${TAG} مشروع اثنان`);
  check('Water Infrastructure mapped, Female -> أنثى, No -> FALSE',
        c2 && c2.hackathonTrack === 'البنية التحتية للمياه' && c2.leaderGender === 'أنثى' && c2.leaderCanAttendHackathon === 'FALSE', JSON.stringify(c2));
  const c3 = convOut.find(x => x.teamName === `${TAG} مشروع ثلاثة`);
  check('unknown track left BLANK (not guessed)', c3 && c3.hackathonTrack === '', JSON.stringify(c3));

  // the converter output must be directly importable once the blank track is filled
  const fixed = convOut.map(x => ({ ...x, hackathonTrack: x.hackathonTrack || TRACK }));
  const fixedAoa = [Object.keys(convOut[0]), ...fixed.map(o => Object.keys(convOut[0]).map(k => o[k]))];
  const fixedWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(fixedWb, XLSX.utils.aoa_to_sheet(fixedAoa), 'الفرق مع القائد');
  r = await upload('teams-with-leader', XLSX.write(fixedWb, { type:'buffer', bookType:'xlsx' }),
                   { commit: true, cookie: aCookie, filename: 'converted.xlsx' });
  check('converter output imports cleanly: 3 teams created', r.status === 200 && r.json.created === 3, JSON.stringify(r.json).slice(0,160));
  const madeTeams = await prisma.team.findMany({ where: { teamName: { startsWith: `${TAG} مشروع` } }, include: { participants: true } });
  check('each converted team has exactly one leader', madeTeams.length === 3 && madeTeams.every(t => t.participants.length === 1 && t.participants[0].isLeader), String(madeTeams.length));
  check('all converted records are pending', madeTeams.every(t => t.status === 'pending' && t.participants[0].status === 'pending'));
  fs2.unlinkSync(srcPath); fs2.rmSync(outDir, { recursive: true, force: true });


  section('imported users are readable everywhere (no "null null null")');
  // The dashboards still read the DEPRECATED columns, and several endpoints
  // concatenate them without null guards. The import must mirror the new
  // fields into them exactly as /api/register-team does.
  const mirrored = await prisma.participant.findFirst({ where: { email: `${TAG}-lead@t.local` } });
  check('deprecated firstName mirrored from fullName', mirrored.firstName === 'قائد الفريق', JSON.stringify(mirrored.firstName));
  check('deprecated phoneNumber mirrored from contactNumber', mirrored.phoneNumber === '0507777777', JSON.stringify(mirrored.phoneNumber));
  check('deprecated name parts are empty strings, never null',
        mirrored.secondName === '' && mirrored.familyName === '' && mirrored.nationalId === '' && mirrored.dob === '',
        JSON.stringify({ s: mirrored.secondName, f: mirrored.familyName }));
  check('deprecated nationality/residence/canAttend mirrored',
        mirrored.nationality === 'ذكر' && mirrored.residence === '' && mirrored.canAttend === true,
        JSON.stringify({ n: mirrored.nationality, r: mirrored.residence, c: mirrored.canAttend }));

  // and the endpoint that actually rendered "null null null"
  await prisma.participant.update({ where: { id: mirrored.id }, data: { passwordHash: 'x', status: 'approved' } });
  await prisma.team.update({ where: { id: mirrored.teamId }, data: { status: 'approved' } });
  const leadCookie = cookie({ id: mirrored.id, participantId: mirrored.id, email: mirrored.email, role: 'participant', teamId: mirrored.teamId, isLeader: true });
  const tdRes = await fetch(BASE + '/api/participant/team-details', { headers: { cookie: leadCookie } });
  const td = await tdRes.json().catch(() => ({}));
  const mems = td?.participants || td?.members || td?.team?.participants || [];
  check('team-details shows the real name, not "null null null"',
        mems.length > 0 && mems[0].fullName === 'قائد الفريق', JSON.stringify(mems[0] && mems[0].fullName));
  check('no member name contains the string "null"',
        mems.every((m) => !String(m.fullName).includes('null')), JSON.stringify(mems.map((m) => m.fullName)));


  section('scale: a large file imports in a few statements (P2028 regression)');
  // The old implementation issued one create() per row inside an INTERACTIVE
  // transaction — two per row here. Against the production pooler that blew
  // through Prisma's 5s interactive timeout after ~25-50 rows and failed with
  // P2028. createMany makes this two statements regardless of size.
  const BIG = 300;
  const bigRows = [['teamName','hackathonTrack','ideaDescription','leaderEmail','leaderFullName','leaderContactNumber','leaderGender','leaderCanAttendHackathon']];
  for (let i = 0; i < BIG; i++) {
    bigRows.push([`${TAG} كبير ${i}`, TRACK, `فكرة ${i}`, `${TAG}-big${i}@t.local`, `قائد ${i}`, '0501234567', i % 2 ? 'ذكر' : 'أنثى', 'TRUE']);
  }
  const t0 = Date.now();
  r = await upload('teams-with-leader', csv(bigRows), { commit: true, cookie: aCookie });
  const took = Date.now() - t0;
  check(`${BIG} rows committed in one request`, r.status === 200 && r.json.created === BIG, JSON.stringify(r.json).slice(0, 140));
  console.log(`      ${BIG} teams + ${BIG} leaders in ${took}ms`);
  const bigTeams = await prisma.team.count({ where: { teamName: { startsWith: `${TAG} كبير` } } });
  const bigLeads = await prisma.participant.count({ where: { email: { startsWith: `${TAG}-big` } } });
  check(`${BIG} teams and ${BIG} leaders actually created`, bigTeams === BIG && bigLeads === BIG, `${bigTeams}/${bigLeads}`);
  const sample = await prisma.participant.findFirst({ where: { email: `${TAG}-big7@t.local` }, include: { team: true } });
  check('each leader still linked to its OWN team (ids not shuffled)',
        sample && sample.team && sample.team.teamName === `${TAG} كبير 7`, sample && sample.team && sample.team.teamName);
  check('bulk-created rows still pending, leader-flagged, legacy mirrored',
        sample.status === 'pending' && sample.isLeader === true && sample.firstName === 'قائد 7' && sample.phoneNumber === '0501234567',
        JSON.stringify({ s: sample.status, l: sample.isLeader, f: sample.firstName, p: sample.phoneNumber }));
  // large participants-only import too
  const bigP = [['email','fullName','contactNumber']];
  for (let i = 0; i < BIG; i++) bigP.push([`${TAG}-p${i}@t.local`, `مشارك ${i}`, '0559876543']);
  r = await upload('participants', csv(bigP), { commit: true, cookie: aCookie });
  check(`${BIG} participants committed`, r.status === 200 && r.json.created === BIG, JSON.stringify(r.json).slice(0, 120));

  section('cleanup');
  await prisma.participant.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.participant.deleteMany({ where: { team: { is: { teamName: { startsWith: TAG } } } } });
  await prisma.team.deleteMany({ where: { teamName: { startsWith: TAG } } });
  await prisma.participant.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.mentor.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.admin.delete({ where: { id: admin.id } });
  console.log('  cleaned up');

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('CRASH', e); await prisma.$disconnect(); process.exit(1); });
