-- Configurable per-participant booking limit and a reset mark: bookings created
-- before "bookingCountResetAt" no longer count toward the limit.
ALTER TABLE "TeamSettings" ADD COLUMN "maxBookingsPerMentor" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "TeamSettings" ADD COLUMN "bookingCountResetAt" TIMESTAMP(3);
