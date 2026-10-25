import { NextResponse } from 'next/server';
import { prisma } from './prisma';
import { requireAdmin, requireAdvisor, verifyToken } from './notification-auth';
import { requireActiveAdvisor, requireActiveParticipant } from './account-status';
import { parsePracticeAnswers, type PracticeStatus } from './practice-cards';

/*
 * Server side of the practice cards (نماذج المختبرات):
 *  - a team's leader fills a card in and submits it; every member can read it
 *  - advisors and admins review a submitted card: a score from 1 to 5 plus a
 *    comment, and either approve it or send it back for correction
 *  - participants see the comments, never the scores
 *
 * Card status: draft -> submitted -> approved | needs_revision -> submitted ...
 * See src/lib/practice-cards.ts for the cards themselves.
 */

/** Shown to teams instead of the admin's username */
export const ADMIN_REVIEWER_LABEL = 'فريق التنظيم';

export interface PracticeReviewer {
  type: 'admin' | 'advisor';
  id: string;
  name: string;
}

/** The signed-in admin or (active) advisor, or the error response to return. */
export async function getPracticeReviewer(token: string | undefined): Promise<PracticeReviewer | NextResponse> {
  const adminId = requireAdmin(token);
  if (adminId) {
    const admin = await prisma.admin.findUnique({ where: { id: adminId }, select: { username: true } });
    return { type: 'admin', id: adminId, name: admin?.username || ADMIN_REVIEWER_LABEL };
  }

  const advisorId = requireAdvisor(token);
  if (advisorId) {
    const blocked = await requireActiveAdvisor(advisorId);
    if (blocked) return blocked;
    const advisor = await prisma.advisor.findUnique({ where: { id: advisorId }, select: { name: true } });
    if (!advisor) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    return { type: 'advisor', id: advisorId, name: advisor.name };
  }

  return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
}

export interface PracticeParticipant {
  id: string;
  isLeader: boolean;
  teamId: string;
  teamName: string;
}

/** The signed-in participant with an approved team, or the error response to return. */
export async function getPracticeParticipant(token: string | undefined): Promise<PracticeParticipant | NextResponse> {
  const claims = verifyToken(token);
  const participantId = claims?.role === 'participant' ? claims.participantId || claims.id : null;
  if (!participantId) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });

  const blocked = await requireActiveParticipant(participantId);
  if (blocked) return blocked;

  // Leadership is read from the database, not the token (it can change mid-session)
  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    select: { id: true, isLeader: true, teamId: true, team: { select: { teamName: true, status: true } } },
  });
  if (!participant) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  if (!participant.teamId || !participant.team || participant.team.status !== 'approved') {
    return NextResponse.json({ error: 'النماذج متاحة لأعضاء الفرق المقبولة فقط' }, { status: 403 });
  }

  return {
    id: participant.id,
    isLeader: participant.isLeader,
    teamId: participant.teamId,
    teamName: participant.team.teamName || 'فريق',
  };
}

export const practiceStatusOf = (status: string | null | undefined): PracticeStatus =>
  (status as PracticeStatus) || 'not_started';

/** Where each audience opens a card. */
export const practiceLinks = {
  participant: (cardKey: string) => `/participant-dashboard/practice?card=${encodeURIComponent(cardKey)}`,
  advisor: (teamId: string, cardKey: string) => `/advisor-dashboard/teams/${teamId}?card=${encodeURIComponent(cardKey)}`,
  admin: (teamId: string, cardKey: string) => `/admin-hackton-dashboard/practice/${teamId}?card=${encodeURIComponent(cardKey)}`,
};

type SubmissionWithReviews = {
  id: string;
  cardKey: string;
  status: string;
  answers: string;
  score: number | null;
  submitCount: number;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  updatedAt: Date;
  reviews: {
    id: string;
    reviewerType: string;
    reviewerName: string;
    decision: string;
    score: number;
    comment: string;
    createdAt: Date;
  }[];
};

/** A card as its team sees it: answers and comments, no score. */
export function practiceForParticipant(sub: SubmissionWithReviews) {
  return {
    cardKey: sub.cardKey,
    status: practiceStatusOf(sub.status),
    answers: parsePracticeAnswers(sub.answers),
    submitCount: sub.submitCount,
    submittedAt: sub.submittedAt,
    updatedAt: sub.updatedAt,
    reviews: sub.reviews.map((r) => ({
      id: r.id,
      decision: r.decision,
      comment: r.comment,
      reviewerType: r.reviewerType,
      reviewerName: r.reviewerType === 'admin' ? ADMIN_REVIEWER_LABEL : r.reviewerName,
      createdAt: r.createdAt,
    })),
  };
}

/** A card as reviewers see it: scores included; a draft's answers stay private to the team. */
export function practiceForReviewer(sub: SubmissionWithReviews) {
  const status = practiceStatusOf(sub.status);
  return {
    id: sub.id,
    cardKey: sub.cardKey,
    status,
    answers: status === 'draft' ? {} : parsePracticeAnswers(sub.answers),
    score: sub.score,
    submitCount: sub.submitCount,
    submittedAt: sub.submittedAt,
    reviewedAt: sub.reviewedAt,
    updatedAt: sub.updatedAt,
    reviews: sub.reviews.map((r) => ({
      id: r.id,
      decision: r.decision,
      score: r.score,
      comment: r.comment,
      reviewerType: r.reviewerType,
      reviewerName: r.reviewerName,
      createdAt: r.createdAt,
    })),
  };
}

export const REVIEWS_NEWEST_FIRST = { orderBy: { createdAt: 'desc' as const } };
