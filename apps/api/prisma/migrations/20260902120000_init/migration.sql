-- Concord CLM — initial schema (versioned migration).
-- Applied in production via `prisma migrate deploy` from a controlled deployment
-- job (never `prisma db push` at app start). Reviewed and version-controlled.

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Legal',
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contractType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "clauseIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clause" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "playbookStandard" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Clause_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeRequest" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "counterparty" TEXT NOT NULL,
    "businessUnit" TEXT NOT NULL,
    "requestor" TEXT NOT NULL,
    "contractType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "suggestedTemplateId" TEXT,
    "triageRisk" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntakeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "documentType" TEXT,
    "pages" INTEGER,
    "confidence" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "extraction" JSONB NOT NULL,
    "validations" JSONB NOT NULL,
    "notes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "model" TEXT NOT NULL,
    "blobPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignatureRequest" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "contractTitle" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "envelopeId" TEXT,
    "signingUrl" TEXT,
    "message" TEXT,
    "signatories" JSONB NOT NULL,
    "stampPaper" JSONB,
    "audit" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastNudgedAt" TIMESTAMP(3),
    CONSTRAINT "SignatureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchivedDocument" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "contractTitle" TEXT NOT NULL,
    "signatories" JSONB NOT NULL,
    "stampCertificateNo" TEXT,
    "stampState" TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ArchivedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable (immutable, hash-chained audit trail — append-only)
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "request" JSONB,
    "metadata" JSONB,
    "ai" JSONB,
    "correlationId" TEXT,
    "prevHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AuditEvent_seq_key" ON "AuditEvent"("seq");
CREATE UNIQUE INDEX "AuditEvent_hash_key" ON "AuditEvent"("hash");
CREATE INDEX "AuditEvent_entity_entityId_idx" ON "AuditEvent"("entity", "entityId");
CREATE INDEX "AuditEvent_action_idx" ON "AuditEvent"("action");
CREATE INDEX "AuditEvent_at_idx" ON "AuditEvent"("at");
