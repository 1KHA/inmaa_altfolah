import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireOrganizer } from '@/lib/organizer-auth';
import { findBadgeHolder, checkInGeneral } from '@/lib/general-checkin';

export const dynamic = 'force-dynamic';

/**
 * POST — organizer badge scan: { badgeCode, method?: 'scan' | 'manual' }.
 *
 * General (venue) check-in only, same rule as the admin scanner: one check-in
 * per participant per day, saved under the server's today. Organizers have no
 * undo and no event mode — an admin corrects mistakes from the admin page.
 */
export async function POST(request: NextRequest) {
  const organizer = await requireOrganizer(cookies().get('token')?.value);
  if (!organizer) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const badgeCode = String(body.badgeCode || '').trim().toUpperCase();
    const method = body.method === 'manual' ? 'manual' : 'scan';

    if (!badgeCode) {
      return NextResponse.json({ error: 'رمز البطاقة مطلوب' }, { status: 400 });
    }

    const identity = await findBadgeHolder(badgeCode);
    if (!identity) {
      return NextResponse.json({ error: 'بطاقة غير معروفة — تحقق من الرمز' }, { status: 404 });
    }

    const outcome = await checkInGeneral({
      participantId: identity.participantId,
      scannedBy: organizer.id,
      method,
    });
    return NextResponse.json({ success: true, ...outcome, ...identity });
  } catch (error) {
    console.error('Error recording organizer scan:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
