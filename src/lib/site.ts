/**
 * Public origin of the site, without a trailing slash. Every absolute URL the
 * app emits comes from here: canonical links, the og:image that WhatsApp and
 * Teams previews fetch, robots.txt / sitemap.xml, and links inside e-mails.
 *
 *   1. NEXT_PUBLIC_APP_URL            set per environment (the Docker image also
 *                                     receives it as a build arg; the local
 *                                     Docker stack and dev:local-db point it at
 *                                     localhost)
 *   2. VERCEL_PROJECT_PRODUCTION_URL  Vercel's production domain, automatic
 *   3. PRODUCTION_SITE_URL            so a server that was not given
 *                                     NEXT_PUBLIC_APP_URL still emits the real
 *                                     domain, never localhost, in e-mails and
 *                                     share previews
 *
 * Static pages bake this in at BUILD time, so set it for the build, not only
 * at runtime.
 */
export const PRODUCTION_SITE_URL = 'https://hackathon.inma.org.sa';

/**
 * Accepts the value with or without a scheme: "hackathon.inma.org.sa" becomes
 * "https://hackathon.inma.org.sa". A bare domain used to reach
 * `new URL()` in the root layout as-is and fail the build.
 */
function normalizeOrigin(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return normalizeOrigin(explicit);
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return normalizeOrigin(vercel);
  return PRODUCTION_SITE_URL;
}
