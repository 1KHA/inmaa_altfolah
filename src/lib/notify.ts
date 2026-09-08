import crypto from 'crypto';
import { prisma } from './prisma';
import { ACTIVE_PARTICIPANT_WHERE, ELIGIBLE_PARTICIPANT_WHERE, isEffectivelyDisabled } from './account-status';
import {
  getEmailSettings,
  toSmtpConfig,
  sendEmail,
  chunkRecipients,
  type SmtpConfig,
  type SendEmailResult,
} from './mailer';

/**
 * Template-driven notification dispatch.
 *
 * Every emission site calls dispatchNotification(templateKey, variables, …).
 * Text is rendered from the admin-editable NotificationTemplate row when one
 * exists, otherwise from the code defaults below — so the DB holds only
 * overrides and "reset to default" simply deletes the row.
 *
 * Dashboard inserts mirror the behaviour of the legacy helpers in
 * notifications.ts (admin fan-out with its "admin-1" fallback, team-null
 * guard) but pre-generate row IDs so email delivery status can be stamped
 * back onto the exact rows afterwards. The legacy helpers remain exported
 * and untouched.
 *
 * Email is best-effort and dark by default: nothing sends until the admin
 * enables it in EmailSettings, and a failure never affects the dashboard
 * notification or the business action.
 */

// ---------------------------------------------------------------------------
// Defaults registry — one entry per notification type
// ---------------------------------------------------------------------------

export interface TemplateDefaults {
  key: string;
  label: string; // Arabic display name for the editor
  category: 'admin' | 'participant' | 'mentor';
  variables: string[];
  type: 'success' | 'info' | 'warning' | 'error';
  dashboardTitle: string;
  dashboardMessage: string;
  emailSubject: string;
  emailBody: string;
  actionUrl?: string;
  /** true for templates that fan out via BCC — no per-recipient variables. */
  bulk?: boolean;
}

function def(
  d: Omit<TemplateDefaults, 'emailSubject' | 'emailBody'> &
    Partial<Pick<TemplateDefaults, 'emailSubject' | 'emailBody'>>
): TemplateDefaults {
  return {
    emailSubject: d.dashboardTitle,
    emailBody: d.dashboardMessage,
    ...d,
  };
}

