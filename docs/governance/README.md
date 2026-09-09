# Concord — Governance & Assurance Pack

Prepared for **Lakmē Lever Private Limited — Legal** in response to the Concord CLM
Architecture Assessment (which found the architecture *approved in principle*, with production
maturity conditional on a set of controls). This pack is the governance half of the closure
programme; the technical half is implemented in the codebase and cited throughout.

## Contents

| Document | Purpose | Assessment finding addressed |
|---|---|---|
| [ADR-001 — Cloud & residency](./ADR-001-cloud-and-residency.md) | One approved cloud, region, AI processor, system of record, support owner and fallback | **H4** |
| [RBAC role & permission matrix](./rbac-role-matrix.md) | Canonical roles, permission matrix, Entra mapping, negative-test evidence | **C1** |
| [Remediation tracker](./remediation-tracker.md) | Authoritative finding → owner → gate → status → evidence register | TPRM B.1 (remediation) |
| [PRA processing inventory](./pra-processing-inventory.md) | Data inventory, controller/processor roles, data flow, retention schedule, DSR, minimisation, automated-decision impact | PRA **B.3** |
| [TPRM inputs](./tprm-inputs.md) | Inherent-risk profile, subprocessor inventory, exit plan, evidence mapping | TPRM **B.1/B.2** |
| [Evidence register](./evidence-register.md) | Per-control evidence, owner, reviewer, test date, result, status | **B.6** |
| [PWA offline policy](./pwa-offline-policy.md) | Selective caching, no confidential-body caching, logout cache-clear, device policy | **H3** |

## How this pack relates to the code

Controls marked *Implemented (evidence in repo)* are backed by working code and in-session
verification:

- **RBAC (C1)** — `packages/shared/src/roles.ts`, `apps/api/src/auth/roles.guard.ts`
- **Immutable audit (C2)** — `apps/api/src/audit/*`
- **Durable async (H1)** — `apps/api/src/jobs/jobs.service.ts`
- **Document security (H2)** — `apps/api/src/security/file-security.service.ts`, `download-link.service.ts`
- **AI guardrails** — `apps/api/src/security/ai-guardrails.service.ts`
- **Identity/secret hardening (H5)** — `apps/api/src/security/security.config.ts`

## Ownership of formal outcomes

The **formal** TPRM classification, PRA disposition, Secure-by-Design/BIA and AI Assurance
outcomes remain owned by the relevant Unilever assurance teams. This pack supplies the accurate,
project-specific inputs those teams need; it does not substitute for their sign-off.
