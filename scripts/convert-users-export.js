/**
 * Converts a registration-platform export (e.g. user_template/users.xlsx) into
 * the "teams with leader" import template that /admin-hackton-dashboard/import
 * accepts.
 *
 *   node scripts/convert-users-export.js [input.xlsx] [output-basename]
 *   node scripts/convert-users-export.js user_template/users.xlsx imports/converted
 *
 * Writes <output>.csv and <output>.xlsx, plus prints a report of anything it
 * could not map. Every row in the source is treated as a TEAM LEADER, so each
 * produces one team + one leader.
 *
 * The source layout is awkward and is handled explicitly:
 *   - three metadata lines before the header, and a blank first column
 *   - the header row is FOUND by looking for "Author - Email", never assumed
 *     to be at a fixed index
 *   - columns are matched BY NAME, so added/reordered columns do not break it
 *   - "Sub Track" is in English and must be mapped to our Arabic challenges
 *
 * Anything it cannot map confidently is reported and left blank rather than
 * guessed — a wrong track is worse than an empty one you can fix in Excel.
 */
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..');
const XLSX = require(path.join(REPO, 'node_modules/xlsx'));

const INPUT = process.argv[2] || path.join(REPO, 'user_template/users.xlsx');
/**
 * Output location. An argument without a file extension is treated as a
 * DIRECTORY and the files are written inside it, so
 *   node scripts/convert-users-export.js user_template/users.xlsx imports/converted
 * produces imports/converted/teams-with-leader.csv|.xlsx
 */
const OUT_ARG = process.argv[3] || path.join(REPO, 'imports/converted');
const OUT_BASE = path.extname(OUT_ARG) === '' ? path.join(OUT_ARG, 'teams-with-leader') : OUT_ARG.replace(/\.(csv|xlsx)$/i, '');

/** Source column -> our template column. Matched case/space-insensitively. */
const COLUMN_MAP = {
  'Author - Email': 'leaderEmail',
  //'Name': 'leaderFullName',
  'Full Name': 'leaderFullName',
  'Phone number': 'leaderContactNumber',
  'Gender': 'leaderGender',
  'Sub Track': 'hackathonTrack',
  'Project Name': 'teamName',
  'Brief Description (2-4 lines)': 'ideaDescription',
  'If you qualify for the final phase, does attending the final hackathon in Jeddah from December 14 to 16 suit you?': 'leaderCanAttendHackathon',
};

// Track resolution comes from src/lib/challenges.ts — the SAME resolver the
// import validator uses, so a track maps identically whether you convert the
// file here or upload the English export directly to the website.
const { execFileSync } = require('child_process');
const CACHE = path.join(REPO, 'node_modules', '.cache', 'convert-users');
fs.mkdirSync(CACHE, { recursive: true });
fs.writeFileSync(path.join(CACHE, 'tsconfig.json'), JSON.stringify({
  compilerOptions: { module: 'commonjs', target: 'es2020', esModuleInterop: true, skipLibCheck: true,
                     moduleResolution: 'node', outDir: CACHE, rootDir: path.join(REPO, 'src'), strict: false },
  files: [path.join(REPO, 'src/lib/challenges.ts')],
}));
execFileSync(path.join(REPO, 'node_modules/.bin/tsc'), ['-p', path.join(CACHE, 'tsconfig.json')], { stdio: 'inherit' });
const { resolveChallenge } = require(path.join(CACHE, 'lib/challenges.js'));

const OUT_COLUMNS = [
  'teamName', 'hackathonTrack', 'ideaDescription', 'hearAboutUs',
  'leaderEmail', 'leaderFullName', 'leaderContactNumber', 'leaderGender',
  'leaderIsUniversityStudent', 'leaderUniversity', 'leaderUniversityMajor',
  'leaderProfessionalField', 'leaderCity', 'leaderCanAttendHackathon',
];

const norm = (v) => String(v ?? '').replace(/\s+/g, ' ').replace(/[‏‎]/g, '').trim();
const key = (v) => norm(v).toLowerCase();

