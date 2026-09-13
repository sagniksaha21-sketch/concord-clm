ALTER TABLE "IntakeRequest" ADD COLUMN "assignmentPreference" TEXT;
ALTER TABLE "Contract" ADD COLUMN "executedAt" TIMESTAMP(3), ADD COLUMN "authoritativeArchiveId" TEXT, ADD COLUMN "lifecycleRevision" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "RequestAttachment" (
 "id" TEXT PRIMARY KEY, "uploaderId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "requestId" TEXT REFERENCES "IntakeRequest"("id") ON DELETE RESTRICT,
 "filename" TEXT NOT NULL, "size" INTEGER NOT NULL, "category" TEXT NOT NULL, "contentType" TEXT NOT NULL,
 "storageKey" TEXT NOT NULL, "sha256" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "RequestAttachment_uploaderId_requestId_idx" ON "RequestAttachment"("uploaderId", "requestId");
CREATE TABLE "RequestMessage" (
 "id" TEXT PRIMARY KEY, "requestId" TEXT NOT NULL REFERENCES "IntakeRequest"("id") ON DELETE RESTRICT,
 "authorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT, "kind" TEXT NOT NULL,
 "body" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "RequestMessage_requestId_createdAt_idx" ON "RequestMessage"("requestId", "createdAt");
CREATE TABLE "AgreementDraft" (
 "contractId" TEXT PRIMARY KEY REFERENCES "Contract"("id") ON DELETE RESTRICT, "templateId" TEXT, "sections" JSONB NOT NULL,
 "model" TEXT NOT NULL, "revision" INTEGER NOT NULL DEFAULT 1, "documentId" TEXT NOT NULL, "updatedBy" TEXT NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "AgreementObligation" (
 "id" TEXT PRIMARY KEY, "contractId" TEXT NOT NULL REFERENCES "Contract"("id") ON DELETE RESTRICT, "title" TEXT NOT NULL,
 "type" TEXT NOT NULL, "dueDate" TEXT NOT NULL, "ownerEmail" TEXT, "sourceArchiveId" TEXT NOT NULL, "evidence" TEXT NOT NULL,
 "confirmed" BOOLEAN NOT NULL DEFAULT false, "completedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AgreementObligation_contractId_dueDate_idx" ON "AgreementObligation"("contractId", "dueDate");
ALTER TABLE "RequestNotification" ALTER COLUMN "requestId" DROP NOT NULL;
ALTER TABLE "RequestNotification" ADD COLUMN "contractId" TEXT REFERENCES "Contract"("id") ON DELETE RESTRICT;
CREATE UNIQUE INDEX "RequestNotification_contractId_recipientId_kind_key" ON "RequestNotification"("contractId", "recipientId", "kind");
ALTER TABLE "ApprovalRouting" ADD COLUMN "recommendation" TEXT;
CREATE TABLE "ApprovalStep" (
 "id" TEXT PRIMARY KEY, "contractId" TEXT NOT NULL REFERENCES "Contract"("id") ON DELETE RESTRICT,
 "approverEmail" TEXT NOT NULL, "approverName" TEXT NOT NULL, "reason" TEXT NOT NULL,
 "decision" TEXT NOT NULL DEFAULT 'pending', "comment" TEXT, "decidedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "ApprovalStep_contractId_approverEmail_key" ON "ApprovalStep"("contractId", "approverEmail");
ALTER TABLE "Contract" ADD COLUMN "ownerId" TEXT REFERENCES "User"("id") ON DELETE RESTRICT;
CREATE TABLE "ApprovalRound" (
 "id" TEXT PRIMARY KEY, "contractId" TEXT NOT NULL REFERENCES "Contract"("id") ON DELETE RESTRICT,
 "contractVersion" TEXT NOT NULL, "evidence" JSONB NOT NULL, "evidenceSha256" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ApprovalRound_contractId_contractVersion_key" ON "ApprovalRound"("contractId", "contractVersion");
