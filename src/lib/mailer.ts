import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { prisma } from './prisma';
import { decryptSecret } from './crypto';
import { getAppBaseUrl } from './credentials';
import {
  isResendConfigured,
  getMailFrom,
  sendViaResend,
  summarizeRejections,
  RESEND_BATCH_SIZE,
  type RecipientFailure,
} from './resend';

export type { RecipientFailure } from './resend';

/**
 * Email delivery. Transport is chosen per call, not at boot:
 *   1. RESEND_API_KEY set  -> Resend HTTPS API, sender MAIL_FROM or noreply@inma.org.sa (see resend.ts)
 *   2. otherwise           -> SMTP from the admin-configured EmailSettings row
 * The EmailSettings `enabled` master switch gates sending for both transports.
 *
 * All sends are best-effort: callers wrap in try/catch (the codebase-wide
 * convention that a notification failure never fails the business action).
 */

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string; // plaintext at this layer
  fromEmail: string;
  fromName: string;
}

export interface EmailSettingsRow {
  id: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string; // encrypted at rest
  fromEmail: string;
  fromName: string;
  adminInboxEmail: string;
  enabled: boolean;
}

/** Recipients per SMTP message for bulk fan-outs (300 recipients = 6 messages). */
export const BCC_BATCH_SIZE = 50;

/**
 * Per-call recipient cap for whichever transport is active right now. Resend
 * takes 100 emails per batch call (one per recipient), so a 5,000-recipient
 * broadcast is 50 HTTPS round-trips. See mdfiles/email-queue.md §Option 1.
 */
export function getBatchSize(): number {
  return isResendConfigured() ? RESEND_BATCH_SIZE : BCC_BATCH_SIZE;
}

/**
 * How many INDIVIDUAL emails (each with its own content) one send call may
 * carry: Resend takes 100 per batch call; SMTP has to send them one by one,
 * so a small batch keeps the queue's time-budget checks frequent.
 */
export const SMTP_INDIVIDUAL_BATCH_SIZE = 5;
export function getIndividualBatchSize(): number {
  return isResendConfigured() ? RESEND_BATCH_SIZE : SMTP_INDIVIDUAL_BATCH_SIZE;
}

export interface IndividualEmail {
  to: string;
  subject: string;
  bodyText: string;
}

/**
 * Send a batch of emails that each have their OWN subject/body (credentials):
 * one batch API call on Resend, a sequential loop on SMTP. Returns one
 * aggregated per-recipient result, exactly like sendEmail().
 */
export async function sendIndividualEmails(params: {
  config: SmtpConfig;
  items: IndividualEmail[];
  audience?: EmailAudience;
}): Promise<SendEmailResult> {
  const { config, items, audience } = params;
  if (items.length === 0) return { ok: false, error: 'no recipients', accepted: [], rejected: [] };

  if (isResendConfigured()) {
    const supportText = renderSupportChannelsText(audience);
    console.log(`📧 Email transport: resend batch (${items.length} individual recipients)`);
    const result = await sendViaResend(
      items.map((i) => ({
        to: i.to,
        subject: i.subject,
        html: renderEmailHtml(i.subject, i.bodyText, audience),
        text: supportText ? `${i.bodyText}\n\n${supportText}` : i.bodyText,
      })),
      senderName(config)
    );
    if (result.error) console.error(`[email] resend batch ${result.ok ? 'partial' : 'failed'}: ${result.error}`);
    return result;
  }

  const accepted: string[] = [];
  const rejected: RecipientFailure[] = [];
  let messageId: string | undefined;
  for (const item of items) {
    const r = await sendEmail({ config, to: item.to, subject: item.subject, title: item.subject, bodyText: item.bodyText, audience });
    accepted.push(...r.accepted);
    rejected.push(...r.rejected);
    if (!messageId && r.messageId) messageId = r.messageId;
  }
  return {
    ok: accepted.length > 0,
    messageId,
    error: rejected.length > 0 ? `SMTP ${summarizeRejections(rejected, items.length)}` : undefined,
    accepted,
    rejected,
  };
}

/** Display name on Resend sends: env, then the admin's EmailSettings, then the event name. */
function senderName(config: SmtpConfig): string {
  return process.env.MAIL_FROM_NAME || config.fromName || BRAND_NAME;
}

export async function getEmailSettings(): Promise<EmailSettingsRow | null> {
  return prisma.emailSettings.findFirst();
}

/**
 * Settings row -> plaintext SMTP config, or null when incomplete/undecryptable.
 */