function mapTrack(raw) {
  if (!norm(raw)) return { value: '', note: null };
  const hit = resolveChallenge(norm(raw));
  return hit
    ? { value: hit, note: null }
    : { value: '', note: `مسار غير معروف: "${norm(raw)}" — يجب أن يكون أحد المسارات الخمسة الرئيسية` };
}

function mapGender(raw) {
  const v = key(raw);
  if (!v) return { value: '', note: null };
  if (['male', 'm', 'ذكر'].includes(v)) return { value: 'ذكر', note: null };
  if (['female', 'f', 'أنثى', 'انثى'].includes(v)) return { value: 'أنثى', note: null };
  return { value: '', note: `جنس غير معروف: "${norm(raw)}"` };
}

function mapYesNo(raw) {
  const v = key(raw);
  if (!v) return { value: '', note: null };
  if (/^(yes|y|true|نعم|أجل)/.test(v)) return { value: 'TRUE', note: null };
  if (/^(no|n|false|لا)/.test(v)) return { value: 'FALSE', note: null };
  return { value: '', note: `إجابة غير واضحة للحضور: "${norm(raw).slice(0, 40)}"` };
}

/**
 * Normalise a Saudi phone number.
 *
 * The source export stores phones as NUMBERS, so "0551721007" arrives as
 * 551721007 — the leading zero is already gone before we see it. Saudi mobiles
 * are 10 digits beginning 05, so a bare 9-digit number starting with 5 is
 * restored to its 05… form. International forms are normalised too. Anything
 * that does not fit a known shape is left exactly as-is and reported.
 */
function cleanPhone(raw) {
  const digits = norm(raw).replace(/[^\d+]/g, '');
  if (!digits) return { value: '', note: null };
  const bare = digits.replace(/^\+/, '');
  if (/^9665\d{8}$/.test(bare)) return { value: '0' + bare.slice(3), note: null };      // +966 5XXXXXXXX
  if (/^05\d{8}$/.test(bare)) return { value: bare, note: null };                        // already correct
  if (/^5\d{8}$/.test(bare)) {
    return { value: '0' + bare, note: `أُضيف صفر مفقود لرقم الجوال: ${bare} ← 0${bare}` };
  }
  return { value: bare, note: `رقم جوال بصيغة غير معتادة: ${bare}` };
}

// ---------------------------------------------------------------------------
if (!fs.existsSync(INPUT)) {
  console.error(`Input not found: ${INPUT}`);
  process.exit(1);
}
const wb = XLSX.readFile(INPUT, { raw: false });
const sheet = wb.Sheets[wb.SheetNames[0]];
const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, blankrows: true });

// find the header row by looking for the email column, not by position
const headerIdx = matrix.findIndex((row) => row.some((c) => key(c) === key('Author - Email')));
if (headerIdx === -1) {
  console.error('Could not find a header row containing "Author - Email".');
  console.error('Sheets: ' + wb.SheetNames.join(', '));
  process.exit(1);
}
const header = matrix[headerIdx].map(norm);
console.log(`Header found on sheet "${wb.SheetNames[0]}", row ${headerIdx + 1}.`);

// resolve each wanted source column to its index
const colIndex = {};
const missing = [];
for (const [src, dest] of Object.entries(COLUMN_MAP)) {
  let i = header.findIndex((h) => key(h) === key(src));
  if (i === -1) i = header.findIndex((h) => key(h).startsWith(key(src).slice(0, 40)));
  if (i === -1) missing.push(src);
  else colIndex[dest] = i;
}
if (missing.length) {
  console.warn('\n⚠ Source columns not found (left blank in the output):');
  for (const m of missing) console.warn('   - ' + m);
}

const dataRows = matrix.slice(headerIdx + 1).filter((r) => r.some((c) => norm(c) !== ''));
console.log(`Data rows: ${dataRows.length}`);
if (dataRows.length === 0) {
  console.warn('\n⚠ The file contains headers but NO data rows — nothing to convert.');
  console.warn('  Re-export it with the applications included, then run this again.');
}

