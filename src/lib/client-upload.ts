/**
 * Browser-side file uploads (team attachments, milestone submissions).
 *
 * WHY: files used to travel inside the POST body of a Vercel function
 * (/api/register-team, /api/participant/upload-milestone-file). Vercel rejects
 * function request bodies over ~4.5 MB BEFORE our code runs
 * (FUNCTION_PAYLOAD_TOO_LARGE), so the advertised 25 MB limit was unreachable.
 *
 * NOW: the browser uploads straight to Supabase Storage (bucket
 * `uploads`, folders `teams/` and `milestones/`) and the API receives
 * only the resulting public URL — the function payload is a few KB whatever
 * the file size. When direct upload is unavailable (no NEXT_PUBLIC_SUPABASE_*
 * at build time, e.g. local dev) or fails (storage policy), callers fall back
 * to the old API path, which still works for files under the platform cap.
 *
 * Storage prerequisite (production): the bucket needs an RLS policy letting
 * the anon role INSERT into `teams/` and `milestones/` (see README section
 * "Storage policy" in mdfiles/file-uploads.md).
 */
import { MAX_FILE_SIZE, MAX_FILE_SIZE_MB } from '@/lib/constants';

export type UploadFolder = 'teams' | 'milestones';

/** Extensions the storage helper knows content-types for. */
export const ALLOWED_UPLOAD_EXTENSIONS = ['pdf', 'doc', 'docx', 'pptx', 'zip', 'rar', 'jpg', 'jpeg', 'png'] as const;

/** Value for <input type="file" accept="..."> */
export const UPLOAD_ACCEPT = ALLOWED_UPLOAD_EXTENSIONS.map((e) => `.${e}`).join(',');

/** Human hint shown under file inputs. */
export const UPLOAD_HINT = `الأنواع المسموحة: PDF, Word, PowerPoint, ZIP, RAR, JPG, PNG — بحد أقصى ${MAX_FILE_SIZE_MB} ميجابايت`;

/** Vercel rejects function bodies above ~4.5 MB; keep a safety margin. */
export const FUNCTION_BODY_LIMIT = 4 * 1024 * 1024;

/** Arabic error message, or null when the file is acceptable. */
export function validateUploadFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return `حجم الملف يجب أن يكون أقل من ${MAX_FILE_SIZE_MB} ميجابايت`;
  }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!(ALLOWED_UPLOAD_EXTENSIONS as readonly string[]).includes(ext)) {
    return 'نوع الملف غير مدعوم. الأنواع المسموحة: PDF, Word, PowerPoint, ZIP, RAR, JPG, PNG';
  }
  return null;
}

/** True when the browser can talk to Supabase Storage directly. */
export const DIRECT_UPLOAD_AVAILABLE = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Upload straight from the browser to Supabase Storage.
 * Throws when direct upload is unavailable or rejected — callers decide
 * whether to fall back to the API path.
 */
export async function uploadFileDirect(
  file: File,
  folder: UploadFolder
): Promise<{ publicUrl: string; filePath: string }> {
  if (!DIRECT_UPLOAD_AVAILABLE) {
    throw new Error('direct upload unavailable');
  }
  // Lazy import: supabase-client.ts throws at module load when the public env
  // vars are missing, which would take the whole page down in local dev.
  const { uploadFileToSupabase } = await import('@/lib/supabase-client');
  return uploadFileToSupabase(file, folder);
}

export type UploadOutcome =
  | { mode: 'direct'; publicUrl: string }
  | { mode: 'api' } // caller must send the raw file to the API (small files only)
  | { mode: 'error'; message: string };

/**
 * Decide how a file will reach storage: direct upload when possible, the API
 * body as a fallback for small files, or a clear error for large files that
 * cannot go through a function body.
 */
export async function prepareUpload(file: File, folder: UploadFolder): Promise<UploadOutcome> {
  const invalid = validateUploadFile(file);
  if (invalid) return { mode: 'error', message: invalid };

  if (DIRECT_UPLOAD_AVAILABLE) {
    try {
      const { publicUrl } = await uploadFileDirect(file, folder);
      return { mode: 'direct', publicUrl };
    } catch (e) {
      console.error('[upload] direct upload failed, evaluating API fallback:', e);
    }
  }

  if (file.size <= FUNCTION_BODY_LIMIT) return { mode: 'api' };

  return {
    mode: 'error',
    message: `تعذر رفع الملف مباشرة إلى التخزين، والملفات الأكبر من 4 ميجابايت لا يمكن إرسالها عبر النموذج. جرّب ملفاً أصغر أو حاول لاحقاً.`,
  };
}
