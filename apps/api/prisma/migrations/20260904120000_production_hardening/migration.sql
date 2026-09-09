-- Concord CLM — production hardening.
--
-- Closes findings C-D6 (approval routing lost on restart/replica), C-D8
-- (approval decision not durable at claim time), C-D15 (lost updates on
-- signature rows), C-D22 (primary key derived from count()+1), C-D33 (tables
-- created by runtime DDL outside migrations) and part of C-D7 (least-privilege
-- default role + a record of where a role came from).
--
-- Written to be safe to apply to a database that already ran the previous build:
-- the two claim tables may already exist because the application created them at
-- runtime, so they are created IF NOT EXISTS and then normalised.

-- ── C-D7: least privilege by default, and provenance for every role ──────────
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'viewer';
-- New rows default to 'sso' (claims win, so removing someone from an Entra group
-- takes effect on their next sign-in). But every row that ALREADY exists was
-- granted by hand — direct SQL was the only way to create an approver before
-- this migration. Backfilling those as 'sso' would let the first SSO sign-in
-- overwrite a deliberate grant with whatever the claims resolve to (viewer, for
-- a tenant that emits opaque group GUIDs). So they are backfilled as 'manual'.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "roleSource" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "User" ALTER COLUMN "roleSource" SET DEFAULT 'sso';

-- ── C-D15: optimistic concurrency for signature-request state changes ────────
ALTER TABLE "SignatureRequest" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "SignatureRequest_envelopeId_idx" ON "SignatureRequest"("envelopeId");

-- ── C-D6: durable approval routing ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ApprovalRouting" (
    "contractId" TEXT NOT NULL,
    "approvers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "stage" TEXT NOT NULL DEFAULT 'approval',
    "routedBy" TEXT,
    "routedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApprovalRouting_pkey" PRIMARY KEY ("contractId")
);
CREATE INDEX IF NOT EXISTS "ApprovalRouting_expiresAt_idx" ON "ApprovalRouting"("expiresAt");

-- ── C-D8: the decision is durable in the same statement that claims it ───────
CREATE TABLE IF NOT EXISTS "ApprovalDecision" (
    "contractId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "decidedBy" TEXT NOT NULL,
    "comment" TEXT,
    "tokenVerified" BOOLEAN NOT NULL DEFAULT true,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApprovalDecision_pkey" PRIMARY KEY ("contractId")
);

-- ── C-D33: claim tables become versioned schema, not runtime DDL ─────────────
-- `IF NOT EXISTS` + the ALTERs below make this idempotent against a database
-- where the application already created these at runtime (as timestamptz).
CREATE TABLE IF NOT EXISTS "job_claim" (
    "claim_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "job_claim_pkey" PRIMARY KEY ("claim_key")
);
-- `TYPE TIMESTAMP(3)` alone converts using the SESSION TimeZone and drops the
-- offset, silently shifting every stored instant (by +5:30 with the app's
-- default Asia/Kolkata). `AT TIME ZONE 'UTC'` pins the conversion. Prisma reads
-- and writes UTC, so this keeps existing claim rows meaning what they meant.
-- Note: this rewrites the table under ACCESS EXCLUSIVE on first apply.
ALTER TABLE "job_claim"
  ALTER COLUMN "created_at" TYPE TIMESTAMP(3)
  USING ("created_at" AT TIME ZONE 'UTC');
ALTER TABLE "job_claim" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS "job_claim_created_at_idx" ON "job_claim"("created_at");

CREATE TABLE IF NOT EXISTS "digest_run" (
    "run_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "digest_run_pkey" PRIMARY KEY ("run_key")
);
ALTER TABLE "digest_run"
  ALTER COLUMN "created_at" TYPE TIMESTAMP(3)
  USING ("created_at" AT TIME ZONE 'UTC');
ALTER TABLE "digest_run" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS "digest_run_created_at_idx" ON "digest_run"("created_at");

-- ── C-D22: collision-free intake identifiers ─────────────────────────────────
-- `count() + 1` is not a primary key: two concurrent intakes read the same count
-- and mint the same id. A sequence is atomic. Start above whatever already
-- exists so the readable INT-YYYY-NNN numbering continues rather than colliding.
CREATE SEQUENCE IF NOT EXISTS intake_seq AS BIGINT START WITH 1 INCREMENT BY 1;
-- Seed from the MAXIMUM NUMERIC SUFFIX of the existing ids, not from COUNT(*).
-- A count is not a high-water mark: delete or withdraw one intake and the count
-- drops below the largest id in use, so the next allocations collide with rows
-- that already exist and the submission 500s — exactly the failure this is
-- meant to remove. `is_called = true` means nextval() returns seed + 1, so an
-- empty table correctly yields INT-YYYY-001.
--
-- `is_called = false` means nextval() returns EXACTLY the value set, so the
-- target is "highest suffix in use, plus one". With `true` a fresh sequence
-- (last_value = 1, is_called = false) would make the very first identifier
-- INT-YYYY-002. pg_sequence_last_value() is NULL until the sequence has been
-- used, which is how "never called" is distinguished from "last returned 1".
SELECT setval(
  'intake_seq',
  GREATEST(
    COALESCE((SELECT MAX(CAST(m[1] AS BIGINT))
                FROM "IntakeRequest",
                     LATERAL regexp_match(id, '(\d+)$') AS m
               WHERE id ~ '\d+$'), 0) + 1,
    COALESCE(pg_sequence_last_value('intake_seq') + 1, 1)
  ),
  false
);

-- ── Audit chain high-water mark (deletion detection) ─────────────────────────
-- The hash chain cannot detect deletion on its own; this row records the highest
-- seq/hash ever committed, written in the same transaction as each append.
CREATE TABLE IF NOT EXISTS "AuditAnchor" (
    "id" TEXT NOT NULL DEFAULT 'chain',
    "seq" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuditAnchor_pkey" PRIMARY KEY ("id")
);
-- Seed it from whatever is already in the trail, so an existing deployment does
-- not report its entire history as "missing" on the first verification.
INSERT INTO "AuditAnchor" ("id", "seq", "hash", "updatedAt")
SELECT 'chain', seq, hash, CURRENT_TIMESTAMP
  FROM "AuditEvent" ORDER BY seq DESC LIMIT 1
ON CONFLICT ("id") DO NOTHING;

-- NOTE: no extra index on "AuditEvent"("seq") — `seq Int @unique` already
-- creates AuditEvent_seq_key. A second index on the same column would be schema
-- drift and pure write cost on the most write-hot table in the system.
