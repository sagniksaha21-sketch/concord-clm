# Concord CLM — Release Candidate Production Readiness Report

**Date:** 8 September 2026  
**Artifact:** Production-hardened + premium UX release candidate

## Executive status

This pass turns the previous hardened build into a release candidate with stronger browser/session security, stricter system-of-record boundaries, improved e-signature/approval integrity, executable CI/staging gates, and a substantial UX redesign across the core legal journeys.

The codebase is **not being falsely certified as production-deployed** from this sandbox. The dependency-backed and environment-backed gates that require npm registry access, Postgres, external scanners, GitHub Actions, Microsoft Entra and the actual staging URLs are now encoded as mandatory workflows, but they still need to execute in the real CI/staging environment before go-live.

## Gates executed in this review environment

| Gate | Status | Result |
|---|---|---|
| Repository source invariants | PASS | 121 TypeScript source files covered; 144 environment variables documented; manifests/README/Prisma checks green |
| Concord offline security preflight | PASS | 23/23 checks green |
| TypeScript/TSX syntax parse | PASS | 141 files parsed with the TypeScript compiler parser; 0 syntax failures |
| GitHub workflow YAML parse | PASS | `ci.yml`, `codeql.yml`, `deploy.yml`, `staging-e2e.yml` all parse |
| Dependency-free JS/Python syntax checks | PASS | release scripts/config parse successfully |
| CSS structural check | PASS | balanced stylesheet structure |
| Fixture/demo production-web scan | PASS | no hardcoded CLM sample review IDs, fixture `CONTRACTS` imports, “illustrative concept” or swallowed “demo” errors in production web flows |
| `pnpm verify` | BLOCKED HERE | `pnpm` is not installed; Corepack cannot download pnpm because `registry.npmjs.org` DNS is blocked (`EAI_AGAIN`) |
| Prisma package/schema generation check | BLOCKED HERE | workspace `node_modules` is unavailable because dependencies cannot be installed |
| Real migration apply/drift test | BLOCKED HERE | no Postgres/Docker runtime and no `DATABASE_URL`; drift script correctly reports `SKIP — DATABASE_URL not set` |
| Browser E2E | BLOCKED HERE | Chromium exists, but Playwright/workspace dependencies cannot be installed and no running stack is available |
| `pnpm audit`, Gitleaks, Trivy, CodeQL | BLOCKED HERE | external scanner binaries/package registry are unavailable in the sandbox; mandatory CI jobs are included |
| Staging Entra E2E + ZAP | BLOCKED HERE | connected GitHub account exposed no repositories and no staging URLs/credentials were available; mandatory staging workflow is included |

### Exact `pnpm verify` attempt

The command was attempted. It exited `127` because `pnpm` is not present. The Corepack fallback then attempted to fetch `pnpm@9.7.0` and failed with `getaddrinfo EAI_AGAIN registry.npmjs.org`. This is an environment/network limitation, not a passing or failing application test result.

## Release gates now enforced in GitHub Actions

### Pull request / main CI

`.github/workflows/ci.yml` now enforces:

1. Node 22 + pinned pnpm 9.7.0.
2. Frozen lockfile install.
3. Clean pgvector/Postgres 16 service.
4. `prisma migrate deploy` against the clean CI database.
5. Full `pnpm verify`.
6. A second isolated Postgres E2E database.
7. Non-production persisted contract fixtures seeded through Prisma.
8. Production web/API builds.
9. Pinned Chromium/Playwright browser runtime.
10. Real browser journey through authentication, Command Center, Intake, Pipeline, Review queue, persisted review detail, Repository, Obligations, E-sign, Notifications and Audit.
11. Page-error and HTTP 5xx detection.
12. Offline Concord-specific security invariants.
13. `pnpm audit --audit-level high`.
14. Gitleaks.
15. Trivy filesystem, secret and IaC scanning with HIGH/CRITICAL blocking.
16. Required CycloneDX SBOM generation and artifact upload.
17. Separate scheduled/push CodeQL `security-extended` analysis.

### Staging E2E / DAST

`.github/workflows/staging-e2e.yml` now provides a manually gated `staging` environment workflow that:

1. Requires staging web/API URLs.
2. Requires `/api/health/ready` to return HTTP 200.
3. Uses a dedicated Entra automation account by default, exercising the real Microsoft SSO redirect/callback/session flow.
4. Optionally accepts a short-lived pre-issued staging session token so a CI system does not have to store an SSO password.
5. Runs the complete browser journey.
6. Verifies HSTS, CSP, `nosniff` and frame-denial headers.
7. Runs an OWASP ZAP baseline scan of the public staging/login surface and uploads the report.

Required GitHub `staging` environment values:

- Variable: `STAGING_WEB_URL`
- Variable: `STAGING_API_URL`
- Secret: `STAGING_E2E_EMAIL` + `STAGING_E2E_PASSWORD`, **or** `STAGING_E2E_SESSION_TOKEN`

The Entra automation account should be dedicated to testing, have the permissions required for the journey, and—if password automation is used—be governed by a tenant policy appropriate for non-human test identities. Prefer the short-lived session-token route where your deployment platform can mint one safely.

## Security changes in this RC

