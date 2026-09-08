-- Phases (mdfiles/phases-plan.md):
--   * Phase — ordered pipeline stage; disabling one disables its members
--   * Team/Participant.phaseId + phaseStatus (active|failed)
--   * Milestone.phaseId — drives auto-advance on acceptance
--   * Milestone.allowLateSubmission + MilestoneSubmission.isLate — deadline enforcement
--   * MilestoneSubmission resubmission columns
--
-- Additive only: no column dropped or retyped, no row rewritten.
-- Applied by vercel-build.sh (`prisma migrate deploy`).

CREATE TABLE IF NOT EXISTS "Phase" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "description" TEXT,
    "isDisabled" BOOLEAN NOT NULL DEFAULT false,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Phase_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Phase_name_key"  ON "Phase"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "Phase_order_key" ON "Phase"("order");
CREATE INDEX        IF NOT EXISTS "Phase_order_idx" ON "Phase"("order");

ALTER TABLE "Team"        ADD COLUMN IF NOT EXISTS "phaseId" TEXT;
ALTER TABLE "Team"        ADD COLUMN IF NOT EXISTS "phaseStatus" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "Team"        ADD COLUMN IF NOT EXISTS "phaseUpdatedAt" TIMESTAMP(3);
ALTER TABLE "Participant" ADD COLUMN IF NOT EXISTS "phaseId" TEXT;
ALTER TABLE "Participant" ADD COLUMN IF NOT EXISTS "phaseStatus" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "Participant" ADD COLUMN IF NOT EXISTS "phaseUpdatedAt" TIMESTAMP(3);

ALTER TABLE "Milestone"   ADD COLUMN IF NOT EXISTS "phaseId" TEXT;
ALTER TABLE "Milestone"   ADD COLUMN IF NOT EXISTS "allowLateSubmission" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "MilestoneSubmission" ADD COLUMN IF NOT EXISTS "resubmissionCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MilestoneSubmission" ADD COLUMN IF NOT EXISTS "resubmissionRequestedAt" TIMESTAMP(3);
ALTER TABLE "MilestoneSubmission" ADD COLUMN IF NOT EXISTS "resubmissionDeadline" TIMESTAMP(3);
ALTER TABLE "MilestoneSubmission" ADD COLUMN IF NOT EXISTS "isLate" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Team_phaseId_phaseStatus_idx"        ON "Team"("phaseId", "phaseStatus");
CREATE INDEX IF NOT EXISTS "Participant_phaseId_phaseStatus_idx" ON "Participant"("phaseId", "phaseStatus");
CREATE INDEX IF NOT EXISTS "Milestone_phaseId_idx"               ON "Milestone"("phaseId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Team_phaseId_fkey') THEN
    ALTER TABLE "Team" ADD CONSTRAINT "Team_phaseId_fkey"
      FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Participant_phaseId_fkey') THEN
    ALTER TABLE "Participant" ADD CONSTRAINT "Participant_phaseId_fkey"
      FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Milestone_phaseId_fkey') THEN
    ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_phaseId_fkey"
      FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Existing milestones may already be past due; do not lock people out mid-round.
-- New milestones default to false (plan §5 Q8).
UPDATE "Milestone" SET "allowLateSubmission" = true WHERE "dueDate" < NOW();
