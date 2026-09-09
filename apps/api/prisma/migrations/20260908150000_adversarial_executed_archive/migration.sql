-- Executed-document archive provenance and idempotency hardening.
ALTER TABLE "ArchivedDocument" ADD COLUMN IF NOT EXISTS "filename" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "ArchivedDocument_requestId_key" ON "ArchivedDocument"("requestId");
