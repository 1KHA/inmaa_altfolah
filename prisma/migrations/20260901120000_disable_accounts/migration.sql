-- Admin "disable account" feature (see mdfiles/disable-accounts.md):
--   * Participant.isDisabled / disabledAt
--   * Team.isDisabled / disabledAt  (disables every member with it)
--
-- A disabled account cannot log in, cannot act, and receives no transactional
-- email — but CAN still be targeted by an admin broadcast (the "disabled
-- accounts" audience), so rejection notices can be sent.
--
-- Applied automatically by vercel-build.sh (`prisma migrate deploy`).

ALTER TABLE "Participant" ADD COLUMN IF NOT EXISTS "isDisabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Participant" ADD COLUMN IF NOT EXISTS "disabledAt" TIMESTAMP(3);

ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "isDisabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "disabledAt" TIMESTAMP(3);

-- Admin screens filter and count by this constantly.
CREATE INDEX IF NOT EXISTS "Participant_isDisabled_idx" ON "Participant"("isDisabled");
CREATE INDEX IF NOT EXISTS "Team_isDisabled_idx" ON "Team"("isDisabled");