export const TEMPLATE_DEFAULTS: Record<string, TemplateDefaults> = Object.fromEntries(
  [
    // ---- admin-facing -----------------------------------------------------
    def({
      key: 'newTeamRegistration',
      label: 'تسجيل فريق جديد (للمشرفين)',
      category: 'admin',
      variables: ['teamName'],
      type: 'info',
      dashboardTitle: 'طلب تسجيل فريق جديد',
      dashboardMessage: 'تم تسجيل فريق جديد: {{teamName}} ويحتاج للمراجعة',
      actionUrl: '/admin-hackton-dashboard/teams',
    }),
    def({
      key: 'newMilestoneSubmission',
      label: 'تسليم مشروع جديد (للمشرفين)',
      category: 'admin',
      variables: ['teamName', 'milestoneTitle'],
      type: 'info',
      dashboardTitle: 'تسليم مشروع جديد',
      dashboardMessage: 'تم تسليم مشروع من فريق {{teamName}} للمرحلة {{milestoneTitle}}',
      actionUrl: '/admin-hackton-dashboard/submissions',
    }),
    def({
      key: 'eventCapacityWarning',
      label: 'تحذير سعة الفعالية (للمشرفين)',
      category: 'admin',
      variables: ['eventTitle'],
      type: 'warning',
      dashboardTitle: 'تحذير سعة الفعالية',
      dashboardMessage: 'الفعالية {{eventTitle}} وصلت إلى 80% من السعة',
      actionUrl: '/admin-hackton-dashboard/events',
    }),
    def({
      key: 'newEventRegistration',
      label: 'تسجيل جديد في فعالية (للمشرفين)',
      category: 'admin',
      variables: ['participantName', 'eventTitle'],
      type: 'info',
      dashboardTitle: 'تسجيل جديد في الفعالية',
      dashboardMessage: 'تم تسجيل {{participantName}} في فعالية {{eventTitle}}',
    }),
    def({
      key: 'newMentorRegistration',
      label: 'إضافة مرشد جديد (للمشرفين)',
      category: 'admin',
      variables: ['mentorName'],
      type: 'info',
      dashboardTitle: 'مرشد جديد تمت إضافته',
      dashboardMessage: 'تم إضافة مرشد جديد: {{mentorName}} بواسطة المشرف',
      actionUrl: '/admin-hackton-dashboard/mentors',
    }),
    def({
      key: 'participantCreated',
      label: 'إضافة مشارك جديد (للمشرفين)',
      category: 'admin',
      variables: ['participantName'],
      type: 'info',
      dashboardTitle: 'مشارك جديد تمت إضافته',
      dashboardMessage: 'تم إضافة مشارك جديد: {{participantName}} بواسطة المشرف',
      actionUrl: '/admin-hackton-dashboard/participants',
    }),

    // ---- participant-facing ------------------------------------------------
    def({
      key: 'teamApproval',
      label: 'قبول الفريق',
      category: 'participant',
      // email/password/loginUrl/participantName are PER RECIPIENT — each team
      // member gets their own email with their own credentials.
      variables: ['teamName', 'participantName', 'email', 'password', 'loginUrl'],
      type: 'success',
      dashboardTitle: 'تم قبول فريقك!',
      dashboardMessage: 'تهانينا! تم قبول فريق {{teamName}} في الهاكثون',
      emailSubject: 'تم قبول فريق {{teamName}} — بيانات الدخول إلى حسابك',
      emailBody:
        'مرحباً {{participantName}}،\n\nتهانينا! تم قبول فريق {{teamName}} في الهاكثون.\n\nبيانات الدخول إلى لوحة المشارك:\nالبريد الإلكتروني: {{email}}\nكلمة المرور: {{password}}\n\nرابط تسجيل الدخول: {{loginUrl}}\n\nهذه البيانات خاصة بك ولا تشاركها مع أحد. يمكنك تغيير كلمة المرور في أي وقت عبر خيار "نسيت كلمة المرور" في صفحة الدخول.',
      actionUrl: '/participant-dashboard',
    }),
    def({
      key: 'teamRejection',
      label: 'رفض الفريق',
      category: 'participant',
      variables: ['teamName'],
      type: 'error',
      dashboardTitle: 'لم يتم قبول فريقك',
      dashboardMessage: 'نأسف، لم يتم قبول فريق {{teamName}}. يرجى مراجعة المتطلبات',
    }),
    def({
      key: 'participantApproval',
      label: 'قبول المشارك',
      category: 'participant',
      variables: ['participantName', 'email', 'password', 'loginUrl'],
      type: 'success',
      dashboardTitle: 'تم قبول طلبك!',
      dashboardMessage: 'تم قبول طلب مشاركتك في الهاكاثون. يمكنك الآن تسجيل الدخول إلى حسابك.',
      emailSubject: 'تم قبول طلب مشاركتك — بيانات الدخول إلى حسابك',
      emailBody:
        'مرحباً {{participantName}}،\n\nتهانينا! تم قبول طلب مشاركتك في الهاكاثون.\n\nبيانات الدخول إلى لوحة المشارك:\nالبريد الإلكتروني: {{email}}\nكلمة المرور: {{password}}\n\nرابط تسجيل الدخول: {{loginUrl}}\n\nهذه البيانات خاصة بك ولا تشاركها مع أحد. يمكنك تغيير كلمة المرور في أي وقت عبر خيار "نسيت كلمة المرور" في صفحة الدخول.',
      actionUrl: '/participant-dashboard',
    }),
    def({
      key: 'participantRejection',
      label: 'رفض المشارك',
      category: 'participant',
      variables: [],
      type: 'error',
      dashboardTitle: 'تم رفض طلبك',
      dashboardMessage:
        'نأسف لإبلاغك أنه تم رفض طلب مشاركتك في الهاكاثون. يمكنك التواصل معنا للمزيد من المعلومات.',
    }),
    def({
      key: 'eventRegistrationConfirmation',
      label: 'تأكيد التسجيل في فعالية',
      category: 'participant',
      variables: ['eventTitle'],
      type: 'success',
      dashboardTitle: 'تأكيد التسجيل في الفعالية',
      dashboardMessage: 'تم تسجيلك بنجاح في فعالية {{eventTitle}}',
      actionUrl: '/participant-dashboard/events',
    }),
    def({
      key: 'eventReminder24h',
      label: 'تذكير بفعالية غداً (غير مفعّل — لا يوجد مجدول)',
      category: 'participant',
      variables: ['eventTitle', 'time'],
      type: 'info',
      dashboardTitle: 'تذكير: فعالية غداً',
      dashboardMessage: 'فعالية {{eventTitle}} ستبدأ غداً في {{time}}',
    }),
    def({
      key: 'eventReminder1h',
      label: 'تذكير بفعالية خلال ساعة (غير مفعّل — لا يوجد مجدول)',
      category: 'participant',
      variables: ['eventTitle', 'location'],
      type: 'warning',
      dashboardTitle: 'تذكير: فعالية خلال ساعة',
      dashboardMessage: 'فعالية {{eventTitle}} ستبدأ خلال ساعة في {{location}}',
    }),
    def({
      key: 'newEventAvailable',
      label: 'فعالية جديدة (لكل المشاركين)',
      category: 'participant',
      variables: ['eventTitle', 'eventDate', 'location'],
      type: 'info',
      dashboardTitle: 'فعالية جديدة',
      dashboardMessage: 'تمت إضافة فعالية جديدة: {{eventTitle}} بتاريخ {{eventDate}} في {{location}}',
      actionUrl: '/participant-dashboard/events',
      bulk: true,
    }),
    def({
      key: 'eventReminderManual',
      label: 'تذكير بفعالية (إرسال يدوي من المشرف)',
      category: 'participant',
      variables: ['eventTitle', 'eventDate', 'eventLocation'],
      type: 'info',
      dashboardTitle: 'تذكير بفعالية: {{eventTitle}}',
      dashboardMessage: 'نذكرك بفعالية {{eventTitle}} بتاريخ {{eventDate}} في {{eventLocation}}.',
      emailSubject: 'تذكير بفعالية {{eventTitle}}',
      emailBody:
        'نذكرك بأنك مسجّل في فعالية {{eventTitle}}.\n\nالتاريخ: {{eventDate}}\nالمكان: {{eventLocation}}\n\nنتطلع لحضورك.',
      actionUrl: '/participant-dashboard/events',
      // BCC fan-out: same text for everyone, so no per-recipient variables.
      bulk: true,
    }),
    def({
      key: 'newMilestoneAvailable',
      label: 'مرحلة جديدة متاحة (لكل المشاركين)',
      category: 'participant',
      variables: ['milestoneTitle'],
      type: 'info',
      dashboardTitle: 'مرحلة جديدة متاحة',
      dashboardMessage: 'مرحلة جديدة {{milestoneTitle}} متاحة للتسليم',
      actionUrl: '/participant-dashboard/milestones',
      bulk: true,
    }),
    def({
      key: 'milestoneDeadlineReminder',
      label: 'تذكير بموعد التسليم (غير مفعّل — لا يوجد مجدول)',
      category: 'participant',
      variables: ['milestoneTitle', 'timeLeft'],
      type: 'warning',
      dashboardTitle: 'تذكير: موعد تسليم المرحلة',
      dashboardMessage: 'موعد تسليم {{milestoneTitle}} خلال {{timeLeft}}',
    }),
    def({
      key: 'milestoneReviewAccepted',
      label: 'قبول تسليم المرحلة',
      category: 'participant',
      variables: ['milestoneTitle'],
      type: 'success',
      dashboardTitle: 'نتيجة مراجعة المشروع',
      dashboardMessage: 'تم قبول مشروعك للمرحلة {{milestoneTitle}}',
      actionUrl: '/participant-dashboard/milestones',
    }),
    def({
      key: 'milestoneResubmissionRequested',
      label: 'طلب إعادة تسليم المرحلة',
      category: 'participant',
      variables: ['milestoneTitle', 'reviewComment', 'deadline'],
      type: 'warning',
      dashboardTitle: 'مطلوب إعادة تسليم: {{milestoneTitle}}',
      dashboardMessage: 'طلب المشرف إعادة تسليم {{milestoneTitle}}. الملاحظات: {{reviewComment}}',
      emailSubject: 'مطلوب إعادة تسليم {{milestoneTitle}}',
      emailBody:
        'راجع المشرف تسليمكم للمرحلة {{milestoneTitle}} ويطلب إعادة التسليم.\n\nملاحظات المراجع:\n{{reviewComment}}\n\nالموعد النهائي لإعادة التسليم: {{deadline}}\n\nيمكنكم رفع الملف مرة أخرى من لوحة المشارك.',
      actionUrl: '/participant-dashboard/milestones',
    }),
    def({
      key: 'milestoneReviewRejected',
      label: 'رفض تسليم المرحلة',
      category: 'participant',
      variables: ['milestoneTitle'],
      type: 'error',
      dashboardTitle: 'نتيجة مراجعة المشروع',
      dashboardMessage: 'تم رفض مشروعك للمرحلة {{milestoneTitle}}',
      actionUrl: '/participant-dashboard/milestones',
    }),
    def({
      key: 'bookingConfirmation',
      label: 'تأكيد حجز جلسة إرشاد',
      category: 'participant',
      variables: ['mentorName', 'dateTime', 'meetingLink'],
      type: 'success',
      dashboardTitle: 'تأكيد حجز الجلسة',
      dashboardMessage: 'تم تأكيد حجز جلستك مع {{mentorName}} في {{dateTime}}',
      emailSubject: 'تأكيد حجز جلستك مع {{mentorName}}',
      emailBody:
        'تم تأكيد حجز جلسة الإرشاد مع {{mentorName}} في {{dateTime}}.\n\nرابط الاجتماع (افتحه في موعد الجلسة من المتصفح أو الجوال):\n{{meetingLink}}\n\nلا حاجة لإنشاء حساب — اضغط الرابط وانضم مباشرة.',
      actionUrl: '/participant-dashboard/mentors',
    }),
    def({
      key: 'attendanceRecorded',
      label: 'تأكيد تسجيل الحضور',
      category: 'participant',
      variables: ['eventTitle'],
      type: 'success',
      dashboardTitle: 'تم تسجيل حضورك',
      dashboardMessage: 'تم تسجيل حضورك بنجاح في: {{eventTitle}}',
    }),
    def({
      key: 'teamJoinRequest',
      label: 'طلب انضمام لفريق (لقائد الفريق)',
      category: 'participant',
      variables: ['participantName', 'teamName'],
      type: 'info',
      dashboardTitle: 'طلب انضمام جديد للفريق',
      dashboardMessage: '{{participantName}} يريد الانضمام لفريق {{teamName}}',
      actionUrl: '/participant-dashboard/join-requests',
    }),
    def({
      key: 'joinRequestAccepted',
      label: 'قبول طلب الانضمام',
      category: 'participant',
      variables: ['teamName', 'participantName', 'email', 'password', 'loginUrl'],
      type: 'success',
      dashboardTitle: 'تم قبول طلب الانضمام!',
      dashboardMessage: 'تهانينا! تم قبولك في فريق {{teamName}}',
      emailSubject: 'تم قبولك في فريق {{teamName}} — بيانات الدخول إلى حسابك',
      emailBody:
        'مرحباً {{participantName}}،\n\nتهانينا! تم قبولك في فريق {{teamName}}.\n\nبيانات الدخول إلى لوحة المشارك:\nالبريد الإلكتروني: {{email}}\nكلمة المرور: {{password}}\n\nرابط تسجيل الدخول: {{loginUrl}}\n\nهذه البيانات خاصة بك ولا تشاركها مع أحد. يمكنك تغيير كلمة المرور في أي وقت عبر خيار "نسيت كلمة المرور" في صفحة الدخول.',
      actionUrl: '/participant-dashboard/team',
    }),
    def({
      key: 'memberAddedByLeader',
      label: 'إضافة عضو بواسطة قائد الفريق (بيانات الدخول)',
      category: 'participant',
      // email/password/loginUrl/participantName are PER RECIPIENT — the new
      // member gets their own credentials, exactly like teamApproval.
      variables: ['teamName', 'participantName', 'email', 'password', 'loginUrl'],
      type: 'success',
      dashboardTitle: 'تمت إضافتك إلى الفريق!',
      dashboardMessage: 'تمت إضافتك إلى فريق {{teamName}} بواسطة قائد الفريق',
      emailSubject: 'تمت إضافتك إلى فريق {{teamName}} — بيانات الدخول إلى حسابك',
      emailBody:
        'مرحباً {{participantName}}،\n\nتمت إضافتك إلى فريق {{teamName}} في الهاكثون بواسطة قائد الفريق.\n\nبيانات الدخول إلى لوحة المشارك:\nالبريد الإلكتروني: {{email}}\nكلمة المرور: {{password}}\n\nرابط تسجيل الدخول: {{loginUrl}}\n\nهذه البيانات خاصة بك ولا تشاركها مع أحد. يمكنك تغيير كلمة المرور في أي وقت عبر خيار "نسيت كلمة المرور" في صفحة الدخول.',
      actionUrl: '/participant-dashboard/team',
    }),
    def({
      key: 'joinRequestRejected',
      label: 'رفض طلب الانضمام',
      category: 'participant',
      variables: ['teamName'],
      type: 'info',
      dashboardTitle: 'لم يتم قبول طلب الانضمام',
      dashboardMessage: 'لم يتم قبولك في فريق {{teamName}}',
    }),
    def({
      key: 'joinRequestCancelled',
      label: 'إلغاء طلب الانضمام',
      category: 'participant',
      variables: ['teamName'],
      type: 'info',
      dashboardTitle: 'تم إلغاء طلب الانضمام',
      dashboardMessage: 'تم إلغاء طلب انضمامك لفريق {{teamName}} بسبب انضمامك لفريق آخر',
    }),

    // ---- mentor-facing -----------------------------------------------------
    def({
      key: 'newBookingRequest',
      label: 'طلب حجز جلسة (للمرشد)',
      category: 'mentor',
      variables: ['participantName', 'dateTime', 'meetingLink'],
      type: 'info',
      dashboardTitle: 'طلب حجز جلسة جديد',
      dashboardMessage: 'طلب {{participantName}} حجز جلسة معك في {{dateTime}}',
      emailSubject: 'حجز جلسة إرشاد جديد — {{dateTime}}',
      emailBody:
        'قام {{participantName}} بحجز جلسة إرشاد معك في {{dateTime}}.\n\nرابط الاجتماع:\n{{meetingLink}}\n\nافتح الرابط في موعد الجلسة وسجّل الدخول بحساب Google (أو GitHub) لبدء الاجتماع كمشرف — المشاركون ينضمون بعدها مباشرة دون حسابات.',
      actionUrl: '/mentor-dashboard/sessions',
    }),
    def({
      key: 'bookingCancellation',
      label: 'إلغاء حجز جلسة (للمرشد)',
      category: 'mentor',
      variables: ['participantName', 'dateTime'],
      type: 'warning',
      dashboardTitle: 'إلغاء حجز جلسة',
      dashboardMessage: 'تم إلغاء الجلسة مع {{participantName}} المقررة في {{dateTime}}',
      actionUrl: '/mentor-dashboard/sessions',
    }),
    def({
      key: 'mentorProfileApproval',
      label: 'قبول المرشد',
      category: 'mentor',
      variables: [],
      type: 'success',
      dashboardTitle: 'تم قبول طلبك كمرشد',
      dashboardMessage: 'تهانينا! تم قبولك كمرشد في منصة الهاكثون',
      actionUrl: '/mentor-dashboard',
    }),
  ].map((d) => [d.key, d])
);

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export type TemplateVariables = Record<string, string>;

