ALTER TABLE "Contract" ADD COLUMN "parentAgreementId" TEXT REFERENCES "Contract"("id") ON DELETE RESTRICT,
 ADD COLUMN "needsNewVersion" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "negotiationState" TEXT,
 ADD COLUMN "agreedDocumentId" TEXT, ADD COLUMN "agreedSha256" TEXT, ADD COLUMN "agreedAt" TIMESTAMP(3), ADD COLUMN "agreedBy" TEXT;
CREATE TABLE "AgreementVersion" (
 "documentId" TEXT PRIMARY KEY REFERENCES "Document"("id") ON DELETE RESTRICT,
 "contractId" TEXT NOT NULL REFERENCES "Contract"("id") ON DELETE RESTRICT,
 "number" INTEGER NOT NULL, "label" TEXT NOT NULL, "authorName" TEXT NOT NULL,
 "authorUserId" TEXT, "authorGuestId" TEXT, "organisation" TEXT, "source" TEXT NOT NULL,
 "reason" TEXT NOT NULL, "stage" TEXT NOT NULL, "round" INTEGER NOT NULL DEFAULT 0,
 "sections" JSONB, "changeSummary" JSONB, "sharedAt" TIMESTAMP(3), "agreedAt" TIMESTAMP(3),
 "approvedAt" TIMESTAMP(3), "executedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "AgreementVersion_contractId_number_key" ON "AgreementVersion"("contractId", "number");
INSERT INTO "AgreementVersion" ("documentId","contractId","number","label","authorName","source","reason","stage","createdAt")
 SELECT d."id",d."contractId",ROW_NUMBER() OVER (PARTITION BY d."contractId" ORDER BY d."createdAt",d."id"),
 'Preserved source','Not recorded','existing','Document retained from the existing record',c."stage",d."createdAt"
 FROM "Document" d JOIN "Contract" c ON c."id"=d."contractId" WHERE d."status" <> 'quarantined';
CREATE TABLE "AgreementComment" (
 "id" TEXT PRIMARY KEY, "contractId" TEXT NOT NULL REFERENCES "Contract"("id") ON DELETE RESTRICT,
 "documentId" TEXT NOT NULL, "sectionId" TEXT, "authorUserId" TEXT, "authorGuestId" TEXT,
 "authorName" TEXT NOT NULL, "visibility" TEXT NOT NULL DEFAULT 'internal', "body" TEXT NOT NULL,
 "parentId" TEXT, "resolvedAt" TIMESTAMP(3), "resolvedBy" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AgreementComment_contractId_documentId_visibility_idx" ON "AgreementComment"("contractId","documentId","visibility");
