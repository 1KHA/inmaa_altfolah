-- Practice cards (نماذج المختبرات): advisor accounts, each team's filled-in
-- cards, and the advisors'/admins' reviews of them. Purely additive: new
-- tables only, nothing existing is altered.
--
-- Idempotent (see 20260903100000_team_settings for why).
CREATE TABLE IF NOT EXISTS "Advisor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "specialty" TEXT,
    "isDisabled" BOOLEAN NOT NULL DEFAULT false,
    "disabledAt" TIMESTAMP(3),
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Advisor_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Advisor_email_key" ON "Advisor"("email");

CREATE TABLE IF NOT EXISTS "PracticeSubmission" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "cardKey" TEXT NOT NULL,
    "answers" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "score" INTEGER,
    "submitCount" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PracticeSubmission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PracticeSubmission_teamId_cardKey_key" ON "PracticeSubmission"("teamId", "cardKey");
CREATE INDEX IF NOT EXISTS "PracticeSubmission_status_submittedAt_idx" ON "PracticeSubmission"("status", "submittedAt");

CREATE TABLE IF NOT EXISTS "PracticeReview" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "reviewerType" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "reviewerName" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PracticeReview_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PracticeReview_submissionId_createdAt_idx" ON "PracticeReview"("submissionId", "createdAt");

-- Deleting a team (or a submission) takes its cards and reviews with it.
-- Postgres has no ADD CONSTRAINT IF NOT EXISTS, so guard on pg_constraint.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PracticeSubmission_teamId_fkey') THEN
    ALTER TABLE "PracticeSubmission" ADD CONSTRAINT "PracticeSubmission_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PracticeReview_submissionId_fkey') THEN
    ALTER TABLE "PracticeReview" ADD CONSTRAINT "PracticeReview_submissionId_fkey"
      FOREIGN KEY ("submissionId") REFERENCES "PracticeSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
