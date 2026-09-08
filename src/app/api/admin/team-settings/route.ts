import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/notification-auth';
import { getTeamSettings, memberAddWindowState } from '@/lib/team-settings';
import { TEAM_MAX_MEMBERS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const UNAUTHORIZED = () =>
  NextResponse.json({ error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' }, { status: 401 });

/** GET — current member-add window (admin). */
export async function GET() {
  if (!requireAdmin(cookies().get('token')?.value)) return UNAUTHORIZED();
  try {
    const settings = await getTeamSettings();
    return NextResponse.json({
      memberAddStart: settings.memberAddStart,
      memberAddEnd: settings.memberAddEnd,
      maxMembers: TEAM_MAX_MEMBERS,
      window: memberAddWindowState(settings),
    });
  } catch (error) {
    console.error('Error reading team settings:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

/**
 * PUT — set the window. Body: { memberAddStart, memberAddEnd } — ISO strings
 * or null to clear either side.
 */
export async function PUT(request: NextRequest) {
  if (!requireAdmin(cookies().get('token')?.value)) return UNAUTHORIZED();
  try {
    const body = await request.json();

    const parse = (v: unknown, label: string): Date | null | 'invalid' => {
      if (v === null || v === undefined || v === '') return null;
      const d = new Date(String(v));
      return isNaN(d.getTime()) ? 'invalid' : d;
    };

    const start = parse(body.memberAddStart, 'start');
    const end = parse(body.memberAddEnd, 'end');
    if (start === 'invalid' || end === 'invalid') {
      return NextResponse.json({ error: 'صيغة التاريخ غير صالحة' }, { status: 400 });
    }
    if (start && end && end <= start) {
      return NextResponse.json(
        { error: 'يجب أن يكون تاريخ النهاية بعد تاريخ البداية' },
        { status: 400 }
      );
    }

    const current = await getTeamSettings();
    const updated = await prisma.teamSettings.update({
      where: { id: current.id },
      data: { memberAddStart: start, memberAddEnd: end },
    });

    return NextResponse.json({
      memberAddStart: updated.memberAddStart,
      memberAddEnd: updated.memberAddEnd,
      maxMembers: TEAM_MAX_MEMBERS,
      window: memberAddWindowState(updated),
    });
  } catch (error) {
    console.error('Error updating team settings:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
