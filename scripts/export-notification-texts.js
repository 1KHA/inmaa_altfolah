/**
 * Export every notification / email text in the platform to CSV + XLSX for review.
 *
 * Covers:
 *   1. All 26 editable templates from the settings page
 *      (/admin-hackton-dashboard/settings -> إشعارات المشاركين / المشرفين / المرشدين),
 *      i.e. TEMPLATE_DEFAULTS in src/lib/notify.ts merged with any admin
 *      customisation stored in the NotificationTemplate table.
 *   2. Emails that are NOT editable there (hardcoded in routes) — password
 *      reset, the admin test email, the shared HTML shell footer — so an audit
 *      sees the complete outbound text surface.
 *
 * Each row also records WHERE the template fires from (scanned from the source)
 * and whether the live text differs from the code default.
 *
 * Usage:
 *   node scripts/export-notification-texts.js [outDir]
 *
 *   # include admin customisations from a database:
 *   DATABASE_URL=postgresql://... node scripts/export-notification-texts.js
 *
 * Without DATABASE_URL it exports the code defaults only and says so.
 * Output: <outDir>/notification-texts.csv (UTF-8 BOM, opens correctly in Excel)
 *         <outDir>/notification-texts.xlsx (RTL, frozen header, wrapped cells)
 * See mdfiles/notification-texts-audit.md.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(process.argv[2] || path.join(REPO, 'exports'));
const CACHE = path.join(REPO, 'node_modules', '.cache', 'notify-export');

// ---- compile src/lib/notify.ts so we can read TEMPLATE_DEFAULTS -------------
fs.mkdirSync(CACHE, { recursive: true });
fs.writeFileSync(
  path.join(CACHE, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      module: 'commonjs', target: 'es2020', esModuleInterop: true,
      skipLibCheck: true, moduleResolution: 'node', outDir: CACHE,
      rootDir: path.join(REPO, 'src'), strict: false,
    },
    files: [path.join(REPO, 'src/lib/notify.ts')],
  })
);
execFileSync(path.join(REPO, 'node_modules/.bin/tsc'), ['-p', path.join(CACHE, 'tsconfig.json')], { stdio: 'inherit' });

// PrismaClient is constructed at import time; give it a placeholder so the
// export works with no database configured (it never connects unless queried).
const hasDb = Boolean(process.env.DATABASE_URL);
if (!hasDb) process.env.DATABASE_URL = 'postgresql://placeholder:5432/none';

const { TEMPLATE_DEFAULTS } = require(path.join(CACHE, 'lib/notify.js'));

// ---- where does each template actually fire from? --------------------------
/**
 * Finds the emission site(s) for every template key.
 *
 * Matching `templateKey: 'x'` alone is NOT enough: some call sites choose the
 * key dynamically, e.g.
 *   templateKey: reviewStatus === 'accepted' ? 'milestoneReviewAccepted' : '...'
 * so we look for the quoted key anywhere in the app/hook sources instead.
 * The two template CATALOGUES and the demo seeder are excluded — a key
 * appearing there is a definition, not a trigger.
 */
const CATALOGUE_FILES = new Set([
  'src/lib/notify.ts',            // the live catalogue (TEMPLATE_DEFAULTS)
  'src/lib/notifications.ts',     // legacy catalogue, only used by the seeder
  'src/lib/seed-notifications.ts' // demo data
]);

function scanTriggers(keys) {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(entry.name)) files.push(p);
    }
  };
  walk(path.join(REPO, 'src'));

  const hits = {};
  for (const file of files) {
    const rel = path.relative(REPO, file);
    if (CATALOGUE_FILES.has(rel)) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const key of keys) {
        if (line.includes(`'${key}'`) || line.includes(`"${key}"`)) {
          (hits[key] ||= []).push(`${rel}:${i + 1}`);
        }
      }
    });
  }
  return hits;
}

