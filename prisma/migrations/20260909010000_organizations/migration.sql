-- Organizations: group mentors so participants can book the entity itself
--
-- Idempotent (see 20260903100000_team_settings for why). This migration is the
-- reason the convention exists: restoring db_backup/batch01 on 2026-09-09 left
-- an "Organization" table behind, and the original bare CREATE TABLE aborted
-- `prisma migrate deploy` until the table was dropped by hand.
CREATE TABLE IF NOT EXISTS "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Organization_name_key" ON "Organization"("name");

ALTER TABLE "Mentor"        ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "MentorBooking" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

-- individual (default, current behaviour) | organization | both
ALTER TABLE "TeamSettings"  ADD COLUMN IF NOT EXISTS "mentorBookingMode" TEXT NOT NULL DEFAULT 'individual';

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS, so guard on pg_constraint.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Mentor_organizationId_fkey') THEN
    ALTER TABLE "Mentor" ADD CONSTRAINT "Mentor_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MentorBooking_organizationId_fkey') THEN
    ALTER TABLE "MentorBooking" ADD CONSTRAINT "MentorBooking_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
