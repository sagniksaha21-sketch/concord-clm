ALTER TABLE "IntakeRequest"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "requesterId" TEXT,
  ADD COLUMN "assignedLegalUserId" TEXT,
  ADD COLUMN "contractId" TEXT,
  ADD COLUMN "submissionKey" TEXT,
  ADD COLUMN "payloadHash" TEXT,
  ADD COLUMN "terms" JSONB,
  ADD COLUMN "requestedByDate" TEXT,
  ADD COLUMN "urgency" TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN "clientStatus" TEXT NOT NULL DEFAULT 'submitted',
  ADD COLUMN "legalNote" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "IntakeRequest_contractId_key" ON "IntakeRequest"("contractId");
CREATE UNIQUE INDEX "IntakeRequest_submissionKey_key" ON "IntakeRequest"("submissionKey");
CREATE INDEX "IntakeRequest_requesterId_createdAt_idx" ON "IntakeRequest"("requesterId", "createdAt");
CREATE INDEX "IntakeRequest_assignedLegalUserId_clientStatus_idx" ON "IntakeRequest"("assignedLegalUserId", "clientStatus");
ALTER TABLE "IntakeRequest" ADD CONSTRAINT "IntakeRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntakeRequest" ADD CONSTRAINT "IntakeRequest_assignedLegalUserId_fkey" FOREIGN KEY ("assignedLegalUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntakeRequest" ADD CONSTRAINT "IntakeRequest_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "RequestNotification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "requestId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "emailStatus" TEXT NOT NULL DEFAULT 'queued',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMP(3),
  "claimToken" TEXT,
  "lastError" TEXT,
  "sentAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RequestNotification_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "IntakeRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RequestNotification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RequestNotification_requestId_recipientId_kind_key" ON "RequestNotification"("requestId", "recipientId", "kind");
CREATE INDEX "RequestNotification_recipientId_readAt_createdAt_idx" ON "RequestNotification"("recipientId", "readAt", "createdAt");
CREATE INDEX "RequestNotification_emailStatus_nextAttemptAt_idx" ON "RequestNotification"("emailStatus", "nextAttemptAt");
