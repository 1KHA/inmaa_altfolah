-- Extends the "disable account" feature to mentors (see mdfiles/disable-accounts.md).
-- A disabled mentor cannot log in or act, receives no transactional email, and
-- disappears from the participant-facing mentor list so they cannot be booked.

ALTER TABLE "Mentor" ADD COLUMN IF NOT EXISTS "isDisabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Mentor" ADD COLUMN IF NOT EXISTS "disabledAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Mentor_isDisabled_idx" ON "Mentor"("isDisabled");
