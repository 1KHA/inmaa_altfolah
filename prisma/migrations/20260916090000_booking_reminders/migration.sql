-- 5-minute-before reminders (dashboard + email) for mentor bookings; stamped
-- once sent so overlapping cron ticks never remind twice.
ALTER TABLE "MentorBooking" ADD COLUMN "reminderSentAt" TIMESTAMP(3);
