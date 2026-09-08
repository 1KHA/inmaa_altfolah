/**
 * Generates the fillable import templates in /imports.
 *
 * Re-run after a schema change so the templates never drift:
 *   node scripts/generate-import-templates.js
 *
 * Produces, for participants / teams / mentors:
 *   <entity>-template.csv   header row only — the file you fill in
 *   <entity>-example.csv    the same columns with sample rows, for reference
 * plus one Excel workbook containing all of them with an instructions sheet.
 *
 * Design rules (see imports/README.md):
 *   - Column names are the EXACT Prisma field names, so an importer can map
 *     them 1:1 with no translation table.
 *   - `status` is deliberately NOT a column: everything must import as
 *     "pending" so the admin approves it afterwards. A column would invite a
 *     typo that silently approves people.
 *   - Participants are linked to teams by `teamName`, not by id — ids do not
 *     exist until the rows are created.
 */
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..');
const OUT = path.join(REPO, 'imports');
const XLSX = require(path.join(REPO, 'node_modules/xlsx'));

// Column specs come from src/lib/import-schema.ts — the SAME definitions the
// import API validates against, compiled on the fly so the templates and the
// validator can never disagree about a column.
const { execFileSync } = require('child_process');
const CACHE = path.join(REPO, 'node_modules', '.cache', 'import-templates');
fs.mkdirSync(CACHE, { recursive: true });
fs.writeFileSync(path.join(CACHE, 'tsconfig.json'), JSON.stringify({
  compilerOptions: { module: 'commonjs', target: 'es2020', esModuleInterop: true, skipLibCheck: true,
                     moduleResolution: 'node', outDir: CACHE, rootDir: path.join(REPO, 'src'), strict: false },
  files: [path.join(REPO, 'src/lib/import-schema.ts')],
}));
execFileSync(path.join(REPO, 'node_modules/.bin/tsc'), ['-p', path.join(CACHE, 'tsconfig.json')], { stdio: 'inherit' });
const { IMPORT_SPECS, PROFESSIONAL_FIELDS } = require(path.join(CACHE, 'lib/import-schema.js'));
const { CHALLENGES } = require(path.join(CACHE, 'lib/challenges.js'));

/** [column, Arabic label, required?, note] rows, derived from the shared spec. */
const toRows = (entity) =>
  IMPORT_SPECS[entity].columns.map((c) => [c.key, c.labelAr, c.required ? 'مطلوب' : 'اختياري', c.note]);
const PARTICIPANTS = toRows('participants');
const TEAMS = toRows('teams');
const MENTORS = toRows('mentors');
const TEAMS_WITH_LEADER = toRows('teams-with-leader');

const EXAMPLES = {
  participants: [
    ['sara@example.com',  'سارة عبدالله', '0501111111', 'أنثى', 'TRUE',  'جامعة الملك سعود', 'علوم حاسب', 'برمجة',        'https://github.com/sara',  'TRUE',  'فريق المياه', 'TRUE'],
    ['omar@example.com',  'عمر خالد',     '0502222222', 'ذكر',  'TRUE',  'جامعة الملك سعود', 'هندسة',      'علم البيانات', 'https://github.com/omar',  'TRUE',  'فريق المياه', 'FALSE'],
    ['huda@example.com',  'هدى فهد',      '0503333333', 'أنثى', 'FALSE', '',                 '',           'ذكاء اصناعي',  'https://github.com/huda',  'FALSE', '',            'FALSE'],
  ],
  teams: [
    ['فريق المياه', CHALLENGES[1], 'حل ذكي لرصد تسربات شبكات المياه', 'تويتر'],
  ],
  mentors: [
    ['د. أحمد الزهراني', 'ahmed.mentor@example.com', 'الذكاء الاصطناعي', '0504444444'],
    ['م. ليلى الحربي',   'laila.mentor@example.com', 'هندسة المياه',     '0505555555'],
  ],
  'teams-with-leader': [
    ['فريق المياه', CHALLENGES[1], 'حل ذكي لرصد تسربات شبكات المياه', 'تويتر',
     'sara@example.com', 'سارة عبدالله', '0501111111', 'أنثى', 'TRUE',
     'جامعة الملك سعود', 'علوم حاسب', 'برمجة', 'https://github.com/sara', 'TRUE'],
    ['فريق الاستدامة', CHALLENGES[3], 'منصة لترشيد الاستهلاك المنزلي', 'صديق',
     'omar@example.com', 'عمر خالد', '0502222222', 'ذكر', 'FALSE',
     '', '', 'علم البيانات', 'https://github.com/omar', 'TRUE'],
  ],
};

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
// BOM so Excel reads the Arabic correctly instead of mojibake.
const writeCsv = (file, rows) =>
  fs.writeFileSync(file, '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n', 'utf8');

fs.mkdirSync(OUT, { recursive: true });

