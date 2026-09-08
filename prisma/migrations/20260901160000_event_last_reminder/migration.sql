-- Tracks when an admin last sent a manual reminder for an event, so the UI can
-- warn "already sent X minutes ago" and the API can refuse an accidental
-- duplicate send within a short cooldown. See mdfiles/event-reminder-fix.md.

ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "lastReminderAt" TIMESTAMP(3);
