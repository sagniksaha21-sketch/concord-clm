-- AlterTable
ALTER TABLE "AgreementObligation" ADD COLUMN     "extractionKey" TEXT;

-- AlterTable
ALTER TABLE "GuestInvitation" ADD COLUMN     "executedArchiveId" TEXT,
ADD COLUMN     "executedSharedAt" TIMESTAMP(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ApprovalRouting" ADD COLUMN     "policyEvidence" JSONB;

-- CreateTable
CREATE TABLE "NegotiationAnalysis" (
    "responseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "assessments" JSONB,
    "model" TEXT,
    "sourceSha256" TEXT,
    "detail" TEXT,
    "claimToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NegotiationAnalysis_pkey" PRIMARY KEY ("responseId")
);

-- CreateTable
CREATE TABLE "ApprovalPolicy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "conditions" JSONB NOT NULL,
    "approvers" TEXT[],
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObligationExtraction" (
    "archiveId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "source" TEXT,
    "model" TEXT,
    "detail" TEXT,
    "claimToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObligationExtraction_pkey" PRIMARY KEY ("archiveId")
);

-- CreateIndex
CREATE INDEX "NegotiationAnalysis_status_updatedAt_idx" ON "NegotiationAnalysis"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "ObligationExtraction_status_updatedAt_idx" ON "ObligationExtraction"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgreementObligation_extractionKey_key" ON "AgreementObligation"("extractionKey");

-- AddForeignKey
ALTER TABLE "NegotiationAnalysis" ADD CONSTRAINT "NegotiationAnalysis_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "NegotiationResponse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObligationExtraction" ADD CONSTRAINT "ObligationExtraction_archiveId_fkey" FOREIGN KEY ("archiveId") REFERENCES "ArchivedDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObligationExtraction" ADD CONSTRAINT "ObligationExtraction_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
