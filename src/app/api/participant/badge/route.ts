import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/notification-auth';
import { getOrCreateBadgeCode } from '@/lib/badge';
import { requireActiveParticipant } from '@/lib/account-status';

export const dynamic = 'force-dynamic';

/**
 * GET — the signed-in participant's digital badge data. Generates the badge
 * code on first request.
 */
export async function GET() {
  try {
    const claims = verifyToken(cookies().get('token')?.value);

    // participants only — badges are not issued to admins or mentors
    const participantId =
      claims && (claims.role === 'participant' || claims.participantId)
        ? claims.participantId || claims.id
        : null;

    if (!participantId) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    const blocked_ = await requireActiveParticipant(participantId);
    if (blocked_) return blocked_;


    const participant = await prisma.participant.findUnique({
      where: { id: participantId },
      select: {
        id: true,
        email: true,
        fullName: true,
        firstName: true,
        secondName: true,
        familyName: true,
        team: { select: { teamName: true } },
      },
    });

    if (!participant) {
      return NextResponse.json({ error: 'المشارك غير موجود' }, { status: 404 });
    }

    const badgeCode = await getOrCreateBadgeCode(participantId);

    const fullName =
      participant.fullName ||
      `${participant.firstName ?? ''} ${participant.secondName ?? ''} ${participant.familyName ?? ''}`.trim() ||
      participant.email;

    return NextResponse.json({
      badgeCode,
      fullName,
      email: participant.email,
      teamName: participant.team?.teamName ?? null,
    });
  } catch (error) {
    console.error('Error fetching badge:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