const SPECS = { 'teams-with-leader': TEAMS_WITH_LEADER, participants: PARTICIPANTS, teams: TEAMS, mentors: MENTORS };
for (const [name, spec] of Object.entries(SPECS)) {
  const headers = spec.map((c) => c[0]);
  writeCsv(path.join(OUT, `${name}-template.csv`), [headers]);
  writeCsv(path.join(OUT, `${name}-example.csv`), [headers, ...EXAMPLES[name]]);
}

// ---- one workbook with everything -----------------------------------------
const wb = XLSX.utils.book_new();
const rtl = (ws) => { ws['!views'] = [{ RTL: true }]; return ws; };

const instructions = [
  ['تعليمات تعبئة ملفات الاستيراد'],
  [],
  ['1. لا تُغيّر أسماء الأعمدة (الصف الأول) — هي أسماء الحقول في قاعدة البيانات.'],
  ['2. جميع السجلات تُستورد بحالة "قيد المراجعة" (pending) ولا تُقبل تلقائياً.'],
  ['   لهذا لا يوجد عمود للحالة إطلاقاً — القبول يتم لاحقاً من لوحة التحكم.'],
  ['3. المشاركون لا تُنشأ لهم كلمات مرور عند الاستيراد. كلمة المرور تُنشأ وتُرسل بالبريد عند القبول.'],
  ['4. اربط المشارك بفريقه عبر عمود teamName بحيث يطابق اسم الفريق في ورقة "الفرق" تماماً.'],
  ['5. اترك teamName فارغاً للمشارك الفردي (بدون فريق).'],
  ['6. ضع isLeader = TRUE لعضو واحد فقط في كل فريق.'],
  ['7. القيم المنطقية تُكتب TRUE أو FALSE.'],
  ['8. البريد الإلكتروني يجب أن يكون فريداً؛ أي تكرار سيُرفض.'],
  ['9. استورد الفرق أولاً ثم المشاركين، لأن المشاركين يشيرون إلى أسماء الفرق.'],
  ['10. الأسهل: استخدم ورقة «الفرق مع القائد» — كل صف يُنشئ الفريق وقائده معاً في خطوة واحدة.'],
  [],
  ['ملاحظة: الحقل city يُستخدم في نموذج التسجيل العام لرابط Github — راجع imports/README.md.'],
];
XLSX.utils.book_append_sheet(wb, rtl(XLSX.utils.aoa_to_sheet(instructions)), 'تعليمات');

const sheetFor = (spec, examples) => {
  const aoa = [spec.map((c) => c[0]), ...examples];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = spec.map(() => ({ wch: 26 }));
  return rtl(ws);
};
XLSX.utils.book_append_sheet(wb, sheetFor(TEAMS_WITH_LEADER, EXAMPLES['teams-with-leader']), 'الفرق مع القائد');
XLSX.utils.book_append_sheet(wb, sheetFor(TEAMS, EXAMPLES.teams), 'الفرق');
XLSX.utils.book_append_sheet(wb, sheetFor(PARTICIPANTS, EXAMPLES.participants), 'المشاركون');
XLSX.utils.book_append_sheet(wb, sheetFor(MENTORS, EXAMPLES.mentors), 'الموجهون');

const dict = [['الملف', 'العمود', 'الاسم بالعربية', 'إلزامي؟', 'ملاحظات']];
for (const [file, spec] of [['الفرق مع القائد', TEAMS_WITH_LEADER], ['المشاركون', PARTICIPANTS], ['الفرق', TEAMS], ['الموجهون', MENTORS]])
  for (const c of spec) dict.push([file, c[0], c[1], c[2], c[3]]);
const dictWs = XLSX.utils.aoa_to_sheet(dict);
dictWs['!cols'] = [{ wch: 14 }, { wch: 22 }, { wch: 26 }, { wch: 10 }, { wch: 70 }];
XLSX.utils.book_append_sheet(wb, rtl(dictWs), 'دليل الحقول');

const allowed = [['المسارات المعتمدة (hackathonTrack)'], ...CHALLENGES.map((c) => [c]), [],
                 ['المجال المهني (professionalField)'], ...PROFESSIONAL_FIELDS.map((c) => [c]), [],
                 ['الجنس (gender)'], ['ذكر'], ['أنثى'], [],
                 ['القيم المنطقية'], ['TRUE'], ['FALSE']];
const allowedWs = XLSX.utils.aoa_to_sheet(allowed);
allowedWs['!cols'] = [{ wch: 46 }];
XLSX.utils.book_append_sheet(wb, rtl(allowedWs), 'القيم المسموحة');

XLSX.writeFile(wb, path.join(OUT, 'hackathon-import-template.xlsx'));

console.log('Wrote to', OUT);
for (const f of fs.readdirSync(OUT).sort()) console.log('  ' + f);
