import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/notification-auth';
import { getBookingMode, BOOKING_MODE_LABELS } from '@/lib/organizations';

export const dynamic = 'force-dynamic';

/** GET — how participants may book mentors right now (any signed-in user). */
export async function GET() {
  if (!verifyToken(cookies().get('token')?.value)) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  }
  const mode = await getBookingMode();
  return NextResponse.json({
    mode,
    label: BOOKING_MODE_LABELS[mode],
    canBookIndividual: mode !== 'organization',
    canBookOrganization: mode !== 'individual',
  });
}