// ---- emails that bypass the template system --------------------------------
const HARDCODED = [
  {
    key: '(hardcoded) forgotPassword',
    label: 'إعادة تعيين كلمة المرور',
    category: 'participant/mentor/admin',
    type: 'info',
    dashboardTitle: '', dashboardMessage: '',
    emailSubject: 'إعادة تعيين كلمة المرور',
    emailBody:
      'وصلنا طلب لإعادة تعيين كلمة المرور الخاصة بحسابك.\n\n' +
      'لإعادة التعيين افتح الرابط التالي (صالح لمدة 30 دقيقة):\n{resetUrl}\n\n' +
      'إذا لم تطلب إعادة التعيين فتجاهل هذه الرسالة — كلمة المرور الحالية لم تتغير.',
    emailEnabled: 'TRUE',
    variables: 'resetUrl (runtime)',
    actionUrl: '/reset-password?token=…',
    editableInSettings: 'NO — hardcoded',
    trigger: 'src/app/api/forgot-password/route.ts:75',
  },
  {
    key: '(hardcoded) adminTestEmail',
    label: 'رسالة اختبار إعدادات البريد',
    category: 'admin',
    type: 'info',
    dashboardTitle: '', dashboardMessage: '',
    emailSubject: 'رسالة اختبار — جائزة مايدة',
    emailBody:
      'تهانينا! إذا وصلتك هذه الرسالة فإن إعدادات SMTP تعمل بشكل صحيح.\n' +
      'يمكنك الآن تفعيل إشعارات البريد الإلكتروني من صفحة الإعدادات.',
    emailEnabled: 'TRUE',
    variables: '',
    actionUrl: '',
    editableInSettings: 'NO — hardcoded',
    trigger: 'src/app/api/admin/email-settings/test/route.ts:60',
  },
  {
    key: '(hardcoded) emailShellFooter',
    label: 'تذييل قالب البريد (يظهر في كل رسالة)',
    category: 'all',
    type: 'info',
    dashboardTitle: '', dashboardMessage: '',
    emailSubject: '',
    emailBody: 'هذه رسالة آلية من منصة جائزة مايدة محي الدين ناظر للابتكار يرجى عدم الرد عليها.',
    emailEnabled: 'TRUE',
    variables: '',
    actionUrl: '',
    editableInSettings: 'NO — hardcoded',
    trigger: 'src/lib/mailer.ts:142 (renderEmailHtml)',
  },
];

async function loadOverrides() {
  if (!hasDb) return new Map();
  const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.notificationTemplate.findMany();
    return new Map(rows.map((r) => [r.key, r]));
  } finally {
    await prisma.$disconnect();
  }
}

// ---- CSV / XLSX writers ----------------------------------------------------
const COLUMNS = [
  ['#', 'r'],
  ['key', 'المفتاح'],
  ['label', 'الاسم في صفحة الإعدادات'],
  ['category', 'الفئة'],
  ['type', 'النوع'],
  ['dashboardTitle', 'عنوان الإشعار (لوحة التحكم)'],
  ['dashboardMessage', 'نص الإشعار (لوحة التحكم)'],
  ['emailSubject', 'عنوان البريد الإلكتروني'],
  ['emailBody', 'نص البريد الإلكتروني'],
  ['emailEnabled', 'البريد مفعّل'],
  ['variables', 'المتغيرات'],
  ['actionUrl', 'رابط الإجراء'],
  ['source', 'المصدر'],
  ['editableInSettings', 'قابل للتعديل في الإعدادات'],
  ['bulk', 'إرسال جماعي (BCC)'],
  ['trigger', 'مكان الإطلاق في الكود'],
];

const csvCell = (v) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function writeCsv(rows, file) {
  const header = COLUMNS.map(([k, ar]) => `${k} | ${ar}`).map(csvCell).join(',');
  const body = rows.map((row) => COLUMNS.map(([k]) => csvCell(row[k])).join(',')).join('\r\n');
  // BOM: without it Excel reads the Arabic as mojibake.
  fs.writeFileSync(file, '﻿' + header + '\r\n' + body, 'utf8');
}

