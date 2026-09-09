-- Prevent duplicate provider envelopes for the same approved legal artifact.
CREATE UNIQUE INDEX IF NOT EXISTS "SignatureRequest_contractId_contractVersion_documentId_key"
ON "SignatureRequest"("contractId", "contractVersion", "documentId");
