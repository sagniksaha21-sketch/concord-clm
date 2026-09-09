# Concord remediation tracker

**Closes / evidences:** the assessment's request for "an authoritative register [linking]
each control gap to an owner, due date, closure evidence and residual-risk decision".

**How to read `Status`:** `Implemented (evidence in repo)` = code + verification exist in
this bundle and are cited below. `Config/Operational` = a deployment or process action the
platform is built to support but which is completed by IT/assurance at go-live.
`Governance` = an assurance artefact (this pack) or a Unilever assurance-team outcome.

**Legend — Owner:** LEG = Lead–Legal / Legal Technology · IT = LLPL IT platform ·
SEC = Unilever Cyber/TPRM · PRIV = Unilever Privacy/PRA.

---

## Critical & high architecture findings

| ID | Finding | Owner | Target gate | Status | Evidence |
|---|---|---|---|---|---|
| **C1** | Production authorization / RBAC | LEG + IT | Gate 2 | **Implemented (evidence in repo)** | `roles.ts`, `roles.guard.ts`, `jwt-auth.guard.ts`, global `APP_GUARD`; `rbac-role-matrix.md`; negative tests recorded |
| **C2** | Immutable, complete audit trail | LEG + IT | Gate 3 | **Implemented (evidence in repo)** | `audit/*` — hash-chained append-only store, interceptor, exception filter, `GET /api/audit`, `/verify`, `/export`; AI provenance captured; verify returns "chain intact" |
| **H1** | Durable asynchronous processing | IT | Gate 4 | **Implemented (seam) + Config** | `jobs/jobs.service.ts` (atomic `claimOnce`, retry/backoff, DLQ); webhook + approval idempotency; replica-safe nudge claim. Managed queue/workers wired at deploy |
| **H2** | Document security & malware controls | IT + SEC | Gate 2 | **Implemented (seam) + Config** | `security/file-security.service.ts` (magic-byte sniff, executable deny, size, quarantine); malware-scan seam (`MALWARE_SCAN_URL`); signed short-lived links; retention + legal-hold fields; access logging |
| **H3** | PWA security & offline policy | IT | Gate 2 | **Governance (policy set)** | `pwa-offline-policy.md` — selective caching, no confidential-body caching, logout cache-clear, managed-device + offline-expiry policy |
| **H4** | Cloud & residency decision | LEG + IT + SEC | Gate 1 | **Governance (decided)** | `ADR-001-cloud-and-residency.md` — Azure / Central India primary, AWS DR fallback, in-country data |
| **H5** | Production identity & secret hardening | IT | Gate 2 | **Implemented + Config** | `security/security.config.ts` boot guard (refuses placeholder secret / demo login in prod); Entra-only production login; Key Vault + Managed Identity at deploy; session/cookie policy |

## Microscopic checklist — status against the assessment's control list

