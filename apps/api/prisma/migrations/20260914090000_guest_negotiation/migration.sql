CREATE TABLE "NegotiationRound" (
 "id" TEXT PRIMARY KEY, "contractId" TEXT NOT NULL REFERENCES "Contract"("id") ON DELETE RESTRICT,
 "documentId" TEXT NOT NULL, "sha256" TEXT NOT NULL, "sections" JSONB NOT NULL, "number" INTEGER NOT NULL,
 "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "NegotiationRound_contractId_documentId_key" ON "NegotiationRound"("contractId","documentId");
CREATE UNIQUE INDEX "NegotiationRound_contractId_number_key" ON "NegotiationRound"("contractId","number");
CREATE TABLE "GuestInvitation" (
 "id" TEXT PRIMARY KEY, "requestHash" TEXT NOT NULL, "contractId" TEXT NOT NULL REFERENCES "Contract"("id") ON DELETE RESTRICT,
 "roundId" TEXT NOT NULL REFERENCES "NegotiationRound"("id") ON DELETE RESTRICT,
 "name" TEXT NOT NULL, "email" TEXT NOT NULL, "organisation" TEXT NOT NULL, "invitedBy" TEXT NOT NULL,
 "expiresAt" TIMESTAMP(3) NOT NULL, "responseDueAt" TIMESTAMP(3),
 "allowDownload" BOOLEAN NOT NULL DEFAULT false, "allowRedline" BOOLEAN NOT NULL DEFAULT true, "allowUpload" BOOLEAN NOT NULL DEFAULT true,
 "revokedAt" TIMESTAMP(3), "viewedAt" TIMESTAMP(3), "acceptedDocumentId" TEXT,
 "challengeId" TEXT, "otpHash" TEXT, "otpExpiresAt" TIMESTAMP(3), "otpAttempts" INTEGER NOT NULL DEFAULT 0,
 "otpSentAt" TIMESTAMP(3), "otpDelivery" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "GuestInvitation_contractId_expiresAt_idx" ON "GuestInvitation"("contractId","expiresAt");
CREATE TABLE "GuestSession" (
 "hash" TEXT PRIMARY KEY, "invitationId" TEXT NOT NULL REFERENCES "GuestInvitation"("id") ON DELETE RESTRICT,
 "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "GuestSession_invitationId_idx" ON "GuestSession"("invitationId");
CREATE TABLE "GuestAuthLimit" ("id" TEXT PRIMARY KEY, "count" INTEGER NOT NULL DEFAULT 1, "expiresAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "NegotiationResponse" (
 "id" TEXT PRIMARY KEY, "requestHash" TEXT NOT NULL, "invitationId" TEXT NOT NULL REFERENCES "GuestInvitation"("id") ON DELETE RESTRICT,
 "roundId" TEXT NOT NULL REFERENCES "NegotiationRound"("id") ON DELETE RESTRICT,
 "documentId" TEXT NOT NULL, "sections" JSONB NOT NULL, "originalSections" JSONB NOT NULL, "changes" JSONB NOT NULL,
 "source" TEXT NOT NULL, "state" TEXT NOT NULL DEFAULT 'received', "reviewedBy" TEXT, "reviewedDocumentId" TEXT,
 "reviewedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "NegotiationResponse_invitationId_roundId_key" ON "NegotiationResponse"("invitationId","roundId");
CREATE TABLE "GuestDelivery" (
 "id" TEXT PRIMARY KEY, "invitationId" TEXT NOT NULL REFERENCES "GuestInvitation"("id") ON DELETE RESTRICT,
 "roundId" TEXT NOT NULL, "kind" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'queued', "attempts" INTEGER NOT NULL DEFAULT 0,
 "claimToken" TEXT, "leaseUntil" TIMESTAMP(3), "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "GuestDelivery_invitationId_roundId_kind_key" ON "GuestDelivery"("invitationId","roundId","kind");
CREATE INDEX "GuestDelivery_status_nextAttemptAt_idx" ON "GuestDelivery"("status","nextAttemptAt");
