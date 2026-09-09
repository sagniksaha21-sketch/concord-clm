# Concord CLM — Production hardening changes

Date: 2026-09-08

This repository has been hardened from a production-like demo/vertical slice toward a fail-closed production CLM baseline.

## Implemented

- Added a persisted `Contract` Prisma model and migration; production contract reads no longer come from shared fixtures.
- Added contract create/update APIs protected by `contract:write`; reads require `contract:read`.
- Linked `Document` records to contracts and persisted extracted document text for grounded AI review.
- Replaced storage-key document downloads with database document IDs and permission-checked download routes.
- Production database startup now fails when `DATABASE_URL` is absent or Prisma/Postgres cannot connect.
- Production object storage startup now fails when durable Blob/S3 storage is absent or cannot initialize.
- Storage is now part of `/api/health/ready`; deployment smoke tests target readiness, not liveness.
- Production migration deploy no longer masks migration failures; the workflow waits for the migration job and fails the release if it fails or times out.
- Contract/repository/AI-review endpoints now carry explicit `contract:read` permissions.
- Browser bearer-token storage was removed. Password and SSO sessions now use HttpOnly cookies; browser API requests use `credentials: include`; logout expires the server-set cookie.
- Added optional `AUTH_COOKIE_DOMAIN` for split web/API subdomain deployments.
- Added `Permissions-Policy`, HSTS in production, and `forbidNonWhitelisted` request validation.
- AI review in production now requires a linked, extracted contract document and a configured Azure OpenAI deployment.
- Built-in canned AI reviews are limited to non-production demo mode.
- AI output receives runtime structural validation for risk score/level and required collections.
- AI prompts explicitly fence contract text as untrusted data and require grounded review.
- Repository semantic knowledge no longer includes curated demo portfolio facts in production.
- Ingestion storage/OCR/extraction provider failures fail the production request instead of silently falling back.
- Source invariants pass after the hardening changes.

## New migration

`apps/api/prisma/migrations/20260908124500_contract_system_of_record/migration.sql`

It creates `Contract`, adds `Document.contractId`, and adds `Document.extractedText`.

## Required production configuration

Production intentionally fails closed when required integrations are unavailable. Configure real secrets and endpoints through your secret manager/runtime, including Postgres, durable storage, Entra SSO, AI/OCR/embeddings, notification/e-sign integrations that are enabled, malware scanning, and strong auth/download secrets. Keep `DEMO_SAMPLES=false`.

For separate web/API subdomains, set `AUTH_COOKIE_DOMAIN` to their shared parent domain (for example `.contracts.example.com`).

## Verification status in this review environment

`node scripts/check-invariants.js` passes.

The full `node scripts/verify.js` gate could not be executed successfully here because this container does not have `pnpm` or installed workspace dependencies (`node_modules`). The resulting failures are environment/tooling failures rather than demonstrated application test failures. Before deployment, CI must run:

```bash
pnpm install --frozen-lockfile
pnpm --filter @concord/api db:migrate
pnpm verify
```

against the CI/staging Postgres service, followed by staging end-to-end tests.

## Remaining release gates outside this offline code-edit environment

1. Run a full dependency install, Prisma generation, typecheck, Jest suite and production builds in CI.
2. Run `pnpm audit`, Gitleaks and Trivy with network/current advisory access.
3. Apply the new migration to staging and exercise contract create → upload/OCR → AI review → approval → e-sign → archive end to end.
4. Configure cloud secrets/identity, private networking/WAF/rate limiting, backups/restore testing and monitoring/alerts in the target subscription.
5. Upgrade Next.js to a currently supported LTS line in a network-enabled branch, refresh the lockfile, and regression-test before production promotion.
6. Conduct an external penetration test and a legal-team AI evaluation set before final go-live approval.

