-- Admin-controlled window for team leaders adding members
CREATE TABLE "TeamSettings" (
    "id" TEXT NOT NULL,
    "memberAddStart" TIMESTAMP(3),
    "memberAddEnd" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamSettings_pkey" PRIMARY KEY ("id")
);

-- Single settings row the app reads/updates (mirrors the EmailSettings pattern)
INSERT INTO "TeamSettings" ("id", "updatedAt") VALUES ('teamsettings-default-row-01', CURRENT_TIMESTAMP);