const out = [];
const issues = [];
dataRows.forEach((row, i) => {
  const srcRowNumber = headerIdx + 2 + i;
  const get = (dest) => (colIndex[dest] === undefined ? '' : norm(row[colIndex[dest]]));

  const track = mapTrack(get('hackathonTrack'));
  const gender = mapGender(get('leaderGender'));
  const attend = mapYesNo(get('leaderCanAttendHackathon'));
  const phone = cleanPhone(get('leaderContactNumber'));
  for (const n of [track.note, gender.note, attend.note, phone.note].filter(Boolean)) {
    issues.push({ row: srcRowNumber, issue: n });
  }

  const rec = {
    teamName: get('teamName'),
    hackathonTrack: track.value,
    ideaDescription: get('ideaDescription'),
    hearAboutUs: '',
    leaderEmail: get('leaderEmail').toLowerCase(),
    leaderFullName: get('leaderFullName'),
    leaderContactNumber: phone.value,
    leaderGender: gender.value,
    leaderIsUniversityStudent: '',
    leaderUniversity: '',
    leaderUniversityMajor: '',
    leaderProfessionalField: '',
    leaderCity: '',
    leaderCanAttendHackathon: attend.value,
  };
  if (!rec.teamName) issues.push({ row: srcRowNumber, issue: 'اسم الفريق (Project Name) فارغ' });
  if (!rec.leaderEmail) issues.push({ row: srcRowNumber, issue: 'بريد القائد (Author - Email) فارغ' });
  if (!rec.leaderFullName) issues.push({ row: srcRowNumber, issue: 'اسم القائد (Full Name) فارغ' });
  out.push(rec);
});

// duplicate team names / emails would be rejected by the importer — flag early
const dup = (field, label) => {
  const seen = new Map();
  out.forEach((r, i) => {
    const v = (r[field] || '').toLowerCase();
    if (!v) return;
    if (seen.has(v)) issues.push({ row: headerIdx + 2 + i, issue: `${label} مكرر: "${r[field]}"` });
    else seen.set(v, i);
  });
};
dup('teamName', 'اسم الفريق');
dup('leaderEmail', 'بريد القائد');

// ---- write outputs --------------------------------------------------------
fs.mkdirSync(path.dirname(OUT_BASE), { recursive: true });
const aoa = [OUT_COLUMNS, ...out.map((r) => OUT_COLUMNS.map((c) => r[c] ?? ''))];

const csvCell = (v) => (/[",\n\r]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
fs.writeFileSync(`${OUT_BASE}.csv`, '﻿' + aoa.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n', 'utf8');

const owb = XLSX.utils.book_new();
// force every cell to text so phone numbers keep a leading zero in Excel
const ws = XLSX.utils.aoa_to_sheet(aoa, { cellText: true });
for (const ref of Object.keys(ws)) if (!ref.startsWith('!')) { ws[ref].t = 's'; ws[ref].z = '@'; }
ws['!cols'] = OUT_COLUMNS.map(() => ({ wch: 24 }));
ws['!views'] = [{ RTL: true }];
XLSX.utils.book_append_sheet(owb, ws, 'الفرق مع القائد');
if (issues.length) {
  const iws = XLSX.utils.aoa_to_sheet([['الصف في الملف الأصلي', 'الملاحظة'], ...issues.map((i) => [i.row, i.issue])]);
  iws['!cols'] = [{ wch: 20 }, { wch: 70 }];
  iws['!views'] = [{ RTL: true }];
  XLSX.utils.book_append_sheet(owb, iws, 'ملاحظات');
}
XLSX.writeFile(owb, `${OUT_BASE}.xlsx`);

console.log(`\nWrote ${out.length} row(s):`);
console.log('  ' + OUT_BASE + '.csv');
console.log('  ' + OUT_BASE + '.xlsx');
if (issues.length) {
  console.log(`\n⚠ ${issues.length} issue(s) to review before importing:`);
  for (const i of issues.slice(0, 25)) console.log(`   row ${i.row}: ${i.issue}`);
  if (issues.length > 25) console.log(`   ... and ${issues.length - 25} more (see the "ملاحظات" sheet)`);
} else if (out.length) {
  console.log('\n✓ No issues. Upload the file at /admin-hackton-dashboard/import → «الفرق مع القائد».');
}
