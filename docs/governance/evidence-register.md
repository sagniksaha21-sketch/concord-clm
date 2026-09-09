# Evidence register

**Closes / evidences:** assessment appendix **B.6** — "A control should not be marked complete
merely because it appears in an architecture document. Completion should identify the evidence
owner, reviewer, location, test date, result, open observation and approval status."

**How to use:** every control in `remediation-tracker.md` earns a row here. A control is
**Closed** only when this register carries a reviewer, a test date and a result. Rows below in
`Verified (in-session)` state carry evidence produced during build; `Owner` rows await the named
owner's test at the stated gate.

---

| Control | Evidence artefact / location | Owner | Reviewer | Test date | Result | Status |
|---|---|---|---|---|---|---|
| RBAC enforced server-side | `roles.guard.ts` + negative tests (403 viewer/counsel, 200 lead) | LEG | _pending_ | 2 Sep 2026 | Pass (in-session) | Verified; awaiting reviewer |
| Denied-access logging | `access.forbidden`/`access.unauthenticated` audit events observed | LEG | _pending_ | 2 Sep 2026 | Pass (in-session) | Verified; awaiting reviewer |
| Immutable audit chain | `GET /api/audit/verify` → "Chain intact" after mutations | LEG | _pending_ | 2 Sep 2026 | Pass (in-session) | Verified; awaiting reviewer |
| AI provenance capture | `approval.requested` event carries `ai.provider/model/advisory` | LEG | _pending_ | 2 Sep 2026 | Pass (in-session) | Verified; awaiting reviewer |
| Audit export for litigation hold | `GET /api/audit/export` returns ordered chain + integrity attestation | LEG | _pending_ | 2 Sep 2026 | Pass (in-session) | Verified; awaiting reviewer |
| Upload MIME/signature validation | Fake `.exe`-as-`.pdf` → detected `application/x-msdownload` → **quarantined** | IT | _pending_ | 2 Sep 2026 | Pass (in-session) | Verified; awaiting reviewer |
| Malware scan & quarantine | Quarantine path + `MALWARE_SCAN_URL` seam; `ingest.quarantined` audit event | IT + SEC | _pending_ | — | Seam ready | Config at deploy |
| Signed short-lived download links | Valid link → 200; tampered signature → 403; access logged | IT | _pending_ | 2 Sep 2026 | Pass (in-session) | Verified; awaiting reviewer |
| Retention & legal hold | `retentionUntil` + `legalHold` on executed records; schedule in PRA inventory | IT + PRIV | _pending_ | — | Model ready | Config + test at Gate 4 |
| Idempotent webhooks | Duplicate Melento webhook → `duplicate:true`, not re-applied | IT | _pending_ | 2 Sep 2026 | Pass (in-session) | Verified; awaiting reviewer |
| Idempotent approval actions | Repeat Outlook action → recorded once | IT | _pending_ | 2 Sep 2026 | Pass (in-session) | Verified; awaiting reviewer |
| Replica-safe scheduling | `JobsService.claimOnce` for nudge; digest DB claim | IT | _pending_ | 2 Sep 2026 | Pass (logic) | Verified; awaiting reviewer |
| Retry/backoff + DLQ | `runWithRetry` + `deadLetters()` seam | IT | _pending_ | — | Seam ready | Config (managed queue) at deploy |
| Prompt-injection handling | "ignore previous instructions…" doc → flagged, `needs-review`, audit `ai.injection_flagged` | LEG + SEC | _pending_ | 2 Sep 2026 | Pass (in-session) | Verified; awaiting reviewer |
| Confidence threshold + human review | `gateConfidence()` → low-confidence extraction forced to `needs-review` | LEG | _pending_ | 2 Sep 2026 | Pass (logic) | Verified; awaiting reviewer |
| No autonomous approval | `advisoryOnly`; humans approve/sign/execute | LEG | _pending_ | 2 Sep 2026 | Pass (design) | Verified; awaiting reviewer |
| Production secret hardening | Boot with placeholder secret in prod → **refuses to start** | IT | _pending_ | 2 Sep 2026 | Pass (in-session) | Verified; awaiting reviewer |
| Entra-only production login | `demoLoginEnabled()` false in prod; demo accounts unusable | IT | _pending_ | 2 Sep 2026 | Pass (logic) | Verified; awaiting reviewer |
| Cloud & residency decision | `ADR-001-cloud-and-residency.md` | LEG + SEC | _pending_ | 2 Sep 2026 | Decided | Awaiting Unilever approval |
| PWA offline policy | `pwa-offline-policy.md` | IT | _pending_ | 2 Sep 2026 | Policy set | Awaiting implementation review |
| Encryption in transit/at rest | TLS + Key Vault-managed keys | IT | _pending_ | — | — | Config at deploy |
| Object-storage versioning/soft-delete | Azure Blob versioning | IT | _pending_ | — | — | Config at deploy |
| Central logs/metrics/traces + alerting | App Insights / OpenTelemetry | IT | _pending_ | — | — | Config at deploy |
| Backup restoration drill; RTO/RPO | DR runbook + drill | IT | _pending_ | — | — | Test at Gate 4 |
| Independent penetration test | Pen-test report + remediation closure | SEC | _pending_ | — | — | Schedule before go-live |
| SAST / dependency / image scanning | CI stage outputs | IT | _pending_ | — | — | Config at deploy |
| TPRM classification & closure | `tprm-inputs.md` → formal TPRM outcome | SEC | _pending_ | — | — | Unilever assurance |
| PRA disposition | `pra-processing-inventory.md` → formal PRA outcome | PRIV | _pending_ | — | — | Unilever assurance |

---

### Note on "in-session" evidence

Rows marked *Pass (in-session)* were exercised against a running Concord API instance during
build (in-memory persistence mode, deterministic AI). They demonstrate the control's behaviour
in code. For go-live they must be re-run by the named owner against the production configuration
(Postgres + Entra + managed queue) and signed off — that is what moves a row from *Verified;
awaiting reviewer* to **Closed**.
