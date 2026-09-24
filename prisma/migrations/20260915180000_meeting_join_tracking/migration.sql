-- Join tracking through the platform (Meeting_Trigger.md, layer 1):
-- first time each side opens the meeting via /api/meeting/join/<bookingId>,
-- and when both have, the booking is marked completed.
ALTER TABLE "MentorBooking" ADD COLUMN "mentorJoinedAt" TIMESTAMP(3);
ALTER TABLE "MentorBooking" ADD COLUMN "participantJoinedAt" TIMESTAMP(3);
ALTER TABLE "MentorBooking" ADD COLUMN "completedAt" TIMESTAMP(3);
