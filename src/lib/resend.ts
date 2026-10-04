/**
 * Resend transport (https://resend.com/docs/api-reference/emails).
 *
 * Uses the HTTPS API, never SMTP — PaaS hosts (Vercel/Railway/Render) block
 * outbound SMTP ports, and HTTPS fails fast instead of hanging ~2 minutes.
 * Plain fetch instead of the `resend` SDK: the SDK resolves with
 * `{ data, error }` instead of rejecting, which makes it easy to turn a
 * failure into "sent"; here every outcome is mapped explicitly.
 *
 * Activation is env-driven — no code change to switch providers:
 *   RESEND_API_KEY  re_… key from Resend → API Keys
 *   MAIL_FROM       optional sender, default noreply@inma.org.sa; its domain
 *                   must be verified in Resend → Domains
 *   MAIL_FROM_NAME  optional display name (falls back to EmailSettings)
 * Without RESEND_API_KEY the SMTP settings from the admin's EmailSettings are
 * used and nothing changes.
 *
 * Every send is POST /emails/batch with ONE email object per recipient, so
 * each copy is addressed to its recipient alone (BCC privacy without a
 * self-addressed "to" copy) and per-recipient content (credentials) needs no
 * templating. Batches use permissive validation: a malformed address is
 * refused on its own instead of failing the other 99 in the call.
 *
 * Results are PER RECIPIENT, never collapsed into one all-or-nothing boolean.
 * "Accepted" means Resend's API took the email; bounces and complaints happen
 * later and show up in the Resend dashboard (or via webhooks), not here.
 * See mdfiles/email-per-recipient-accounting.md.
 */

/** Overridable so tests can point the transport at a local fake API. */
const RESEND_API_URL = (process.env.RESEND_API_URL || 'https://api.resend.com').replace(/\/+$/, '');
const REQUEST_TIMEOUT_MS = 15_000;
/** Emails per POST /emails/batch — Resend's maximum. */
export const RESEND_BATCH_SIZE = 100;
/**
 * A 429 rate_limit_exceeded (default limit: 10 requests/second per team) is
 * retried in place, waiting what `retry-after` asks for. Quota errors (daily /
 * monthly) are not: waiting seconds will not help, the queue's backoff will.
 */
const RATE_LIMIT_RETRIES = 2;
const MAX_RATE_LIMIT_WAIT_MS = 5_000;

/** The platform's sender; MAIL_FROM overrides it per environment. */
export const DEFAULT_MAIL_FROM = 'noreply@inma.org.sa';

export function getMailFrom(): string {
  return process.env.MAIL_FROM || DEFAULT_MAIL_FROM;
}

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export interface ResendEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface RecipientFailure {
  email: string;
  reason: string;
  /**
   * True when the PROVIDER refused this address (malformed, refused by
   * validation) — retrying will not help. False/undefined for transport-level
   * failures (API error, rate limit, timeout, network) that a later attempt
   * may succeed on.
   */
  permanent?: boolean;
}

export interface ResendSendResult {
  /** True when at least one recipient was accepted by Resend. */
  ok: boolean;
  /** Resend email id of the first accepted recipient. */
  messageId?: string;
  /** Summary of what went wrong — set on total failure AND on partial success. */
  error?: string;
  /** Recipient addresses Resend accepted. */
  accepted: string[];
  /** Recipient addresses that were not accepted, with the reason. */
  rejected: RecipientFailure[];
}

/** Total failure: every requested recipient is marked rejected with `reason`. */
function allRejected(recipients: string[], reason: string): ResendSendResult {
  return {
    ok: false,
    error: reason,
    accepted: [],
    rejected: recipients.map((email) => ({ email, reason })),
  };
}

export function summarizeRejections(rejected: RecipientFailure[], total: number): string {
  const detail = rejected
    .slice(0, 5)
    .map((r) => `${r.email}: ${r.reason}`)
    .join('; ');
  const more = rejected.length > 5 ? ` (+${rejected.length - 5} more)` : '';
  return `rejected ${rejected.length}/${total} — ${detail}${more}`;
}

