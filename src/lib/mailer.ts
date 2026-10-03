import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { prisma } from './prisma';
import { decryptSecret } from './crypto';
import { getAppBaseUrl } from './credentials';
import {
  isMandrillConfigured,
  sendViaMandrill,
  sendViaMandrillMerge,
  summarizeRejections,
  MANDRILL_MERGE_BATCH_SIZE,
  type RecipientFailure,
} from './mandrill';

export type { RecipientFailure } from './mandrill';

/**
 * Email delivery. Transport is chosen per call, not at boot:
 *   1. MAILCHIMP_API_KEY + MAIL_FROM set  -> Mandrill HTTPS API (see mandrill.ts)
 *   2. otherwise                          -> SMTP from the admin-configured EmailSettings row
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
 * Recipients per Mandrill API call. Mandrill accepts up to 1,000 per call;
 * 500 leaves headroom and turns a 5,000-recipient broadcast into 10 HTTPS
 * round-trips instead of 100. See mdfiles/email-queue.md §Option 1.
 */
export const MANDRILL_BATCH_SIZE = 500;

/** Per-call recipient cap for whichever transport is active right now. */
export function getBatchSize(): number {
  return isMandrillConfigured() ? MANDRILL_BATCH_SIZE : BCC_BATCH_SIZE;
}

/**
 * How many INDIVIDUAL emails (each with its own content) one send call may
 * carry: Mandrill takes 100 per merge-var call; SMTP has to send them one by
 * one, so a small batch keeps the queue's time-budget checks frequent.
 */
export const SMTP_INDIVIDUAL_BATCH_SIZE = 5;
export function getIndividualBatchSize(): number {
  return isMandrillConfigured() ? MANDRILL_MERGE_BATCH_SIZE : SMTP_INDIVIDUAL_BATCH_SIZE;
}

export interface IndividualEmail {
  to: string;
  subject: string;
  bodyText: string;
}

/**
 * Send a batch of emails that each have their OWN subject/body (credentials):
 * one merge-var API call on Mandrill, a sequential loop on SMTP. Returns one
 * aggregated per-recipient result, exactly like sendEmail().
 */
export async function sendIndividualEmails(params: {
  config: SmtpConfig;
  items: IndividualEmail[];
  audience?: EmailAudience;
}): Promise<SendEmailResult> {
  const { config, items, audience } = params;
  if (items.length === 0) return { ok: false, error: 'no recipients', accepted: [], rejected: [] };

  if (isMandrillConfigured()) {
    const supportText = renderSupportChannelsText(audience);
    console.log(`📧 Email transport: mandrill merge batch (${items.length} individual recipients)`);
    const result = await sendViaMandrillMerge(
      items.map((i) => ({
        email: i.to,
        subject: i.subject,
        html: renderEmailHtml(i.subject, i.bodyText, audience),
        text: supportText ? `${i.bodyText}\n\n${supportText}` : i.bodyText,
      })),
      process.env.MAIL_FROM_NAME || config.fromName
    );
    if (result.error) console.error(`[email] mandrill merge ${result.ok ? 'partial' : 'failed'}: ${result.error}`);
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

export async function getEmailSettings(): Promise<EmailSettingsRow | null> {
  return prisma.emailSettings.findFirst();
}

/**
 * Settings row -> plaintext SMTP config, or null when incomplete/undecryptable.
 */
export function toSmtpConfig(row: EmailSettingsRow): SmtpConfig | null {
  // Mandrill ignores the SMTP fields — never block sending on a blank host or
  // an undecryptable password when it is the active transport.
  if (isMandrillConfigured()) {
    return {
      host: row.host,
      port: row.port,
      secure: row.secure,
      username: row.username,
      password: '',
      fromEmail: process.env.MAIL_FROM as string,
      fromName: row.fromName || process.env.MAIL_FROM_NAME || '',
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

const FOOTER_LINK_STYLE = 'color:#620f10;text-decoration:none';

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

  return `<style>
  /* Phones get the smaller logo strip. Inline styles carry the desktop size, so
     a client that drops <style> (older Outlook, some Gmail cases) simply keeps
     the desktop sizes — nothing breaks, the logos are just bigger. !important
     is required to beat the inline styles and the width/height attributes. */
  @media only screen and (max-width: 480px) {
    .em-logo1 { width: 43px !important; height: 43px !important; }
    .em-logo2 { width: 38px !important; height: 38px !important; }
    .em-logo3 { width: 76px !important; height: 34px !important; }
  }
</style>
<div dir="rtl" lang="ar" style="direction:rtl;text-align:right;font-family:Tahoma,Arial,sans-serif;background:#f4f6f8;padding:24px">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e6e2df">
    <div style="background:#ffffff;padding:18px 24px;text-align:center;border-bottom:1px solid #efeae6">
      <img class="em-logo1" src="${baseUrl}/logos/logo011.webp" alt="" width="85" height="85" style="width:85px;height:85px;display:inline-block;border:0;vertical-align:middle;margin:0 8px">
      <img class="em-logo2" src="${baseUrl}/logos/02.png" alt="جامعة دار الحكمة" width="76" height="76" style="width:76px;height:76px;display:inline-block;border:0;vertical-align:middle;margin:0 8px">
      <img class="em-logo3" src="${baseUrl}/logos/03.png" alt="" width="152" height="68" style="width:152px;height:68px;display:inline-block;border:0;vertical-align:middle;margin:0 8px">
    </div>
    <div style="background:#620f10;padding:12px 24px;text-align:center">
      <img src="${baseUrl}/email/hikma-mark.png" alt="" width="25" height="44" style="width:25px;height:44px;display:inline-block;border:0;vertical-align:middle;margin:0 6px">
      <span style="color:#fccd8d;font-size:15px;font-weight:bold">جائزة مايدة محي الدين ناظر للابتكار 4</span>
    </div>
    <div style="padding:24px">
      <h2 style="margin:0 0 12px;font-size:16px;color:#620f10">${titleHtml}</h2>
      <p style="margin:0;font-size:14px;line-height:1.9;color:#494b4c">${bodyHtml}</p>
    </div>
    <div style="height:3px;background:#fccd8d"></div>
    <div style="padding:12px 24px;background:#fff2e9;color:#7b5b4a;font-size:12px;line-height:1.8">
      هذه رسالة آلية من منصة جائزة مايدة محي الدين ناظر للابتكار يرجى عدم الرد عليها.${supportHtml}
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

  if (isMandrillConfigured()) {
    console.log(`📧 Email transport: mandrill (to=${to ?? 'sender'}, bcc=${bcc?.length ?? 0})`);
    const result = await sendViaMandrill({
      to,
      bcc,
      subject,
      html: renderEmailHtml(title, bodyText, audience),
      text,
      fromName: process.env.MAIL_FROM_NAME || config.fromName,
    });
    // `error` is also set on PARTIAL success (some recipients rejected) — log it either way.
    if (result.error) console.error(`[email] mandrill ${result.ok ? 'partial' : 'failed'}: ${result.error}`);
    return result;
  }

  const requested = [...(to ? [to] : []), ...(bcc ?? [])];
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
