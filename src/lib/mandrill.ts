/**
 * Mailchimp Transactional (Mandrill) transport.
 *
 * Uses the HTTPS API, never SMTP — PaaS hosts (Vercel/Railway/Render) block
 * outbound SMTP ports, and HTTPS fails fast instead of hanging ~2 minutes.
 * Plain fetch instead of @mailchimp/mailchimp_transactional: the SDK resolves
 * (not rejects) on failure, which silently converts errors into "sent".
 * Operational guide: mdfiles/Mandrill_Implementation.md.
 *
 * Activation is env-driven — no code change to switch providers:
 *   MAILCHIMP_API_KEY  md-… key from Mandrill → Settings → API Keys
 *   MAIL_FROM          sender on the EXACT verified sending domain
 *   MAIL_FROM_NAME     optional display name (falls back to EmailSettings)
 * Both MAILCHIMP_API_KEY and MAIL_FROM must be set, otherwise the existing
 * SMTP path is used and nothing changes.
 *
 * Results are PER RECIPIENT. Mandrill answers with one status per address, so
 * a bulk send where 3 of 4 addresses are accepted is reported as exactly that
 * — never collapsed into a single all-or-nothing boolean.
 * See mdfiles/email-per-recipient-accounting.md.
 */

/** Overridable so tests can point the transport at a local fake API. */
const MANDRILL_SEND_URL = process.env.MANDRILL_API_URL || 'https://mandrillapp.com/api/1.0/messages/send.json';
const REQUEST_TIMEOUT_MS = 15_000;
/**
 * Recipients per merge-var call (each with their OWN subject/body). Mandrill
 * allows 1,000 recipients per call; 100 keeps the request body small
 * (credential emails are ~3 KB each rendered) and one failure re-tries few.
 */
export const MANDRILL_MERGE_BATCH_SIZE = 100;

export function isMandrillConfigured(): boolean {
  return Boolean(process.env.MAILCHIMP_API_KEY && process.env.MAIL_FROM);
}

export interface MandrillSendParams {
  to?: string;
  bcc?: string[];
  subject: string;
  html: string;
  text: string;
  fromName: string;
}

export interface RecipientFailure {
  email: string;
  reason: string;
  /**
   * True when the PROVIDER refused this address (hard-bounce, invalid,
   * blacklisted) — retrying will not help. False/undefined for transport-level
   * failures (API error, timeout, network) that a later attempt may succeed on.
   */
  permanent?: boolean;
}

export interface MandrillSendResult {
  /** True when at least one recipient was accepted by Mandrill. */
  ok: boolean;
  /** Mandrill `_id` of the first accepted recipient. */
  messageId?: string;
  /** Summary of what went wrong — set on total failure AND on partial success. */
  error?: string;
  /** Recipient addresses Mandrill accepted (sent / queued / scheduled). */
  accepted: string[];
  /** Recipient addresses Mandrill rejected, with its reason. */
  rejected: RecipientFailure[];
}

interface MandrillRecipientResult {
  email: string;
  status: string; // sent | queued | scheduled | rejected | invalid
  reject_reason?: string | null;
  _id?: string;
}

/** Every address we asked Mandrill to deliver to, in request order. */
function requestedRecipients(to: string | undefined, bcc: string[] | undefined): string[] {
  return [...(to ? [to] : []), ...(bcc ?? [])];
}