/** `Name <address>`; characters that would break the header are dropped from the name. */
function formatFrom(fromName: string): string {
  const address = getMailFrom();
  const name = fromName.replace(/[<>"\r\n]/g, '').trim();
  return name ? `${name} <${address}>` : address;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface BatchResponse {
  data?: Array<{ id?: string } | null>;
  errors?: Array<{ index?: number; message?: string } | null>;
}

/** One POST /emails/batch call (≤ RESEND_BATCH_SIZE emails). */
async function sendBatch(emails: ResendEmail[], from: string): Promise<ResendSendResult> {
  const requested = emails.map((e) => e.to);

  for (let attempt = 0; ; attempt++) {
    let response: Response;
    let body: unknown;
    try {
      response = await fetch(`${RESEND_API_URL}/emails/batch`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          // Refuse invalid items one by one instead of failing the whole call.
          'x-batch-validation': 'permissive',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        body: JSON.stringify(
          emails.map((e) => ({ from, to: [e.to], subject: e.subject, html: e.html, text: e.text }))
        ),
      });
      body = await response.json().catch(() => null);
    } catch (error) {
      return allRejected(requested, `Resend request failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (!response.ok) {
      // API-level failure (bad key, unverified domain, rate limit, 5xx):
      // Resend answers with { statusCode, name, message }.
      const err = body as { name?: string; message?: string } | null;
      const name = err?.name ?? '';
      if (response.status === 429 && !/quota/.test(name) && attempt < RATE_LIMIT_RETRIES) {
        const retryAfterSec = Number(response.headers.get('retry-after'));
        await sleep(Math.min(MAX_RATE_LIMIT_WAIT_MS, retryAfterSec > 0 ? retryAfterSec * 1000 : 1000));
        continue;
      }
      const detail = name
        ? `Resend ${name}: ${err?.message ?? `HTTP ${response.status}`}`
        : `Resend HTTP ${response.status}: ${JSON.stringify(body).slice(0, 200)}`;
      return allRejected(requested, detail);
    }

    const result = body as BatchResponse | null;
    if (!result || !Array.isArray(result.data)) {
      return allRejected(requested, `Resend returned an unexpected response: ${JSON.stringify(body).slice(0, 200)}`);
    }

    // Per-recipient verdicts come from `errors` (by index into the request).
    // `data` is not read per index: the API docs do not pin down whether a
    // refused item keeps its slot in it.
    const refused = new Map<number, string>();
    for (const e of result.errors ?? []) {
      if (e && Number.isInteger(e.index) && (e.index as number) >= 0 && (e.index as number) < emails.length) {
        refused.set(e.index as number, e.message || 'invalid email');
      }
    }

    const accepted: string[] = [];
    const rejected: RecipientFailure[] = [];
    emails.forEach((email, i) => {
      const reason = refused.get(i);
      if (reason === undefined) accepted.push(email.to);
      else rejected.push({ email: email.to, reason: `invalid: ${reason}`, permanent: true });
    });

    return {
      ok: accepted.length > 0,
      messageId: accepted.length > 0 ? result.data.find((d) => d?.id)?.id : undefined,
      error: rejected.length > 0 ? `Resend ${summarizeRejections(rejected, emails.length)}` : undefined,
      accepted,
      rejected,
    };
  }
}

/**
 * Send one email per item, RESEND_BATCH_SIZE per API call. Callers already
 * chunk to that size; larger lists are split here rather than refused.
 */
export async function sendViaResend(emails: ResendEmail[], fromName: string): Promise<ResendSendResult> {
  if (emails.length === 0) return allRejected([], 'no recipients');

  const from = formatFrom(fromName);
  const accepted: string[] = [];
  const rejected: RecipientFailure[] = [];
  let messageId: string | undefined;
  const errors: string[] = [];

  for (let i = 0; i < emails.length; i += RESEND_BATCH_SIZE) {
    const r = await sendBatch(emails.slice(i, i + RESEND_BATCH_SIZE), from);
    accepted.push(...r.accepted);
    rejected.push(...r.rejected);
    if (!messageId && r.messageId) messageId = r.messageId;
    if (r.error) errors.push(r.error);
  }

  return {
    ok: accepted.length > 0,
    messageId,
    error: errors.length > 0 ? errors.join(' | ') : undefined,
    accepted,
    rejected,
  };
}
