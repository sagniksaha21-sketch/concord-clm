-- Adversarial hardening: bind approval and e-sign to the exact document bytes/version.
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "sha256" TEXT;
ALTER TABLE "ApprovalRouting" ADD COLUMN IF NOT EXISTS "documentId" TEXT;
ALTER TABLE "ApprovalRouting" ADD COLUMN IF NOT EXISTS "documentSha256" TEXT;
ALTER TABLE "ApprovalRouting" ADD COLUMN IF NOT EXISTS "contractVersion" TEXT;
ALTER TABLE "ApprovalDecision" ADD COLUMN IF NOT EXISTS "documentId" TEXT;
ALTER TABLE "ApprovalDecision" ADD COLUMN IF NOT EXISTS "documentSha256" TEXT;
ALTER TABLE "ApprovalDecision" ADD COLUMN IF NOT EXISTS "contractVersion" TEXT;
ALTER TABLE "SignatureRequest" ADD COLUMN IF NOT EXISTS "documentId" TEXT;
ALTER TABLE "SignatureRequest" ADD COLUMN IF NOT EXISTS "documentSha256" TEXT;
ALTER TABLE "SignatureRequest" ADD COLUMN IF NOT EXISTS "contractVersion" TEXT;
CREATE INDEX IF NOT EXISTS "Document_contractId_createdAt_idx" ON "Document"("contractId", "createdAt");