| Domain | Control | Status | Evidence / note |
|---|---|---|---|
| Identity & access | RBAC enforced server-side & negatively tested | **Done** | `roles.guard.ts`; negative tests in `rbac-role-matrix.md` |
| Identity & access | Entra-only production login; demo accounts disabled | **Done (guard) + Config** | `security.config.ts`; `demoLoginEnabled()` false in prod |
| Identity & access | MFA & Conditional Access | **Config** | Entra Conditional Access policy at tenant |
| Identity & access | Session expiry, revocation, secure cookies | **Done + Config** | 8h JWT expiry; `SameSite=Lax`; revocation via Entra + short session |
| Identity & access | Privileged separation / break-glass | **Done (roles) + Governance** | `admin` separated from `lead`; break-glass runbook (IT) |
| Legal auditability | Append-only audit events | **Done** | `audit.service.ts` hash chain |
| Legal auditability | Actor/timestamp/entity/object/action captured | **Done** | `AuditEvent` schema |
| Legal auditability | Before/after metadata for changes | **Done (metadata)** | `metadata` on domain events |
| Legal auditability | AI provider/model/prompt/source-version captured | **Done** | `AuditAiProvenance`; `aiProvenance()` |
| Legal auditability | Human override & approval rationale | **Done** | `approval.approved/rejected` events with comment |
| Legal auditability | Immutable retention & clock sync | **Config** | Append-only DB role + NTP; `deployment.md` |
| Legal auditability | Audit export for investigation / litigation hold | **Done** | `GET /api/audit/export` with integrity attestation |
| Document protection | Object-storage versioning & soft delete | **Config** | Azure Blob versioning (ADR-001) |
| Document protection | Encryption in transit & at rest | **Config** | TLS + platform-managed keys (Key Vault) |
| Document protection | Malware scan & quarantine | **Done (seam) + Config** | `file-security.service.ts`; scanner via `MALWARE_SCAN_URL` |
| Document protection | Max upload size & MIME validation | **Done** | magic-byte sniff + `UPLOAD_MAX_BYTES` |
| Document protection | Signed, short-lived download links | **Done** | `download-link.service.ts`; `/archive/:id/link` |
| Document protection | Retention, deletion & legal-hold workflow | **Done (model) + Config** | `retentionUntil`, `legalHold`; schedule in `pra-processing-inventory.md` |
| AI governance | Retrieval citations to source clauses | **Done** | repository answers cite passages |
| AI governance | Structured outputs with schema validation | **Done** | zod validators; deterministic fallback |
| AI governance | Confidence thresholds & human review | **Done** | `gateConfidence()`; `needs-review` status |
| AI governance | No autonomous approval or legal conclusion | **Done** | `advisoryOnly`; humans approve/sign/execute |
| AI governance | Prompt-injection & hostile-document handling | **Done** | `screenForInjection()`, `wrapUntrusted()`, anti-injection system prompt |
| AI governance | Model/provider change management | **Config** | provider switches + change control (ADR-001) |
| AI governance | Evaluation set of representative LLPL agreements | **Governance** | build eval set at Gate 5 (pilot) |
| Reliability & ops | Durable queues & external scheduler | **Seam + Config** | `jobs.service.ts`; managed queue at deploy |
| Reliability & ops | Idempotent webhooks & approval actions | **Done** | idempotency keys via `JobsService` |
| Reliability & ops | Retry with exponential backoff | **Done** | `runWithRetry()` |
| Reliability & ops | Dead-letter queue & replay | **Done (seam)** | `deadLetters()`; external replay worker at deploy |
| Reliability & ops | Central logs / metrics / traces; alerting | **Config** | App Insights/OTel at deploy (`deployment.md`) |
| Reliability & ops | Backup restoration drills; RTO/RPO | **Config/Governance** | tested at Gate 4; runbook (IT) |
| Engineering quality | Pinned runtimes & dependencies | **Done** | TS 5.5.4 pinned; lockfile |
| Engineering quality | Automated unit/integration/e2e tests | **Partial + Config** | build + smoke verified; CI suite at Gate 5 |
| Engineering quality | SAST / dependency / image scanning | **Config** | CI stage at deploy |
| Engineering quality | Reversible DB migrations | **Config** | Prisma migrations reviewed |
| Engineering quality | Separate dev/test/prod | **Config** | environment strategy (IT) |

## Residual-risk decisions (to be recorded at go-live)

| Item | Residual position | Decision owner |
|---|---|---|
| Independent penetration test | Not yet performed — schedule before confidential live contracts | SEC |
| Backup/restore & DR drill | Platform supports it; drill evidence pending Gate 4 | IT |
| Formal TPRM classification & PRA disposition | Inputs supplied in this pack; formal outcomes owned by Unilever teams | SEC / PRIV |
| Managed queue vs in-process schedulers | Durability primitives implemented; managed queue is a deploy-time swap behind the same seam | IT |

> This tracker is the living register. Each row moves to **Closed** only when its evidence
> is filed in the evidence register (`evidence-register.md`) with a reviewer and test date.
