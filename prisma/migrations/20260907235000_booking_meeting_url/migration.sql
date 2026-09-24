-- Per-booking auto-generated video meeting link (Jitsi room URL)
-- Idempotent (see 20260903100000_team_settings for why).
ALTER TABLE "MentorBooking" ADD COLUMN IF NOT EXISTS "meetingUrl" TEXT;