export function toSmtpConfig(row: EmailSettingsRow): SmtpConfig | null {
  // Resend ignores the SMTP fields — never block sending on a blank host or
  // an undecryptable password when it is the active transport.
  if (isResendConfigured()) {
    return {
      host: row.host,
      port: row.port,
      secure: row.secure,
      username: row.username,
      password: '',
      fromEmail: getMailFrom(),
      fromName: row.fromName || process.env.MAIL_FROM_NAME || BRAND_NAME,
    };
  }

  if (!row.host || !row.fromEmail) return null;

  const password = decryptSecret(row.password);
  if (password === null) return null; // decrypt failure — admin must re-enter

  return {
    host: row.host,
    port: row.port,
    secure: row.secure,
    username: row.username,
    password,
    fromEmail: row.fromEmail,
    fromName: row.fromName,
  };
}

function buildTransport(config: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    ...(config.username
      ? { auth: { user: config.username, pass: config.password } }
      : {}),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Who an email is addressed to — selects the support-channels footer. */
export type EmailAudience = 'participant' | 'mentor' | 'admin';

export const SUPPORT_EMAIL = 'wmvc@wadimakkah.sa';
export const SUPPORT_TELEGRAM_URL = 'https://t.me/+4boPQPRmGuAzNmI0';

/** Shown in every email — kept as text so it survives clients that block images. */
const BRAND_NAME = 'هاكثون الطفولة';
const BRAND_TAGLINE = 'من تحدٍ حقيقي... إلى فرصة للابتكار';
const ORGANIZER_NAME = 'جمعية إنماء لرعاية الطفولة';

/* The هاكثون الطفولة palette as literal hex: email clients ignore CSS variables. */
const NAVY = '#22406b';
const HONEY = '#f0a63b';
const CREAM = '#fbf4ea';

const FOOTER_LINK_STYLE = `color:${NAVY};text-decoration:none`;

/**
 * Support-channels lines for the grey footer, same style as the automated
 * message line: e-mail and the Telegram group. Only participants and mentors
 * get them; admin/unknown audiences get nothing extra.
 */
function renderSupportChannelsHtml(audience?: EmailAudience): string {
  if (audience !== 'participant' && audience !== 'mentor') return '';
  const mail = `<a href="mailto:${SUPPORT_EMAIL}" style="${FOOTER_LINK_STYLE}" dir="ltr">${SUPPORT_EMAIL}</a>`;
  const telegram = `<a href="${SUPPORT_TELEGRAM_URL}" style="${FOOTER_LINK_STYLE}" dir="ltr">${SUPPORT_TELEGRAM_URL}</a>`;
  return (
    `<div style="margin-top:8px">للاستفسار يرجى التواصل عبر القنوات التالية:</div>` +
    `<div>البريد: ${mail}</div>` +
    `<div>تيليجرام: ${telegram}</div>`
  );
}

/** Plain-text twin of the support-channels footer (for the text/plain part). */
export function renderSupportChannelsText(audience?: EmailAudience): string {
  if (audience !== 'participant' && audience !== 'mentor') return '';
  return `للاستفسار يرجى التواصل عبر القنوات التالية:
البريد: ${SUPPORT_EMAIL}
تيليجرام: ${SUPPORT_TELEGRAM_URL}`;
}

/**
 * Wrap already-escaped plain-text content in the fixed RTL HTML shell.
 * `dir`/alignment live on an inner div because Gmail strips <html>/<head>
 * attributes. `audience` picks the support-channels footer.
 */
export function renderEmailHtml(title: string, bodyText: string, audience?: EmailAudience): string {
  const bodyHtml = escapeHtml(bodyText).replace(/\r?\n/g, '<br>');
  const titleHtml = escapeHtml(title);
  // Email clients require absolute image URLs.
  const baseUrl = getAppBaseUrl();
  const supportHtml = renderSupportChannelsHtml(audience);

  // The line above the footer is a table cell, not an empty div: Outlook would
  // draw the div a full text line tall.
  return `<style>
  /* Phones get smaller logos. Inline styles carry the desktop size, so a
     client that drops <style> (older Outlook, some Gmail cases) simply keeps
     the desktop sizes — nothing breaks, the logos are just bigger. !important
     is required to beat the inline styles and the width/height attributes. */
  @media only screen and (max-width: 480px) {
    .em-logo { width: 100px !important; height: 42px !important; }
    .em-org { width: 72px !important; height: 42px !important; }
  }
</style>
<div dir="rtl" lang="ar" style="direction:rtl;text-align:right;font-family:Tahoma,Arial,sans-serif;background:${CREAM};padding:24px">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e8dcc9">
    <div style="background:#ffffff;padding:20px 24px;text-align:center">
      <img class="em-logo" src="${baseUrl}/email/childhood-logo.png" alt="${BRAND_NAME}" width="134" height="56" style="width:134px;height:56px;display:inline-block;border:0;vertical-align:middle;margin:0 10px">
      <img class="em-org" src="${baseUrl}/email/inma-logo.png" alt="${ORGANIZER_NAME}" width="96" height="56" style="width:96px;height:56px;display:inline-block;border:0;vertical-align:middle;margin:0 10px">
    </div>
    <div style="background:${NAVY};padding:12px 24px;text-align:center">
      <div style="color:${CREAM};font-size:15px;font-weight:bold">${BRAND_NAME}</div>
      <div style="color:${HONEY};font-size:13px;margin-top:2px">${BRAND_TAGLINE}</div>
    </div>
    <div style="padding:24px">
      <h2 style="margin:0 0 12px;font-size:16px;color:${NAVY}">${titleHtml}</h2>
      <p style="margin:0;font-size:14px;line-height:1.9;color:#4a3f35">${bodyHtml}</p>
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td style="height:3px;line-height:3px;font-size:0;background:${NAVY}">&nbsp;</td></tr></table>
    <div style="padding:12px 24px;background:${CREAM};color:#6d6155;font-size:12px;line-height:1.8">
      هذه رسالة آلية من منصة ${BRAND_NAME} يرجى عدم الرد عليها.${supportHtml}
    </div>
  </div>
</div>`;
}

/**
 * Per-recipient outcome of one send. `ok` is "at least one recipient was
 * accepted"; callers that need counts read `accepted` / `rejected` instead of
 * the boolean, so a 3-of-4 batch is never reported as 0-of-4.
 * See mdfiles/email-per-recipient-accounting.md.
 */
export interface SendEmailResult {
  ok: boolean;
  messageId?: string;
  /** Summary — set on total failure AND on partial success. */
  error?: string;
  /** Requested recipients (to + bcc) the transport accepted. */
  accepted: string[];
  /** Requested recipients the transport rejected, with the reason. */
  rejected: RecipientFailure[];
}

export interface SendEmailParams {
  config: SmtpConfig;
  to?: string;
  bcc?: string[];
  subject: string;
  title: string;    // heading inside the HTML shell
  bodyText: string; // plain text; escaped + <br>-converted here
  /** Selects the support-channels footer (participant / mentor). */
  audience?: EmailAudience;
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const { config, to, bcc, subject, title, bodyText, audience } = params;
  const supportText = renderSupportChannelsText(audience);
  const text = supportText ? `${bodyText}\n\n${supportText}` : bodyText;

  const requested = [...(to ? [to] : []), ...(bcc ?? [])];

  if (isResendConfigured()) {
    console.log(`📧 Email transport: resend (to=${to ?? 'none'}, bcc=${bcc?.length ?? 0})`);
    // One copy per address, each addressed to its recipient alone: BCC
    // privacy without the sender self-copy the SMTP path needs.
    const html = renderEmailHtml(title, bodyText, audience);
    const result = await sendViaResend(
      requested.map((email) => ({ to: email, subject, html, text })),
      senderName(config)
    );
    // `error` is also set on PARTIAL success (some recipients rejected) — log it either way.
    if (result.error) console.error(`[email] resend ${result.ok ? 'partial' : 'failed'}: ${result.error}`);
    return result;
  }

  const transport = buildTransport(config);

  try {
    const info = await transport.sendMail({
      from: config.fromName ? `"${config.fromName}" <${config.fromEmail}>` : config.fromEmail,
      ...(to ? { to } : { to: config.fromEmail }), // BCC-only sends address the sender
      ...(bcc && bcc.length > 0 ? { bcc } : {}),
      subject,
      html: renderEmailHtml(title, bodyText, audience),
      text,
    });

    // nodemailer reports the SMTP envelope verdict per address. The sender
    // self-copy (BCC-only sends) is deliberately excluded from accounting —
    // only the addresses the caller asked for count.
    const acceptedSet = new Set(info.accepted.map(addressOf));
    const rejectedSet = new Set(info.rejected.map(addressOf));
    const accepted: string[] = [];
    const rejected: RecipientFailure[] = [];
    for (const email of requested) {
      const key = email.toLowerCase();
      if (rejectedSet.has(key)) rejected.push({ email, reason: 'rejected by SMTP server', permanent: true });
      else if (acceptedSet.has(key)) accepted.push(email);
      else rejected.push({ email, reason: 'not accepted by SMTP server' });
    }

    return {
      ok: accepted.length > 0,
      messageId: info.messageId,
      error: rejected.length > 0 ? `SMTP ${summarizeRejections(rejected, requested.length)}` : undefined,
      accepted,
      rejected,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: reason,
      accepted: [],
      rejected: requested.map((email) => ({ email, reason })),
    };
  } finally {
    transport.close();
  }
}

/** nodemailer's accepted/rejected entries are strings or {address} objects. */
function addressOf(entry: string | { address: string }): string {
  return (typeof entry === 'string' ? entry : entry.address).toLowerCase();
}

/** Split a recipient list into per-call batches sized for the active transport. */
export function chunkRecipients(emails: string[], size: number = getBatchSize()): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < emails.length; i += size) {
    chunks.push(emails.slice(i, i + size));
  }
  return chunks;
}
