import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/notification-auth';
import { getTeamSettings, memberAddWindowState } from '@/lib/team-settings';
import { TEAM_MAX_MEMBERS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/**
 * GET — tells the team page whether adding members is currently allowed.
 * Any signed-in user may read it (the dates themselves are not sensitive);
 * the actual enforcement lives server-side in /api/participant/add-member.
 */
export async function GET() {
  if (!verifyToken(cookies().get('token')?.value)) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  }
  try {
    const settings = await getTeamSettings();
    return NextResponse.json({
      ...memberAddWindowState(settings),
      memberAddStart: settings.memberAddStart,
      memberAddEnd: settings.memberAddEnd,
      maxMembers: TEAM_MAX_MEMBERS,
    });
  } catch (error) {
    console.error('Error reading member-add window:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
