import type { NextRequest } from 'next/server';
import { uploadToStorage } from './supabase-storage';
import { buildStorageFilename } from './storage-keys';
import { MAX_FILE_SIZE, MAX_FILE_SIZE_MB } from './constants';

/** Shared by the admin organizations routes (route files may only export handlers). */

const LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
/** Logos are small; they go through the function body (≤ 4 MB Vercel cap). */
const LOGO_MAX = Math.min(MAX_FILE_SIZE, 4 * 1024 * 1024);

export const ORG_SELECT = {
  id: true,
  name: true,
  description: true,
  logoUrl: true,
  createdAt: true,
  updatedAt: true,
  mentors: { select: { id: true, name: true, email: true, specialty: true, status: true, isDisabled: true } },
  _count: { select: { bookings: true } },
} as const;

/** Parses JSON or multipart bodies into one shape. */
export async function readOrgBody(request: NextRequest): Promise<{
  name?: string; description?: string; logo?: File | null; removeLogo?: boolean;
}> {
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('multipart/form-data')) {
    const fd = await request.formData();
    const logo = fd.get('logo');
    return {
      name: fd.has('name') ? String(fd.get('name') ?? '') : undefined,
      description: fd.has('description') ? String(fd.get('description') ?? '') : undefined,
      logo: logo instanceof File && logo.size > 0 ? logo : null,
      removeLogo: String(fd.get('removeLogo') || '') === 'true',
    };
  }
  const body = await request.json().catch(() => ({}));
  return {
    name: body.name !== undefined ? String(body.name) : undefined,
    description: body.description !== undefined ? String(body.description) : undefined,
    logo: null,
    removeLogo: body.removeLogo === true,
  };
}

/** Validates + uploads a logo; returns its public URL. Throws a user message on failure. */
export async function storeLogo(logo: File): Promise<string> {
  if (!LOGO_TYPES.has(logo.type)) throw new Error('شعار الجهة يجب أن يكون صورة (PNG, JPG, WEBP, SVG)');
  if (logo.size > LOGO_MAX) throw new Error(`حجم الشعار يجب أن يكون أقل من ${Math.min(MAX_FILE_SIZE_MB, 4)} ميجابايت`);
  try {
    return await uploadToStorage(logo, buildStorageFilename(logo.name), 'organizations');
  } catch (e) {
    console.error('[organizations] logo upload failed:', e);
    throw new Error('فشل رفع الشعار إلى التخزين');
  }
}

