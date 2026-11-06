import { prisma } from '@/lib/prisma';
import { dispatchNotification } from '@/lib/notify';
import { riyadhToday } from '@/lib/badge-dates';

/**
 * Badge lookup + general (venue) check-in, shared by the admin attendance
 * scanner (/api/admin/attendance/scan) and the organizer scanner
 * (/api/organizer/scan) so both apply the same rule.
 */

export interface BadgeHolder {
  participantId: string;
  fullName: string;
  teamName: string | null;
}

/** Resolve a badge code to the participant identity shown at the door, or null. */
export async function findBadgeHolder(badgeCode: string): Promise<BadgeHolder | null> {
  const participant = await prisma.participant.findUnique({
    where: { badgeCode },
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
  if (!participant) return null;
  return {
    participantId: participant.id,
    fullName:
      participant.fullName ||
      `${participant.firstName ?? ''} ${participant.secondName ?? ''} ${participant.familyName ?? ''}`.trim() ||
      participant.email,
    teamName: participant.team?.teamName ?? null,
  };
}

export type GeneralCheckinResult =
  | { result: 'checkedIn'; date: string; recordId: string }
  | { result: 'alreadyCheckedIn'; date: string };

/**
 * One check-in per participant per day (Asia/Riyadh). The day is always the
 * server's today — never a client-supplied date. A same-day repeat is not an
 * error at the door; it reports `alreadyCheckedIn`.
 */
export async function checkInGeneral(params: {
  participantId: string;
  scannedBy: string;
  method: 'scan' | 'manual';
}): Promise<GeneralCheckinResult> {
  const today = riyadhToday();
  try {
    const record = await prisma.attendanceRecord.create({
      data: {
        participantId: params.participantId,
        eventId: null,
        checkinDate: today,
        scannedBy: params.scannedBy,
        method: params.method,
      },
    });
    await notifyAttendance(params.participantId, 'الحضور العام');
    return { result: 'checkedIn', date: today, recordId: record.id };
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === 'P2002') {
      return { result: 'alreadyCheckedIn', date: today };
    }
    throw error;
  }
}

/** Best-effort attendance notification — never fails the scan. */
export async function notifyAttendance(participantId: string, eventTitle: string): Promise<void> {
  try {
    await dispatchNotification({
      templateKey: 'attendanceRecorded',
      variables: { eventTitle },
      audience: { kind: 'participant', id: participantId },
      relatedEntityType: 'attendance',
    });
  } catch (error) {
    console.error('Error sending attendance notification:', error);
  }
}
