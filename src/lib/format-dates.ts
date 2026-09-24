/**
 * Server-side date formatting for notifications and emails.
 *
 * The app runs in UTC on Vercel / in Docker, so `toLocaleString('ar-SA')`
 * without a timeZone printed times 3 hours early. Everything the platform
 * sends to people is Saudi local time, so all server-side formatting goes
 * through these helpers with an explicit Asia/Riyadh zone.
 */
export const APP_TIME_ZONE = 'Asia/Riyadh';

const DATE_TIME = new Intl.DateTimeFormat('ar-SA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const DATE_ONLY = new Intl.DateTimeFormat('ar-SA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

/** e.g. "١٧ ربيع الأول ١٤٤٨ هـ في ١٠:٣٠ م" — date + time in Riyadh. */
export function formatRiyadhDateTime(value: Date | string): string {
  return DATE_TIME.format(new Date(value));
}

/** Date only, in Riyadh (deadlines). */
export function formatRiyadhDate(value: Date | string): string {
  return DATE_ONLY.format(new Date(value));
}