/** Replace {{name}} placeholders. Unknown placeholders stay literal. */
export function renderTemplate(text: string, variables: TemplateVariables): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(variables, name) ? variables[name] : match
  );
}

export interface EffectiveTemplate extends TemplateDefaults {
  emailEnabled: boolean;
  isCustomized: boolean;
}

/** DB override merged over code defaults. */
export async function getEffectiveTemplate(key: string): Promise<EffectiveTemplate | null> {
  const defaults = TEMPLATE_DEFAULTS[key];
  if (!defaults) return null;

  try {
    const row = await prisma.notificationTemplate.findUnique({ where: { key } });
    if (!row) return { ...defaults, emailEnabled: true, isCustomized: false };

    return {
      ...defaults,
      dashboardTitle: row.dashboardTitle,
      dashboardMessage: row.dashboardMessage,
      emailSubject: row.emailSubject,
      emailBody: row.emailBody,
      emailEnabled: row.emailEnabled,
      actionUrl: row.actionUrl ?? defaults.actionUrl,
      isCustomized: true,
    };
  } catch (error) {
    console.error(`Error loading template override for ${key}:`, error);
    return { ...defaults, emailEnabled: true, isCustomized: false };
  }
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export type Audience =
  | { kind: 'participant'; id: string }
  | { kind: 'mentor'; id: string }
  | { kind: 'admins' }
  | { kind: 'team'; teamId: string }
  | { kind: 'allParticipants' }
  /** Everyone still registered for a given event (admin-triggered reminders). */
  | { kind: 'eventRegistrants'; eventId: string };

export interface DispatchParams {
  templateKey: string;
  variables?: TemplateVariables;
  audience: Audience;
  relatedEntityType?: string;
  relatedEntityId?: string;
  /** Overrides the template's actionUrl for this dispatch only. */
  actionUrl?: string;
  /**
   * Variables that differ per recipient, keyed by recipientId (participant /
   * mentor id). Merged over `variables` for that recipient's dashboard text
   * AND email. When present, emails are sent one per recipient (never BCC),
   * so e.g. {{password}} only ever reaches its owner.
   */
  perRecipient?: Record<string, TemplateVariables>;
}

interface PlannedRecipient {
  notificationId: string;
  recipientType: 'admin' | 'participant' | 'mentor';
  recipientId: string;
  email: string | null; // null => no email deliverable for this row
  /** Fully merged variables for this recipient (shared + per-recipient). */
  variables: TemplateVariables;
}

/** Wall-clock budget for email sending inside a request (Vercel cap is 30s). */
const EMAIL_TIME_BUDGET_MS = 20_000;

export async function dispatchNotification(params: DispatchParams): Promise<void> {
  const { templateKey, variables = {}, audience, relatedEntityType, relatedEntityId, perRecipient } = params;

  const template = await getEffectiveTemplate(templateKey);
  if (!template) {
    console.error(`dispatchNotification: unknown template key "${templateKey}"`);
    return;
  }

  const actionUrl = params.actionUrl ?? template.actionUrl;
  const varsFor = (recipientId: string): TemplateVariables => ({
    ...variables,
    ...(perRecipient?.[recipientId] ?? {}),
  });

  // ---- resolve recipients (dashboard rows + email addresses) --------------
  const recipients: PlannedRecipient[] = [];

  if (audience.kind === 'participant' || audience.kind === 'mentor') {
    let email: string | null = null;
    try {
      if (audience.kind === 'participant') {
        const row = await prisma.participant.findUnique({
          where: { id: audience.id },
          select: { email: true, isDisabled: true, phase: { select: { isDisabled: true } }, team: { select: { isDisabled: true, phase: { select: { isDisabled: true } } } } },
        });
        // Disabled accounts get NO transactional notification at all — not the
        // email and not the dashboard row. Admin broadcasts are the one channel
        // that can still reach them (see account-status.ts).
        if (isEffectivelyDisabled(row)) return;
        email = row?.email ?? null;
      } else {
        const row = await prisma.mentor.findUnique({
          where: { id: audience.id },
          select: { email: true, isDisabled: true },
        });
        // Disabled mentors get no transactional notification either.
        if (row?.isDisabled) return;
        email = row?.email ?? null;
      }
    } catch {
      email = null;
    }
    recipients.push({
      notificationId: crypto.randomUUID(),
      recipientType: audience.kind,
      recipientId: audience.id,
      email,
      variables: varsFor(audience.id),
    });
  } else if (audience.kind === 'admins') {
    // Mirrors notifyAllAdmins (notifications.ts): fall back to "admin-1" when
    // the table is empty. Admin email goes to the shared inbox, resolved later.
    try {
      const admins = await prisma.admin.findMany({ select: { id: true } });
      const adminIds = admins.length > 0 ? admins.map((a) => a.id) : ['admin-1'];
      for (const id of adminIds) {
        recipients.push({
          notificationId: crypto.randomUUID(),
          recipientType: 'admin',
          recipientId: id,
          email: null,
          variables: varsFor(id),
        });
      }
    } catch (error) {
      console.error('dispatchNotification: failed to list admins:', error);
      recipients.push({
        notificationId: crypto.randomUUID(),
        recipientType: 'admin',
        recipientId: 'admin-1',
        email: null,
        variables: varsFor('admin-1'),
      });
    }
  } else if (audience.kind === 'team') {
    // Mirrors notifyTeamMembers: silently no-op when the team is missing.
    const team = await prisma.team.findUnique({
      where: { id: audience.teamId },
      include: {
        phase: { select: { isDisabled: true } },
        participants: {
          where: { isDisabled: false },
          select: { id: true, email: true },
        },
      },
    });
    if (!team) return;
    // A disabled team — or a team sitting in a disabled PHASE — notifies
    // nobody. Individually disabled members are filtered by the `where` above.
    if (team.isDisabled || team.phase?.isDisabled) return;
    for (const p of team.participants) {
      recipients.push({
        notificationId: crypto.randomUUID(),
        recipientType: 'participant',
        recipientId: p.id,
        email: p.email,
        variables: varsFor(p.id),
      });
    }
  } else if (audience.kind === 'eventRegistrants') {
    // Participants with a live registration for this event. Cancelled
    // registrations and disabled accounts are excluded.
    const registrations = await prisma.eventRegistration.findMany({
      where: {
        eventId: audience.eventId,
        status: 'registered',
        participant: ELIGIBLE_PARTICIPANT_WHERE,
      },
      select: { participant: { select: { id: true, email: true } } },
    });
    for (const reg of registrations) {
      recipients.push({
        notificationId: crypto.randomUUID(),
        recipientType: 'participant',
        recipientId: reg.participant.id,
        email: reg.participant.email,
        variables: varsFor(reg.participant.id),
      });
    }
  } else {
    // allParticipants — bulk fan-out (milestone creation)
    // Announcements (new milestone / new event) go to APPROVED participants
    // only — a pending applicant or a rejected one must not be told about
    // hackathon activity. See mdfiles/pending-accounts-email.md.
    const participants = await prisma.participant.findMany({
      where: ELIGIBLE_PARTICIPANT_WHERE,
      select: { id: true, email: true },
    });
    for (const p of participants) {
      recipients.push({
        notificationId: crypto.randomUUID(),
        recipientType: 'participant',
        recipientId: p.id,
        email: p.email,
        variables: varsFor(p.id),
      });
    }
  }

  if (recipients.length === 0) return;

  // ---- dashboard rows ------------------------------------------------------
  await prisma.notification.createMany({
    data: recipients.map((r) => ({
      id: r.notificationId,
      title: renderTemplate(template.dashboardTitle, r.variables),
      message: renderTemplate(template.dashboardMessage, r.variables),
      type: template.type,
      recipientType: r.recipientType,
      recipientId: r.recipientId,
      relatedEntityType,
      relatedEntityId,
      actionUrl,
    })),
  });

  // ---- email (best-effort; never throws out of this function) -------------
  try {
    await sendTemplateEmails(template, variables, recipients, audience.kind, Boolean(perRecipient));
  } catch (error) {
    console.error(`Error sending emails for ${templateKey}:`, error);
  }
}

async function sendTemplateEmails(
  template: EffectiveTemplate,
  variables: TemplateVariables,
  recipients: PlannedRecipient[],
  audienceKind: Audience['kind'],
  individual: boolean = false
): Promise<void> {
  if (!template.emailEnabled) return;

  const settings = await getEmailSettings();
  if (!settings || !settings.enabled) return;

  const config = toSmtpConfig(settings);
  if (!config) return; // incomplete settings or undecryptable password

  const subject = renderTemplate(template.emailSubject, variables);
  const bodyText = renderTemplate(template.emailBody, variables);
  const startedAt = Date.now();

  // Per-recipient content (credentials etc.): one email per address, each
  // rendered with that recipient's own variables. Never BCC — a password must
  // only ever reach its owner. Admin audiences have no per-recipient email.
  if (individual && audienceKind !== 'admins') {
    for (const r of recipients) {
      if (!r.email) continue;
      if (Date.now() - startedAt > EMAIL_TIME_BUDGET_MS) {
        await prisma.emailLog.create({
          data: {
            templateKey: template.key,
            subject,
            toEmail: r.email,
            recipientCount: 1,
            status: 'failed',
            error: 'timeout: email time budget exceeded, remaining recipients skipped',
          },
        });
        continue;
      }
      const ownSubject = renderTemplate(template.emailSubject, r.variables);
      const result = await sendEmail({
        config,
        to: r.email,
        subject: ownSubject,
        title: ownSubject,
        bodyText: renderTemplate(template.emailBody, r.variables),
      });
      await stampEmailStatus([r.notificationId], result.ok ? 'sent' : 'failed');
      await logSendResult({ templateKey: template.key, subject: ownSubject, result });
    }
    return;
  }

  const stampOutcome = async (batch: PlannedRecipient[], result: SendEmailResult) => {
    const { sent, failed } = partitionByOutcome(batch, result);
    await stampEmailStatus(sent.map((r) => r.notificationId), 'sent');
    await stampEmailStatus(failed.map((r) => r.notificationId), 'failed');
  };

  if (audienceKind === 'admins') {
    // ONE email to the shared inbox; all admin rows get that email's status.
    // Blank inbox => skip silently, rows stay emailStatus=null (no red badges
    // on a fresh install).
    const inbox = settings.adminInboxEmail.trim();
    if (!inbox) return;

    const result = await sendEmail({ config, to: inbox, subject, title: subject, bodyText });
    await stampEmailStatus(recipients.map((r) => r.notificationId), result.ok ? 'sent' : 'failed');
    await logSendResult({ templateKey: template.key, subject, result });
    return;
  }

  const emailable = recipients.filter((r) => r.email);

  if (emailable.length === 0) return;

  if (emailable.length === 1) {
    const r = emailable[0];
    const result = await sendEmail({ config, to: r.email!, subject, title: subject, bodyText });
    await stampOutcome([r], result);
    await logSendResult({ templateKey: template.key, subject, result });
    return;
  }

  // Multi-recipient: BCC batches. Same content for everyone (BCC constraint —
  // bulk templates must not use per-recipient variables).
  const batches = chunkRecipients(emailable.map((r) => r.email!));
  let cursor = 0;

  for (const batch of batches) {
    const batchRecipients = emailable.slice(cursor, cursor + batch.length);
    cursor += batch.length;

    if (Date.now() - startedAt > EMAIL_TIME_BUDGET_MS) {
      const remaining = emailable.length - cursor + batch.length;
      await prisma.emailLog.create({
        data: {
          templateKey: template.key,
          subject,
          toEmail: `${remaining} مستلم متبقٍ`,
          recipientCount: remaining,
          status: 'failed',
          error: 'timeout: email time budget exceeded, remaining batches skipped',
        },
      });
      break;
    }

    const result = await sendEmail({ config, bcc: batch, subject, title: subject, bodyText });
    // Per-recipient stamps: 3 accepted + 1 rejected => 3 'sent' rows, 1 'failed' row.
    await stampOutcome(batchRecipients, result);
    await logSendResult({ templateKey: template.key, subject, result });
  }
}

/** Set `emailStatus` on a list of notification rows (no-op for an empty list). */
export async function stampEmailStatus(ids: string[], status: 'sent' | 'failed'): Promise<void> {
  if (ids.length === 0) return;
  await prisma.notification.updateMany({
    where: { id: { in: ids } },
    data: { emailStatus: status },
  });
}

/**
 * Split a recipient list by the transport's per-address verdict.
 * A recipient with no email address is reported as failed.
 */
export function partitionByOutcome<T extends { email?: string | null }>(
  recipients: T[],
  result: SendEmailResult
): { sent: T[]; failed: T[] } {
  const accepted = new Set(result.accepted.map((e) => e.toLowerCase()));
  const sent: T[] = [];
  const failed: T[] = [];
  for (const r of recipients) {
    if (r.email && accepted.has(r.email.toLowerCase())) sent.push(r);
    else failed.push(r);
  }
  return { sent, failed };
}

/**
 * Persist one send's outcome to EmailLog with REAL numbers: a `sent` row for
 * the accepted recipients and/or a `failed` row for the rejected ones. A
 * partial batch therefore produces two rows whose recipientCounts add up to
 * the batch size, instead of one all-or-nothing row.
 */
export async function logSendResult(params: {
  templateKey?: string;
  broadcastId?: string;
  subject: string;
  result: SendEmailResult;
}): Promise<void> {
  const { templateKey, broadcastId, subject, result } = params;
  const total = result.accepted.length + result.rejected.length;
  const label = (emails: string[]) => (total === 1 ? emails[0] : `${emails.length} مستلم`);

  if (result.accepted.length > 0) {
    await prisma.emailLog.create({
      data: {
        templateKey,
        broadcastId,
        subject,
        toEmail: label(result.accepted),
        recipientCount: result.accepted.length,
        status: 'sent',
        messageId: result.messageId,
        // On a partial batch, keep the rejection summary on the sent row too so
        // "why did only 3 of 4 go out?" is answerable from either row.
        error: result.rejected.length > 0 ? result.error : undefined,
      },
    });
  }

  if (result.rejected.length > 0) {
    await prisma.emailLog.create({
      data: {
        templateKey,
        broadcastId,
        subject,
        toEmail: label(result.rejected.map((r) => r.email)),
        recipientCount: result.rejected.length,
        status: 'failed',
        error: result.error ?? result.rejected.map((r) => `${r.email}: ${r.reason}`).join('; '),
      },
    });
  }

  if (total === 0) {
    await prisma.emailLog.create({
      data: {
        templateKey,
        broadcastId,
        subject,
        toEmail: '0 مستلم',
        recipientCount: 0,
        status: 'failed',
        error: result.error ?? 'no recipients',
      },
    });
  }
}

/**
 * Send one already-rendered email outside the template system (broadcasts).
 * Returns the per-recipient outcome for the caller to count and stamp.
 */
export async function sendRawEmail(params: {
  config: SmtpConfig;
  to?: string;
  bcc?: string[];
  subject: string;
  bodyText: string;
  broadcastId?: string;
}): Promise<SendEmailResult> {
  const result = await sendEmail({
    config: params.config,
    to: params.to,
    bcc: params.bcc,
    subject: params.subject,
    title: params.subject,
    bodyText: params.bodyText,
  });

  await logSendResult({ broadcastId: params.broadcastId, subject: params.subject, result });

  return result;
}
