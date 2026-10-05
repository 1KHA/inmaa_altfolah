// File size constants
export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB in bytes
export const MAX_FILE_SIZE_MB = 25; // 25MB for display purposes

// Registration status
export const REGISTRATION_CLOSED = process.env.NEXT_PUBLIC_REGISTRATION_CLOSED === "true";

// Allowed file types for milestone submissions
export const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // PPTX
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.rar",
  "image/jpeg",
  "image/png",
];

// Mentor availability slot granularity (minutes). One knob for every calendar:
// change to 30 later to widen the booking grid everywhere at once.
export const SLOT_STEP_MINUTES = 15;
export const SLOT_TIMESLOTS_PER_HOUR = 60 / SLOT_STEP_MINUTES;

// Team size, leader included: 2-5. The public registration form and the
// admin "create team" form offer exactly this range, /api/register-team
// enforces it, and a team leader cannot add members past the maximum (the add
// window itself is stored in TeamSettings).
export const TEAM_MIN_MEMBERS = 2;
export const TEAM_MAX_MEMBERS = 5;
/** Choices for the "team size" pickers: TEAM_MIN_MEMBERS..TEAM_MAX_MEMBERS. */
export const TEAM_SIZE_OPTIONS = Array.from(
  { length: TEAM_MAX_MEMBERS - TEAM_MIN_MEMBERS + 1 },
  (_, i) => TEAM_MIN_MEMBERS + i
);

// Hides public team registration (the /register-team page redirects to /login,
// and every "سجل فريقك" entry point is hidden). Registration is OPEN here, so
// this stays false — the upstream project ships it as true.
export const TEAM_REGISTRATION_HIDDEN = false;
