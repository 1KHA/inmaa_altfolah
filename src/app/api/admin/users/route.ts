import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/notification-auth';

export const dynamic = 'force-dynamic';

/**
 * GET — unified user list for the broadcast audience picker.
 *
 * Unlike /api/admin/participants (which intentionally filters teamId: null),
 * this returns ALL participants plus all mentors, with only the fields the
 * picker needs — never passwordHash.
 */
export async function GET() {
  if (!requireAdmin(cookies().get('token')?.value)) {
    return NextResponse.json(
      { error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' },
      { status: 401 }
    );
  }

  try {
    const [participants, mentors] = await Promise.all([
      prisma.participant.findMany({
        select: {
          id: true,
          email: true,
          fullName: true,
          firstName: true,
          secondName: true,
          familyName: true,
          teamId: true,
          isDisabled: true,
          team: { select: { isDisabled: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.mentor.findMany({
        select: { id: true, email: true, name: true, isDisabled: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const users = [
      ...participants.map((p) => ({
        id: p.id,
        type: 'participant' as const,
        name:
          p.fullName ||
          `${p.firstName ?? ''} ${p.secondName ?? ''} ${p.familyName ?? ''}`.trim() ||
          p.email,
        email: p.email,
        hasTeam: Boolean(p.teamId),
        // disabled directly, or through a disabled team
        isDisabled: Boolean(p.isDisabled || p.team?.isDisabled),
      })),
      ...mentors.map((m) => ({
        id: m.id,
        type: 'mentor' as const,
        name: m.name,
        email: m.email,
        hasTeam: false,
        isDisabled: Boolean(m.isDisabled),
      })),
    ];

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Error listing users:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
