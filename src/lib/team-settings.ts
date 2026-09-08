import { prisma } from './prisma';

const DEFAULT_ID = 'teamsettings-default-row-01';

export interface TeamSettingsRow {
  id: string;
  memberAddStart: Date | null;
  memberAddEnd: Date | null;
  updatedAt: Date;
}

/** Read the single TeamSettings row, creating the default if it is missing. */
export async function getTeamSettings(): Promise<TeamSettingsRow> {
  const row = await prisma.teamSettings.findFirst();
  if (row) return row;
  return prisma.teamSettings.create({ data: { id: DEFAULT_ID } });
}

export type MemberAddWindowState =
  | { allowed: true }
  | { allowed: false; reason: 'not-started' | 'closed'; message: string };

/** Whether team leaders are currently allowed to add members. */
export function memberAddWindowState(
  settings: Pick<TeamSettingsRow, 'memberAddStart' | 'memberAddEnd'>,
  now: Date = new Date()
): MemberAddWindowState {
  if (settings.memberAddStart && now < settings.memberAddStart) {
    return {
      allowed: false,
      reason: 'not-started',
      message: 'لم يبدأ الوقت المسموح لإضافة أعضاء الفريق بعد.',
    };
  }
  if (settings.memberAddEnd && now > settings.memberAddEnd) {
    return {
      allowed: false,
      reason: 'closed',
      message: 'انتهى الوقت المسموح ولا يمكن إضافة أعضاء للفريق بعد الآن.',
    };
  }
  return { allowed: true };
}
