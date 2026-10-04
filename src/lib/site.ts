/**
 * Public origin of the site, without a trailing slash. Every absolute URL the
 * app emits comes from here: canonical links, the og:image that WhatsApp and
 * Teams previews fetch, robots.txt / sitemap.xml, and links inside e-mails.
 *
 *   1. NEXT_PUBLIC_APP_URL            set per environment (the Docker image also
 *                                     receives it as a build arg)
 *   2. VERCEL_PROJECT_PRODUCTION_URL  Vercel's production domain, automatic
 *   3. http://localhost:3000          local fallback only
 *
 * Static pages bake this in at BUILD time, so set it for the build, not only
 * at runtime.
 */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel.replace(/\/+$/, '')}`;
  return 'http://localhost:3000';
}
