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

// Maximum team size (leader + members). Enforced server-side when a team
// leader adds a member; the add window itself is stored in TeamSettings.
export const TEAM_MAX_MEMBERS = 30;

// TEMPORARY: hides public team registration (the /register-team page redirects
// to /login, and every "سجل فريقك" entry point is hidden). Flip to false to
// bring registration back. The API route itself is untouched.
export const TEAM_REGISTRATION_HIDDEN = true;
