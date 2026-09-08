import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as XLSX from 'xlsx';
import { requireAdmin } from '@/lib/notification-auth';
import { IMPORT_SPECS, type EntityKey } from '@/lib/import-schema';
import { validateImport, commitImport } from '@/lib/import-validate';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Guards against someone uploading a huge workbook. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 2000;

/**
 * POST — bulk import participants / teams / mentors from CSV or Excel.
 *
 * multipart/form-data: file, entity, commit ('true' | 'false')
 *
 * Always validates. With commit=false it is a pure dry run (the preview the
 * admin sees). With commit=true the SAME file is parsed and validated again
 * server-side before writing, so the commit never trusts data echoed back by
 * the browser, and it refuses unless every row is clean.
 *
 * Everything is created as NOT accepted (status 'pending').
 * See imports/README.md and mdfiles/bulk-import.md.
 */
export async function POST(request: NextRequest) {
  if (!requireAdmin(cookies().get('token')?.value)) {
    return NextResponse.json(
      { error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' },
      { status: 401 }
    );
  }

  try {
    const form = await request.formData();
    const entity = String(form.get('entity') || '') as EntityKey;
    const commit = String(form.get('commit') || 'false') === 'true';
    const file = form.get('file');

    if (!IMPORT_SPECS[entity]) {
      return NextResponse.json({ error: 'نوع الاستيراد غير صالح' }, { status: 400 });
    }
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'يرجى اختيار ملف' }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'حجم الملف يتجاوز 5 ميجابايت' }, { status: 400 });
    }

    // xlsx reads .csv and .xlsx alike; raw:false keeps everything as text so a
    // phone number like 0500000000 does not lose its leading zero.
    let rawRows: Record<string, unknown>[];
    let headers: string[];
    try {
      const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: 'buffer', raw: false });
      const sheetName =
        wb.SheetNames.find((n) => n.trim() === IMPORT_SPECS[entity].labelAr) || wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      if (!sheet) return NextResponse.json({ error: 'الملف لا يحتوي على أي ورقة بيانات' }, { status: 400 });

      // raw:false is required on sheet_to_json as well as on read — without it
      // SheetJS type-detects and "0502222222" comes back as the number
      // 502222222, silently destroying the leading zero of every phone number.
      const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, blankrows: false, defval: '', raw: false });
      headers = (matrix[0] || []).map((h) => String(h ?? '').trim());
      rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', blankrows: false, raw: false });
    } catch {
      return NextResponse.json({ error: 'تعذر قراءة الملف. تأكد أنه CSV أو Excel صالح.' }, { status: 400 });
    }

    if (rawRows.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `الملف يحتوي ${rawRows.length} صف. الحد الأقصى ${MAX_ROWS} صف لكل عملية.` },
        { status: 400 }
      );
    }

    const validation = await validateImport(entity, rawRows, headers);

    if (!commit) {
      return NextResponse.json({ ...validation, committed: false });
    }

    if (validation.fatal.length > 0 || validation.errorCount > 0) {
      return NextResponse.json(
        { ...validation, committed: false, error: 'لا يمكن الاستيراد قبل إصلاح جميع الأخطاء.' },
        { status: 400 }
      );
    }

    const created = await commitImport(entity, validation.rows);
    console.log(`[import] ${created} ${entity} created (status=pending)`);

    return NextResponse.json({ ...validation, committed: true, created });
  } catch (error) {
    console.error('Import failed:', error);
    return NextResponse.json({ error: 'خطأ في الخادم أثناء الاستيراد' }, { status: 500 });
  }
}
