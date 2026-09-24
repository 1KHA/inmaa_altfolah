/**
 * Supabase Storage object keys must be ASCII-safe: a key such as
 * `teams/1788902595745_الثقافة_الرقمية.pptx` is rejected with
 * "Invalid key" (StorageApiError 400). Every place that names an uploaded
 * file — browser direct uploads and the server-side fallbacks — goes through
 * these helpers so Arabic (or any non-ASCII / special) filenames can never
 * break an upload. The original filename is kept separately for display
 * where the schema stores it (e.g. MilestoneSubmission.fileName).
 */

/** Lower-case, ASCII-only extension (max 10 chars); 'bin' when unusable. */
export function safeExtension(originalName: string): string {
  const raw = originalName.includes('.') ? originalName.split('.').pop() || '' : '';
  const ext = raw.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
  return ext || 'bin';
}

/**
 * Turn any filename into a storage-safe one, preserving a recognisable stem:
 * non-ASCII and special characters become '_', runs are collapsed, and the
 * stem is capped so keys stay short. Always returns something non-empty.
 */
export function sanitizeStorageFilename(originalName: string): string {
  const ext = safeExtension(originalName);
  const stemRaw = originalName.includes('.')
    ? originalName.slice(0, originalName.lastIndexOf('.'))
    : originalName;
  const stem = stemRaw
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.-]+|[_.-]+$/g, '')
    .slice(0, 60);
  return `${stem || 'file'}.${ext}`;
}

/** Unique, storage-safe key: `<timestamp>_<random>_<sanitized-name>` */
export function buildStorageFilename(originalName: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${Date.now()}_${random}_${sanitizeStorageFilename(originalName)}`;
}
