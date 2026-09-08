import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/notification-auth';
import { waitUntil } from '@vercel/functions';
import { getEmailSettings, toSmtpConfig } from '@/lib/mailer';
import {
  DISABLED_PARTICIPANT_WHERE,
  DISABLED_MENTOR_WHERE,
  ELIGIBLE_PARTICIPANT_WHERE,
  ELIGIBLE_MENTOR_WHERE,
  phaseParticipantWhere,
} from '@/lib/account-status';
import {
  enqueueBroadcastRecipients,
  drainEmailQueue,
  ADMIN_INBOX_RECIPIENT_ID,
  type QueueRecipientInput,
} from '@/lib/email-queue';

export const dynamic = 'force-dynamic';
// The inline drainer (waitUntil) keeps running after the response; give it
// room. Overrides the 30s default in vercel.json for this route only.
export const maxDuration = 300;
/** Inline drain budget — leaves headroom under maxDuration for the last batch. */
const INLINE_DRAIN_BUDGET_MS = 240_000;

const UNAUTHORIZED = () =>
  NextResponse.json({ error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' }, { status: 401 });

type Channel = 'dashboard' | 'email';

interface SelectedUser {
  type: 'participant' | 'mentor' | 'admin';
  id: string;
}

interface AudienceInput {
  /**
   * `all-participants` covers ACTIVE participants only. `disabled-accounts`
   * is the deliberate exception that lets an admin reach disabled accounts
   * (e.g. "you did not qualify") — they receive no transactional mail, but a
   * broadcast aimed at them still goes out. See mdfiles/disable-accounts.md.
   */
  type:
    | 'all-participants'
    | 'all-mentors'
    | 'all-admins'
    | 'disabled-accounts'
    | 'phase'
    | 'phase-failed'
    | 'selected';
  selected?: SelectedUser[];
  /** Required for 'phase' and 'phase-failed'. */
  phaseId?: string;
}

interface ResolvedRecipient {
  recipientType: 'participant' | 'mentor' | 'admin';
  recipientId: string;
  email: string | null; // admins resolve to the shared inbox at send time
}

async function resolveAudience(audience: AudienceInput): Promise<ResolvedRecipient[]> {
  if (audience.type === 'all-participants') {
    // Approved participants only: pending applicants and rejected ones are
    // excluded, as are disabled accounts (use 'disabled-accounts' for those).
    const rows = await prisma.participant.findMany({
      where: ELIGIBLE_PARTICIPANT_WHERE,
      select: { id: true, email: true },
    });
    return rows.map((r) => ({ recipientType: 'participant', recipientId: r.id, email: r.email }));
  }

  if (audience.type === 'phase' || audience.type === 'phase-failed') {
    // Everyone governed by this phase — a team member through their team's
    // phase, an individual through their own. Still filtered by eligibility,
    // so disabled/unapproved accounts never receive it.
    if (!audience.phaseId) return [];
    const rows = await prisma.participant.findMany({
      where: {
        AND: [
          ELIGIBLE_PARTICIPANT_WHERE,
          phaseParticipantWhere(audience.phaseId, audience.type === 'phase-failed'),
        ],
      },
      select: { id: true, email: true },
    });
    return rows.map((r) => ({ recipientType: 'participant', recipientId: r.id, email: r.email }));
  }

  if (audience.type === 'disabled-accounts') {
    // Participants disabled directly OR through a disabled team, plus
    // disabled mentors. This is the one channel that still reaches them.
    const [participants, mentors] = await Promise.all([
      prisma.participant.findMany({ where: DISABLED_PARTICIPANT_WHERE, select: { id: true, email: true } }),
      prisma.mentor.findMany({ where: DISABLED_MENTOR_WHERE, select: { id: true, email: true } }),
    ]);
    return [
      ...participants.map((r) => ({ recipientType: 'participant' as const, recipientId: r.id, email: r.email })),
      ...mentors.map((r) => ({ recipientType: 'mentor' as const, recipientId: r.id, email: r.email })),
    ];
  }

  if (audience.type === 'all-mentors') {
    // Active mentors only — pending/inactive and disabled are excluded.
    const rows = await prisma.mentor.findMany({
      where: ELIGIBLE_MENTOR_WHERE,
      select: { id: true, email: true },
    });
    return rows.map((r) => ({ recipientType: 'mentor', recipientId: r.id, email: r.email }));
  }

  if (audience.type === 'all-admins') {
    const rows = await prisma.admin.findMany({ select: { id: true } });
    return rows.map((r) => ({ recipientType: 'admin', recipientId: r.id, email: null }));
  }

  // selected users — look each id up in its own table
  const selected = audience.selected ?? [];
  const out: ResolvedRecipient[] = [];

  const participantIds = selected.filter((s) => s.type === 'participant').map((s) => s.id);
  const mentorIds = selected.filter((s) => s.type === 'mentor').map((s) => s.id);
  const adminIds = selected.filter((s) => s.type === 'admin').map((s) => s.id);

  if (participantIds.length > 0) {
    const rows = await prisma.participant.findMany({
      where: { id: { in: participantIds } },
      select: { id: true, email: true },
    });
    out.push(...rows.map((r) => ({ recipientType: 'participant' as const, recipientId: r.id, email: r.email })));
  }
  if (mentorIds.length > 0) {
    const rows = await prisma.mentor.findMany({
      where: { id: { in: mentorIds } },
      select: { id: true, email: true },
    });
    out.push(...rows.map((r) => ({ recipientType: 'mentor' as const, recipientId: r.id, email: r.email })));
  }
  if (adminIds.length > 0) {
    const rows = await prisma.admin.findMany({
      where: { id: { in: adminIds } },
      select: { id: true },
    });
    out.push(...rows.map((r) => ({ recipientType: 'admin' as const, recipientId: r.id, email: null })));
  }

  return out;
}

/**
 * POST — send a broadcast over the selected channels to the selected audience.
 */
export async function POST(request: NextRequest) {
  const adminId = requireAdmin(cookies().get('token')?.value);
  if (!adminId) return UNAUTHORIZED();

  try {
    const body = await request.json();
    const title = String(body.title || '').trim();
    const message = String(body.body || '').trim();
    const emailSubject = String(body.emailSubject || title).trim();
    const channels: Channel[] = Array.isArray(body.channels) ? body.channels : [];
    const audience: AudienceInput = body.audience;

    if (!title || !message) {
      return NextResponse.json({ error: 'العنوان والنص مطلوبان' }, { status: 400 });
    }
    if (channels.length === 0 || !channels.every((c) => c === 'dashboard' || c === 'email')) {
      return NextResponse.json({ error: 'يرجى اختيار قناة إرسال واحدة على الأقل' }, { status: 400 });
    }
    if (!audience || !['all-participants', 'all-mentors', 'all-admins', 'disabled-accounts', 'phase', 'phase-failed', 'selected'].includes(audience.type)) {
      return NextResponse.json({ error: 'جمهور الإرسال غير صالح' }, { status: 400 });
    }
    if (audience.type === 'selected' && (!audience.selected || audience.selected.length === 0)) {
      return NextResponse.json({ error: 'يرجى اختيار مستلم واحد على الأقل' }, { status: 400 });
    }
    if ((audience.type === 'phase' || audience.type === 'phase-failed') && !audience.phaseId) {
      return NextResponse.json({ error: 'يرجى اختيار المرحلة' }, { status: 400 });
    }

    const recipients = await resolveAudience(audience);
    if (recipients.length === 0) {
      return NextResponse.json({ error: 'لا يوجد مستلمون مطابقون' }, { status: 400 });
    }

    const broadcast = await prisma.broadcast.create({
      data: {
        title,
        body: message,
        emailSubject: channels.includes('email') ? emailSubject : null,
        channels: JSON.stringify(channels),
        audience: JSON.stringify(audience),
        createdBy: adminId,
      },
    });

    let notificationCount = 0;
    let emailSentCount = 0;
    let emailFailedCount = 0;

    // ---- dashboard channel -------------------------------------------------
    const notificationIds = new Map<string, string>(); // recipientId -> notification id
    if (channels.includes('dashboard')) {
      const data = recipients.map((r) => {
        const id = crypto.randomUUID();
        notificationIds.set(`${r.recipientType}:${r.recipientId}`, id);
        return {
          id,
          title,
          message,
          type: 'info',
          recipientType: r.recipientType,
          recipientId: r.recipientId,
          relatedEntityType: 'broadcast',
          relatedEntityId: broadcast.id,
        };
      });
      await prisma.notification.createMany({ data });
      notificationCount = data.length;
    }

    // ---- email channel -----------------------------------------------------
    // Nothing is sent inside this request. Recipients are written to the
    // BroadcastRecipient queue, the response returns immediately, and the
    // queue is drained in the background (waitUntil) + by the cron.
    // See mdfiles/email-queue.md.
    let queued = 0;
    if (channels.includes('email')) {
      const settings = await getEmailSettings();
      const config = settings && settings.enabled ? toSmtpConfig(settings) : null;

      if (!config) {
        // Email requested but not configured/enabled — report it, don't fail
        emailFailedCount = recipients.length;
        await prisma.emailLog.create({
          data: {
            broadcastId: broadcast.id,
            toEmail: `${recipients.length} مستلم`,
            recipientCount: recipients.length,
            subject: emailSubject,
            status: 'failed',
            error: 'email disabled or SMTP settings incomplete',
          },
        });
      } else {
        const queueInput: QueueRecipientInput[] = [];

        // admins -> ONE shared-inbox row covering all admin recipients
        const adminRecipients = recipients.filter((r) => r.recipientType === 'admin');
        if (adminRecipients.length > 0) {
          const inbox = settings!.adminInboxEmail.trim();
          if (inbox) {
            queueInput.push({ recipientType: 'admin', recipientId: ADMIN_INBOX_RECIPIENT_ID, email: inbox });
          } else {
            // The admin explicitly asked for email to admins; a blank shared
            // inbox is a failure worth showing, not a silent skip.
            const adminIds = adminRecipients
              .map((r) => notificationIds.get(`admin:${r.recipientId}`))
              .filter(Boolean) as string[];
            if (adminIds.length > 0) {
              await prisma.notification.updateMany({
                where: { id: { in: adminIds } },
                data: { emailStatus: 'failed' },
              });
            }
            await prisma.broadcastRecipient.create({
              data: {
                broadcastId: broadcast.id,
                recipientType: 'admin',
                recipientId: ADMIN_INBOX_RECIPIENT_ID,
                email: '',
                status: 'failed',
                error: 'admin inbox email (adminInboxEmail) is not configured',
              },
            });
            await prisma.broadcast.update({
              where: { id: broadcast.id },
              data: { totalRecipients: { increment: 1 } },
            });
            emailFailedCount += 1;
          }
        }

        // participants + mentors -> one row each
        for (const r of recipients) {
          if (r.recipientType === 'admin' || !r.email) continue;
          queueInput.push({
            recipientType: r.recipientType,
            recipientId: r.recipientId,
            email: r.email,
            notificationId: notificationIds.get(`${r.recipientType}:${r.recipientId}`) ?? null,
          });
        }

        queued = await enqueueBroadcastRecipients(broadcast.id, queueInput);

        if (queued > 0) {
          // Start sending now, after the response is flushed. Anything left
          // when this function is retired is picked up by the cron drainer.
          waitUntil(
            drainEmailQueue({ budgetMs: INLINE_DRAIN_BUDGET_MS }).catch((err) =>
              console.error('[broadcast] inline drain failed:', err)
            )
          );
        }
      }
    }

    const updated = await prisma.broadcast.update({
      where: { id: broadcast.id },
      data: {
        notificationCount,
        emailSentCount,
        emailFailedCount,
        // Dashboard-only or nothing queued: terminal immediately. With queued
        // rows, enqueueBroadcastRecipients() already set status='queued' and
        // the drainer moves it on from there.
        ...(queued === 0 ? { status: emailFailedCount > 0 ? 'partial' : 'completed' } : {}),
      },
    });

    return NextResponse.json({ success: true, broadcast: updated, queued });
  } catch (error) {
    console.error('Error sending broadcast:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

/**
 * GET — broadcast history, newest first.
 */
export async function GET() {
  if (!requireAdmin(cookies().get('token')?.value)) return UNAUTHORIZED();

  try {
    const broadcasts = await prisma.broadcast.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return NextResponse.json({ broadcasts });
  } catch (error) {
    console.error('Error listing broadcasts:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
