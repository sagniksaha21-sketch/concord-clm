CREATE TABLE "Contract" ("id" TEXT NOT NULL PRIMARY KEY,"title" TEXT NOT NULL,"counterparty" TEXT NOT NULL,"type" TEXT NOT NULL,"valueDisplay" TEXT NOT NULL,"stage" TEXT NOT NULL,"risk" TEXT NOT NULL,"version" TEXT NOT NULL,"source" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL);
CREATE INDEX "Contract_counterparty_idx" ON "Contract"("counterparty");
CREATE INDEX "Contract_stage_idx" ON "Contract"("stage");
CREATE INDEX "Contract_risk_idx" ON "Contract"("risk");
ALTER TABLE "Document" ADD COLUMN "contractId" TEXT;
ALTER TABLE "Document" ADD COLUMN "extractedText" TEXT;
CREATE INDEX "Document_contractId_idx" ON "Document"("contractId");
ALTER TABLE "Document" ADD CONSTRAINT "Document_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