/** Total failure: every requested recipient is marked rejected with `reason`. */
function allRejected(recipients: string[], reason: string): MandrillSendResult {
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

export interface MandrillMergeItem {
  email: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Map Mandrill's per-recipient verdict array onto the addresses we asked for.
 * Shared by the plain and the merge-var send.
 */
function collectResults(requested: string[], results: MandrillRecipientResult[]): MandrillSendResult {
  const byEmail = new Map<string, MandrillRecipientResult>();
  for (const r of results) byEmail.set(r.email.toLowerCase(), r);

  const accepted: string[] = [];
  const rejected: RecipientFailure[] = [];
  let messageId: string | undefined;

  for (const email of requested) {
    const r = byEmail.get(email.toLowerCase());
    if (!r) {
      rejected.push({ email, reason: 'missing from Mandrill response' });
    } else if (r.status === 'rejected' || r.status === 'invalid') {
      rejected.push({
        email,
        reason: `${r.status}: ${r.reject_reason ?? 'invalid recipient'}`,
        permanent: true,
      });
    } else {
      // sent | queued (over hourly quota — Mandrill delivers later) | scheduled
      accepted.push(email);
      if (!messageId && r._id) messageId = r._id;
    }
  }

  return {
    ok: accepted.length > 0,
    messageId,
    error: rejected.length > 0 ? `Mandrill ${summarizeRejections(rejected, requested.length)}` : undefined,
    accepted,
    rejected,
  };
}

async function postToMandrill(message: Record<string, unknown>, requested: string[]): Promise<MandrillSendResult | MandrillRecipientResult[]> {
  try {
    const response = await fetch(MANDRILL_SEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({ key: process.env.MAILCHIMP_API_KEY, message }),
    });
    const body: unknown = await response.json().catch(() => null);
    // API-level failure (bad key, 5xx) — Mandrill returns a JSON error object.
    if (!Array.isArray(body)) {
      const err = body as { status?: string; name?: string; message?: string } | null;
      const detail =
        err && err.status === 'error'
          ? `Mandrill ${err.name}: ${err.message}`
          : `Mandrill HTTP ${response.status}: ${JSON.stringify(body).slice(0, 200)}`;
      return allRejected(requested, detail);
    }
    if (body.length === 0) return allRejected(requested, 'Mandrill returned an empty result array');
    return body as MandrillRecipientResult[];
  } catch (error) {
    return allRejected(requested, `Mandrill request failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * ONE API call delivering a DIFFERENT subject/body to each recipient
 * (credential emails). Uses Mandrill merge variables: the message carries only
 * the tags, and each recipient's own rendered subject/html/text is supplied in
 * `merge_vars` for that address; with preserve_recipients=false every copy is
 * addressed to its recipient alone. Verdicts are per recipient as usual.
 */
export async function sendViaMandrillMerge(items: MandrillMergeItem[], fromName: string): Promise<MandrillSendResult> {
  const requested = items.map((i) => i.email);
  if (requested.length === 0) return allRejected([], 'no recipients');
  if (requested.length > MANDRILL_MERGE_BATCH_SIZE) {
    return allRejected(requested, `merge batch too large (${requested.length} > ${MANDRILL_MERGE_BATCH_SIZE})`);
  }
  const outcome = await postToMandrill(
    {
      from_email: process.env.MAIL_FROM as string,
      from_name: fromName,
      to: items.map((i) => ({ email: i.email, type: 'to' as const })),
      subject: '*|EMAILSUBJECT|*',
      html: '*|EMAILHTML|*',
      text: '*|EMAILTEXT|*',
      auto_text: false,
      track_opens: false,
      track_clicks: false,
      preserve_recipients: false,
      merge: true,
      merge_language: 'mailchimp',
      merge_vars: items.map((i) => ({
        rcpt: i.email,
        vars: [
          { name: 'EMAILSUBJECT', content: i.subject },
          { name: 'EMAILHTML', content: i.html },
          { name: 'EMAILTEXT', content: i.text },
        ],
      })),
    },
    requested
  );
  return Array.isArray(outcome) ? collectResults(requested, outcome) : outcome;
}

export async function sendViaMandrill(params: MandrillSendParams): Promise<MandrillSendResult> {
  const { to, bcc, subject, html, text, fromName } = params;
  const fromEmail = process.env.MAIL_FROM as string;
  const requested = requestedRecipients(to, bcc);

  if (requested.length === 0) {
    return allRejected([], 'no recipients');
  }

  // Every address is a plain `to` entry. With preserve_recipients=false
  // Mandrill delivers a separate copy per address and each copy shows only
  // its own recipient, so BCC privacy is preserved WITHOUT a self-addressed
  // "to" copy to MAIL_FROM. (The old self-copy hard-bounced on a no-reply
  // mailbox, landed on the Rejection Blacklist, and then poisoned every
  // batch — see the accounting doc.)
  const recipients = requested.map((email) => ({ email, type: 'to' as const }));

  try {
    const response = await fetch(MANDRILL_SEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        key: process.env.MAILCHIMP_API_KEY,
        message: {
          from_email: fromEmail, // must match the verified sending domain exactly
          from_name: fromName,
          to: recipients,
          subject,
          html,
          text,
          auto_text: false,
          track_opens: false,
          track_clicks: false,
          preserve_recipients: false, // recipients never see each other
        },
      }),
    });

    const body: unknown = await response.json().catch(() => null);

    // API-level failure (bad key, 5xx) — Mandrill returns a JSON error object.
    if (!Array.isArray(body)) {
      const err = body as { status?: string; name?: string; message?: string } | null;
      const detail =
        err && err.status === 'error'
          ? `Mandrill ${err.name}: ${err.message}`
          : `Mandrill HTTP ${response.status}: ${JSON.stringify(body).slice(0, 200)}`;
      return allRejected(requested, detail);
    }

    const results = body as MandrillRecipientResult[];
    if (results.length === 0) {
      return allRejected(requested, 'Mandrill returned an empty result array');
    }

    // Per-recipient verdicts. Match case-insensitively; an address Mandrill
    // did not echo back at all is treated as rejected rather than assumed sent.
    const byEmail = new Map<string, MandrillRecipientResult>();
    for (const r of results) byEmail.set(r.email.toLowerCase(), r);

    const accepted: string[] = [];
    const rejected: RecipientFailure[] = [];
    let messageId: string | undefined;

    for (const email of requested) {
      const r = byEmail.get(email.toLowerCase());
      if (!r) {
        rejected.push({ email, reason: 'missing from Mandrill response' });
      } else if (r.status === 'rejected' || r.status === 'invalid') {
        rejected.push({
          email,
          reason: `${r.status}: ${r.reject_reason ?? 'invalid recipient'}`,
          permanent: true,
        });
      } else {
        accepted.push(email);
        if (!messageId && r._id) messageId = r._id;
      }
    }

    return {
      ok: accepted.length > 0,
      messageId,
      error: rejected.length > 0 ? `Mandrill ${summarizeRejections(rejected, requested.length)}` : undefined,
      accepted,
      rejected,
    };
  } catch (error) {
    return allRejected(
      requested,
      `Mandrill request failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
