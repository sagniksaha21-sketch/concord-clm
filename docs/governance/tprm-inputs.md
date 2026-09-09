# TPRM inputs — subprocessors, inherent-risk profile & exit

**Closes / evidences:** assessment appendix **B.1/B.2 (TPRM gaps)** — inherent-risk profile,
subprocessor/fourth-party inventory, exit & data-disposition plan, evidence expectations.

> This is a **TPRM input**, not a classification. Formal screening, supplier classification,
> the risk tier, the cyber contractual schedule and residual-risk acceptance remain owned by
> Unilever TPRM/Procurement. This document supplies the inherent-risk facts they need.

---

## 1. Inherent-risk profile

| Attribute | Position |
|---|---|
| Service | AI-native Contract Lifecycle Management (intake → authoring → review → approval → e-sign → repository → obligations) |
| Data accessed | Confidential contracts; personal data of employees, approvers, signatories, counterparties; PAN/GSTIN |
| Access to Unilever/LLPL systems | Entra ID (SSO), Microsoft Graph (Outlook send), Blob/DB within LLPL cloud tenant |
| Integration privileges | Read/send mail on behalf of the approval workflow; no write access to other corporate systems |
| Operational dependency | Medium–High — CLM is business-critical for legal operations but not customer-facing/real-time |
| Tolerable disruption (RTO/RPO target) | RTO 4h / RPO 24h (to be confirmed and tested at Gate 4) |
| Criticality | High for legal continuity; degraded modes (read-only repository) available |
| Confidentiality | High | Integrity | High | Availability | Medium |

## 2. Subprocessor & fourth-party inventory

| Subprocessor | Function | Data received | Location | Approved? |
|---|---|---|---|---|
| Microsoft Azure | Hosting, PostgreSQL, Blob, Azure OpenAI, Document Intelligence | All contract & personal data | Central India | Primary (ADR-001) |
| Microsoft Entra ID / Graph | Identity, Outlook approval channel | User identity, approval actions | Microsoft 365 tenant | In use |
| Melento | E-signature + digital e-stamp | Signatory identity, executed document, stamp duty details | India | Vendor — TPRM assessment required |
| Amazon Web Services (Bedrock, Textract, S3, RDS) | **DR fallback only** | Same as Azure, only if activated | India region | Fallback (ADR-001) |
| Ollama / local models (optional) | Self-hosted inference (zero external AI cost) | Processed in-tenant; no external call | In-tenant | Optional config |

Notes: the **approved production list is Azure + Entra + Melento**. AWS is a contingent
fallback and must not be active without change control. The provider switches in code do
not change this approved list; enabling a non-listed provider is a governed change.

## 3. Cyber contractual provisions

The cyber contractual schedule / provisions selected by TPRM/Procurement are to be inserted
and executed for Melento (and any activated fallback) before onboarding. Incident-notification
and cooperation duties must be contractually agreed. Not yet executed — TPRM closure item.

## 4. Exit & data-disposition plan

1. **Trigger** — contract termination, vendor change, or decommission.
2. **Access revocation** — disable Entra app roles; rotate/revoke Melento + cloud credentials.
3. **Data return** — export contracts, executed archive and audit trail (the audit export
   endpoint provides an integrity-attested copy) in a portable format.
4. **Deletion** — delete production data and backups per the retention schedule, honouring any
   legal hold; obtain **deletion certification** from each processor.
5. **Evidence** — record exit actions in the audit trail and retain the certification.

## 5. Ongoing assurance

| Item | Cadence / trigger |
|---|---|
| Periodic reassessment | Annual, or on material change (new subprocessor, region, model, or data category) |
| Material-change triggers | Change of cloud/region (ADR re-open), new subprocessor, new personal-data category, AI provider change |
| External monitoring | Vendor security posture monitoring (owner: SEC) |

## 6. Evidence expected by TPRM (mapping)

| TPRM evidence area | Where it comes from |
|---|---|
| Architecture & data flows | ADR-001, `pra-processing-inventory.md` §3, `deployment.md` |
| Identity & access | `rbac-role-matrix.md`, Entra config (IT) |
| Security testing | CI scan outputs + penetration-test report (pending, Gate 5) |
| Data protection | Encryption/key evidence (IT), retention config (`pra-processing-inventory.md` §4) |
| Resilience | Backup/restore + DR test evidence (pending, Gate 4) |
| Audit & monitoring | Sample immutable events (`GET /api/audit/export`), alerting config (IT) |