- Browser API traffic is same-origin through the Next.js `/api` proxy; JavaScript never receives the session JWT.
- HttpOnly/Secure/SameSite session model retained and strengthened.
- Cookie-authenticated mutations now require an allowed browser `Origin`.
- JWTs pin HS256, issuer and audience on both issue and verify paths.
- Production password login is disabled server-side, not merely hidden in the UI.
- Production rejects demo-user enablement.
- Production requires `WEB_ORIGIN` and HTTPS origins.
- Nonce-based CSP is forwarded correctly to Next.js framework rendering rather than being a response-only policy that breaks bootstrap scripts.
- Security headers include HSTS in production, `nosniff`, frame denial, referrer policy, Permissions Policy, COOP and CORP.
- Azure Blob supports managed identity; production probes the expected container rather than creating a new empty container on typo/misconfiguration.
- S3 now performs `HeadBucket` before reporting storage ready.
- OCR child-process execution is restricted to the Tesseract adapter, uses `execFile` (no shell), fixed executable names, temporary-file isolation and validated `TESSERACT_LANG`.
- The sample ingestion endpoint returns 404 in production and requires ingest-write permission even outside production.
- High-signal secret checks cover AWS keys, GitHub tokens, private keys and Slack tokens in the dependency-free preflight.
- Web and API container images are both scanned in deployment.
- SBOM generation can no longer silently fail.

## System-of-record / workflow integrity changes

- E-signature UI no longer imports fixture contracts.
- E-signature requests select only persisted contracts loaded from `/api/contracts`.
- The e-signature service re-resolves the contract server-side and derives its title from the persisted record; it does not trust the browser-supplied contract title.
- Named signatories are no longer pre-filled in production UX.
- The provider simulator control is UI-hidden unless explicitly enabled for development; the API independently blocks simulation in production.
- Approval routing no longer contains hardcoded named approvers. Counsel enters the intended approver identities for each routing action.
- Approval UX explicitly explains that receipt of an Outlook request does not grant approval authority; server-side authorization remains decisive.
- Non-production CI fixtures are persisted through Prisma so E2E tests the same Contract table used in production.
- Personal demo identities were replaced with explicit `example.test` development identities.

## UX / product experience changes

The core product now has a consistent premium workspace layer rather than page-by-page demo UI.

### Global shell

- Skip-to-content accessibility link.
- `aria-current` navigation state.
- Live readiness/status indicator.
- Global “New” action menu for contract request, secure upload and Concord AI.
- Improved account/appearance menu.
- Mobile bottom navigation for primary journeys.
- Existing command palette retained.
- Responsive behavior, dark/light theme and reduced-motion support preserved.

### Login

- Enterprise split-screen experience.
- Microsoft Entra is the primary production identity action.
- Development password form is rendered only with an explicit public development flag.
- Security/grounded-AI/system-of-record value proposition is clear before sign-in.

### AI Review

- New searchable/filterable review queue backed by real contracts.
- Risk/stage/portfolio metrics.
- Premium grounded-review detail page with risk summary, contract metadata, advisory banner, section navigation, clause findings, key terms, playbook deviations and approval routing.
- No hardcoded sample review ID.

### Secure ingestion

- Upload UI matches backend limits: 20 files, 25 MB each.
- De-duplicated queue and per-file removal.
- Accessible keyboard/drag-drop interaction.
- Real processing/error state rather than artificial delays.
- Security verdicts, OCR/extraction outcomes, validation flags and protected original-document access.
- Demo sample ingestion is opt-in only outside production.

### Repository / Concord AI

- First-class AI query workbench.
- Suggested high-value legal questions.
- Loading/error states.
- Copyable answer with citations.
- Retrieval provenance: passage count, store, embeddings provider and answer model.
- Expandable retrieved evidence and similarity.
- Permission-aware/audit-aware trust messaging.
- Improved executed-document archive presentation.

### Intake

- Guided legal front door with complete labeled fields and contextual helper copy.
- Queue/risk/conversion metrics.
- Success/error live feedback.
- Guided “what happens next” experience.
- Better request queue readability.

### Pipeline

- Portfolio/review/high-risk metrics.
- Search and risk filters.
- Better lifecycle lanes, card hierarchy and empty states.
- Explicit system-of-record lifecycle explanation.

### E-signature

- Persisted-contract selector only.
- Blank, ordered signatory editor.
- Digital-stamp configuration.
- Safer error/success handling.
- Active/completed/archive metrics.
- Provider-state cards, signer states, e-stamp summary and execution audit details.
- Executed archive with integrity checksum.

### Templates / authoring / obligations

- Removed “illustrative concept”, “ignore in demo” and in-memory-production language.
- Authoring and template failures now surface to the user.
- Template saves/deletes provide success feedback.
- Legal/advisory governance copy replaces prototype language.

## Remaining go-live conditions

These are not code changes that can be truthfully completed without the target environment:

1. Run the revised GitHub CI on this exact artifact and require all jobs green.
2. Apply all three Prisma migrations to a staging copy of the production database and run drift checking.
3. Run the staging Entra browser journey and ZAP baseline against the actual staging URLs.
4. Review and remediate every HIGH/CRITICAL finding from `pnpm audit`, Trivy, CodeQL and Gitleaks before release; exceptions require documented risk acceptance.
5. Configure real Entra, Graph, Azure OpenAI/embeddings, OCR, malware scanner, object storage and Melento credentials in the target secret store.
6. Validate the managed-identity Blob RBAC assignment and production `/api/health/ready` status.
7. Execute backup/restore and disaster-recovery tests against the actual Postgres/Blob setup.
8. Perform an authenticated penetration test and AI red-team/evaluation with representative contracts.
9. Upgrade Next.js from the currently locked 14.x line to a supported LTS branch in a network-enabled dependency environment, then rerun the complete regression/security suite.
10. Complete load/concurrency testing at expected contract volume and upload/OCR concurrency.

## Release decision

**Code/UX release candidate: YES.**  
**Approved for live production right now: NO — not until the environment-backed gates above execute successfully on this exact commit/artifact.**

The repository now fails much more explicitly and CI encodes the missing proof. A release should not be promoted by manual judgment if any required migration, readiness, E2E or security job is red or skipped.
