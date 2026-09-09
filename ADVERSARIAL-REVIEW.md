# Concord CLM — Adversarial Production Review

**Review target:** Concord CLM Latest Delivery Package / latest Release Candidate  
**Review date:** 2026-09-08  
**Method:** hostile source review of authentication, authorization, lifecycle state, document provenance, AI boundaries, approvals, e-signature, uploads, webhooks, audit integrity, concurrency, deployment/security controls; exploitable findings were remediated in the accompanying source where safely possible.

## Executive result

The adversarial pass found several material issues that were not visible in a normal feature/readiness review. The remediated build is substantially stronger, but it is **not yet production-certified** because environment-backed verification remains outstanding. In particular, production release must remain blocked until the full pnpm test/build gate, migrations against staging, browser/Entra E2E, external security scanners, and the real Melento document/executed-artifact contract pass.

The most important security property added by this pass is a continuous legal-artifact chain:

`uploaded bytes → SHA-256 → AI review provenance → approval routing pin → approval decision pin → signing request pin → provider source-hash attestation → provider-executed bytes → archive SHA-256`.

If any link differs, production now fails closed rather than silently continuing.

## Material findings and remediation

| Severity | Finding | Adversarial impact | Remediation status |
|---|---|---|---|
| Critical | Approval was keyed to contract ID rather than exact document/hash/version | An approved contract could be replaced before signing while the lifecycle still looked approved | **Fixed.** Documents, AI review, routing, decision and signature request now carry document ID + SHA-256 + contract version; mutations are frozen once routed/approved/signing |
| Critical | E-sign adapter did not transmit/verify the exact legal artifact and archive stored an internal HTML certificate | Concord could show “executed” without possessing cryptographic evidence that the approved agreement was what got signed | **Fail-closed remediation.** Source bytes+hash are sent to the adapter; production archive requires provider-executed bytes and provider source-SHA attestation. Vendor UAT flag is mandatory |
| Critical | Unmapped Entra identity defaulted to viewer, and viewer can read contracts | Any otherwise-unmapped employee in the tenant could potentially authenticate and read the portfolio | **Fixed.** Production denies unmapped identities unless an explicit manual/bootstrap Concord grant exists |
| High | Role/session revocation waited for 8-hour JWT expiry | Removed/demoted staff retained stale privileges | **Fixed.** Production authorization re-reads current persisted account/role on authenticated requests |
| High | Per-replica contract cache was authoritative after startup | Different pods could review/approve/sign different contract facts | **Fixed.** Request-time production contract reads are authoritative Postgres reads |
| High | Approval email could be routed to arbitrary addresses before callback authorization | Confidential review/contract information could be emailed outside the authorized approver population | **Fixed.** Every recipient must already exist with `approve` permission before routing/sending |
| High | Counsel approval routing and approval authority were conflated | Separation-of-duties boundaries were weaker than intended | **Fixed.** New `approval:route` permission is separate from `approve` |
| High | AI review could silently truncate a long agreement | “Full” legal review could omit late clauses without telling the user | **Fixed fail-closed.** Production rejects documents above the configured complete-review input limit until full-document chunking is implemented |
| High | Approval could be re-routed after a decision | Users could receive a new approval request even though a one-shot decision already governed the contract | **Fixed.** Existing decision blocks re-routing; a new explicit version is required |
| High | Same approved artifact could race into multiple signing envelopes | Duplicate legally-live envelopes could be sent for the same contract version | **Fixed.** DB unique key on contract/version/document is written before provider side effects |
| High | Completion could commit before archive retrieval; retry then looked terminal/duplicate | A contract could remain completed but permanently unarchived after transient storage/provider failure | **Fixed.** Completion retries repair a missing archive; provider-executed evidence must be present |
| High | Any ZIP magic header was treated as an Office document | ZIP bombs/arbitrary archives could reach scanners/OCR/parsers | **Fixed.** OOXML structure, central-directory bounds, entry count, expanded size, path safety and compression-ratio checks added |
| High | Production could start without a malware scanner | Unscanned uploaded agreements could enter the legal repository | **Fixed.** Absence/misconfiguration of required scanning is now a production boot error |
| High | Actionable-message sender allow-list accepted a token with no sender | Missing sender identity could bypass the intended sender restriction | **Fixed.** When an allow-list exists, missing sender is rejected |
| Medium | Malformed approval decision defaulted to approved | Protocol drift/malformed payload could be interpreted as an approval | **Fixed.** Decision must be exactly `approved` or `rejected` |
| Medium | Executed archive download lacked an explicit permission decorator | It relied only on global authentication rather than intended contract-read authorization | **Fixed.** `contract:read` is explicit |
| Medium | Stored document route rendered content inline | In-browser parser/rendering attack surface was unnecessarily exposed | **Fixed.** Downloads are attachment/no-store paths |
| Medium | Public readiness exposed integration/telemetry posture | Unauthenticated reconnaissance revealed internal provider/degradation details | **Fixed.** Production readiness exposes only coarse dependency state |
| Medium | Repository RAG context was not strongly fenced as untrusted | Retrieved document text could act as prompt-injection instructions | **Hardened.** Retrieved context is explicitly fenced and treated as untrusted data |
| Medium | Bounded audit verification could miss old-row deletion | A truncated/deleted historical prefix could escape a suffix-only walk | **Fixed.** DB count/sequence high-water consistency is checked in addition to hash-chain verification |

