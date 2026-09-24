-- Admin-controlled window for team leaders adding members
--
-- Idempotent: a restore from a dump older than this migration can leave newer
-- objects behind (pg_restore cannot DROP SCHEMA while they depend on it), so
-- every statement here has to tolerate the object already existing.
CREATE TABLE IF NOT EXISTS "TeamSettings" (
    "id" TEXT NOT NULL,
    "memberAddStart" TIMESTAMP(3),
    "memberAddEnd" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamSettings_pkey" PRIMARY KEY ("id")
);

-- Single settings row the app reads/updates (mirrors the EmailSettings pattern)
INSERT INTO "TeamSettings" ("id", "updatedAt")
VALUES ('teamsettings-default-row-01', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
