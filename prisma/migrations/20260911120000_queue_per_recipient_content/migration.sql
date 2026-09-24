-- Per-recipient rendered content on the email queue (bulk acceptance emails
-- carry each member's own credentials, so they cannot share one BCC body).
-- NULL = the row uses the broadcast's shared subject/body (BCC batches).
-- The body is cleared once the email is sent so a password never lingers.
ALTER TABLE "BroadcastRecipient" ADD COLUMN "subject" TEXT;
ALTER TABLE "BroadcastRecipient" ADD COLUMN "body" TEXT;
