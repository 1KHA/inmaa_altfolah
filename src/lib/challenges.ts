/**
 * The hackathon challenge tracks — the single source of truth.
 *
 * Kept in sync with the landing page (src/app/landing) and re-exported by
 * src/lib/tracks.ts under the HACKATHON_TRACKS name used by older call sites.
 *
 * Used by the public registration form (`/register-team`, stored on
 * `Team.hackathonTrack`) and the admin "create team" form
 * (`/admin-hackton-dashboard/teams/create`, stored on `Team.challenge`), so
 * the two lists cannot drift apart.
 *
 * The stored value IS the Arabic label. Every screen that shows a challenge
 * renders the stored string verbatim — the participant team page, the teams
 * list, and the admin Excel export — so a slug would surface to users as
 * raw text like "smart-infrastructure" (which is exactly what the admin form
 * used to save). Keep value === label.
 *
 * Changing a label here does NOT rewrite teams already stored with the old
 * text; migrate those rows explicitly if a label ever changes.
 */
export const CHALLENGES = [
  'المسار التقني',
] as const;

export type Challenge = (typeof CHALLENGES)[number];

// ---------------------------------------------------------------------------
// English → Arabic track resolution
// ---------------------------------------------------------------------------

/**
 * The registration platform exports sub-tracks in English. These are the
 * confirmed source names, mapped to our canonical Arabic challenges.
 *
 * Used in TWO places so behaviour is identical everywhere:
 *   - scripts/convert-users-export.js when converting an export
 *   - the import validator, so a file uploaded with English track names is
 *     accepted and normalised instead of rejected as "unknown track"
 *
 * `keywords` are the DISTINCTIVE words for each track. Generic words such as
 * "track" are deliberately absent — they would match any input.
 */
export const TRACK_ALIASES: { ar: Challenge; en: string; keywords: string[] }[] = [
  {
    ar: 'المسار التقني',
    en: 'Technical Track',
    keywords: ['technical', 'tech', 'technology'],
  },
];

/** Lowercase, drop punctuation and "&"/"and", collapse whitespace. */
export function normalizeTrackText(raw: string): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[&]/g, ' ')
    .replace(/\band\b/g, ' ')
    // strip punctuation without the /u flag (tsconfig targets es5):
    // keep letters (incl. Arabic block), digits and whitespace
    .replace(/[^0-9a-z\u0600-\u06FF\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolve any spelling of a track — Arabic, English, or a near variant — to the
 * canonical Arabic challenge. Returns null when it cannot decide, so the caller
 * reports it instead of guessing (a wrong track is worse than a blank one).
 */
export function resolveChallenge(raw: string): Challenge | null {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return null;

  // already canonical Arabic
  const exactAr = CHALLENGES.find((c) => c === trimmed);
  if (exactAr) return exactAr;

  const input = normalizeTrackText(trimmed);
  if (!input) return null;

  const tokens = new Set(input.split(' '));
  /** Does the input carry at least one word unique to this track? */
  const hasDistinctive = (a: (typeof TRACK_ALIASES)[number]) => a.keywords.some((k) => tokens.has(k));

  // whole-string match against the known English names, either direction.
  // A containment match still has to carry a distinctive word, otherwise a
  // bare "Water" would match the first name that happens to contain it —
  // "water" appears in four of the five tracks and decides nothing.
  for (const a of TRACK_ALIASES) {
    const en = normalizeTrackText(a.en);
    if (input === en) return a.ar;
    if ((input.includes(en) || en.includes(input)) && hasDistinctive(a)) return a.ar;
  }

  // fall back to distinctive keywords; ambiguity => null
  const scored = TRACK_ALIASES
    .map((a) => ({ ar: a.ar, score: a.keywords.filter((k) => tokens.has(k)).length }))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score);

  if (scored.length === 0) return null;
  if (scored.length > 1 && scored[0].score === scored[1].score) return null; // ambiguous
  return scored[0].ar;
}