function writeXlsx(rows, file) {
  const XLSX = require(path.join(REPO, 'node_modules/xlsx'));
  const aoa = [COLUMNS.map(([k, ar]) => `${ar}\n${k}`)];
  for (const row of rows) aoa.push(COLUMNS.map(([k]) => (row[k] === undefined ? '' : String(row[k]))));

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 4 }, { wch: 26 }, { wch: 30 }, { wch: 12 }, { wch: 10 },
    { wch: 30 }, { wch: 46 }, { wch: 34 }, { wch: 60 }, { wch: 10 },
    { wch: 34 }, { wch: 26 }, { wch: 14 }, { wch: 20 }, { wch: 12 }, { wch: 42 },
  ];
  ws['!rows'] = [{ hpt: 34 }];
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  // Right-to-left sheet so the Arabic columns read naturally in Excel.
  ws['!views'] = [{ RTL: true, state: 'frozen', ySplit: 1 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'نصوص الإشعارات');
  XLSX.writeFile(wb, file);
}

(async () => {
  const triggers = scanTriggers(Object.keys(TEMPLATE_DEFAULTS));
  const overrides = await loadOverrides();

  const templateRows = Object.values(TEMPLATE_DEFAULTS).map((d) => {
    const row = overrides.get(d.key);
    const customised = Boolean(row);
    const differs = (a, b) => (row ? a !== b : false);
    const changed = customised && (
      differs(row.dashboardTitle, d.dashboardTitle) ||
      differs(row.dashboardMessage, d.dashboardMessage) ||
      differs(row.emailSubject, d.emailSubject) ||
      differs(row.emailBody, d.emailBody)
    );

    return {
      key: d.key,
      label: d.label,
      category: d.category,
      type: d.type,
      dashboardTitle: row?.dashboardTitle ?? d.dashboardTitle,
      dashboardMessage: row?.dashboardMessage ?? d.dashboardMessage,
      emailSubject: row?.emailSubject ?? d.emailSubject,
      emailBody: row?.emailBody ?? d.emailBody,
      emailEnabled: String(row?.emailEnabled ?? true).toUpperCase(),
      variables: (d.variables || []).map((v) => `{{${v}}}`).join(' '),
      actionUrl: row?.actionUrl ?? d.actionUrl ?? '',
      source: !hasDb ? 'code default (no DB)' : changed ? 'CUSTOMISED (DB)' : 'code default',
      editableInSettings: 'YES',
      bulk: d.bulk ? 'YES' : '',
      trigger: (triggers[d.key] || []).join(' , ') || '— NEVER FIRED (no emission site) —',
    };
  });

  const CATEGORY_ORDER = { participant: 0, admin: 1, mentor: 2 };
  templateRows.sort(
    (a, b) => (CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]) || a.key.localeCompare(b.key)
  );

  const rows = [...templateRows, ...HARDCODED].map((r, i) => ({ ...r, '#': i + 1 }));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const csvFile = path.join(OUT_DIR, 'notification-texts.csv');
  const xlsxFile = path.join(OUT_DIR, 'notification-texts.xlsx');
  writeCsv(rows, csvFile);
  writeXlsx(rows, xlsxFile);

  const byCat = rows.reduce((acc, r) => ((acc[r.category] = (acc[r.category] || 0) + 1), acc), {});
  console.log(`\nExported ${rows.length} rows (${templateRows.length} editable templates + ${HARDCODED.length} hardcoded)`);
  console.log('By category:', JSON.stringify(byCat));
  console.log(hasDb
    ? `Admin customisations: ${overrides.size} row(s) found in NotificationTemplate`
    : 'No DATABASE_URL — exported CODE DEFAULTS only (admin customisations not included)');
  const noTrigger = templateRows.filter((r) => r.trigger.startsWith('—')).map((r) => r.key);
  if (noTrigger.length) console.log(`Templates with NO emission site (${noTrigger.length}): ${noTrigger.join(', ')}`);
  console.log(`\n  ${csvFile}\n  ${xlsxFile}\n`);
})().catch((e) => { console.error(e); process.exit(1); });