## Production controls added or strengthened

- Exact document SHA-256 provenance across review → approval → signature → executed archive.
- Production SSO deny-by-default for unmapped identities.
- Immediate persisted-role reauthorization for stale-session revocation.
- Explicit approval-routing vs approval-decision permissions.
- Authorized approver validation before confidential email leaves Concord.
- One-shot approval and unique signature request per contract/version/document.
- Provider-executed document retrieval and source-lineage verification gate.
- Recovery of completed-but-unarchived webhook executions.
- OOXML ZIP-bomb and archive-structure checks.
- Mandatory production malware scanning.
- Production readiness response minimization.
- Forced attachment delivery for stored legal documents.
- Grounded AI provenance and production long-document fail-closed behavior.
- RAG prompt-injection fencing.

## Verification performed in this environment

- `scripts/check-invariants.js`: **PASS** — 121 TypeScript source files in covered roots; 151 environment variables documented; manifests/README/Prisma invariants checked.
- `scripts/security-offline.js`: **PASS — 23/23**.
- TypeScript compiler parser: **PASS — 141 TS/TSX files, 0 syntax diagnostics**.
- `node scripts/verify.js`: **NOT COMPLETE / NOT PASSING**, because this sandbox has no `pnpm` installation/workspace dependencies and no `DATABASE_URL`. It reports 2 pass, 9 blocked/fail, 1 skipped. These failures are environment/tooling absence, not evidence those test/build steps passed.

## Mandatory release gates still outstanding

1. Run `pnpm install --frozen-lockfile && pnpm verify` on the exact remediated commit in a network-enabled CI runner.
2. Apply the full Prisma migration chain to a production-like staging Postgres/pgvector database; fail on any duplicate signature artifact exposed by the new unique constraint.
3. Run the staging browser journey and Entra SSO E2E with real role mappings, session revocation/demotion, approval and signing paths.
4. Run `pnpm audit`, Gitleaks, Trivy filesystem/IaC and both container-image scans, CodeQL, SBOM generation and OWASP ZAP against staging.
5. Complete Melento vendor UAT. `MELENTO_DOCUMENT_API_VERIFIED=true` and `MELENTO_EXECUTED_DOCUMENT_API_VERIFIED=true` must be set **only after** the vendor contract proves exact source bytes/hash are accepted and the executed artifact returns exact source-SHA lineage. The adapter deliberately blocks production otherwise.
6. Upgrade Next.js from the unsupported 14.x line to a currently supported LTS version in a network-enabled dependency-update branch and rerun the entire regression suite.
7. Put distributed rate limiting/WAF/API-gateway enforcement in front of the API. The in-process limiter remains defense-in-depth, not a multi-replica security boundary.
8. Prove backup/restore, private networking, Key Vault/managed-identity permissions, alerting and rollback in the actual cloud environment.

## Important residual design item

Concord now **freezes a contract after it enters approval/signature** to protect the evidence chain. The data model still needs a first-class, immutable `ContractVersion` workflow for negotiated revisions/rejections/amendments. Until that exists, the system is safe against silent mutation but operationally restrictive: a rejected/routed contract cannot simply be edited in place. Do not weaken the freeze as a workaround; implement explicit version creation with preserved historical decisions/documents.

If Concord will ever serve more than one tenant or require business-unit ethical walls, add tenant/business-unit identifiers to every legal object and enforce object-level authorization at the query layer before that deployment. The current hardening assumes a single authorized enterprise portfolio.

## Release decision

**Adversarial code status: substantially hardened. Production certification: HOLD pending the mandatory gates above.**

The build should be promoted only when environment-backed evidence turns every release gate green; security controls that depend on external systems must never be represented as “passed” based solely on source inspection.
