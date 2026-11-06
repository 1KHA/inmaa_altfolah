import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireOrganizer } from '@/lib/organizer-auth';
import { riyadhToday } from '@/lib/badge-dates';

export const dynamic = 'force-dynamic';

/** GET — the signed-in organizer, plus the server's today for the scanner header. */
export async function GET() {
  const organizer = await requireOrganizer(cookies().get('token')?.value);
  if (!organizer) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  }
  return NextResponse.json({ success: true, role: 'organizer', ...organizer, today: riyadhToday() });
}
