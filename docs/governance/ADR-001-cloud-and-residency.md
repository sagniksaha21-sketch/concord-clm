# ADR-001 — Approved cloud, region, AI processor and system of record

**Status:** Proposed for approval (closes assessment finding **H4 — Cloud and residency decision inconsistency**)
**Date:** 2 September 2026
**Owner:** Lead – Legal (Concord product owner), jointly with LLPL IT and Unilever Cloud/Cyber assurance
**Supersedes:** the mixed Azure/AWS language in `deployment.md` and `Concord-Stack-Decisions.html`

---

## Context

The reviewed bundle described **two** hosting directions at once: the prototype and
`deployment.md` lean Azure / Central India, while the stack-decision brief names AWS
and recommends Amazon Bedrock. Portability is a strength of the design — every AI and
storage dependency sits behind an adapter — but the assessment is correct that an
*approved production target must be a single, named decision*, not an option set.

This ADR fixes one production position. Portability remains in the codebase as a
migration and business-continuity property; it is no longer an open question for
go-live.

## Decision

Concord's production system of record for confidential live contracts runs on **one**
primary cloud and region, with all personal-data processing kept in-country:

| Dimension | Approved production position |
|---|---|
| **Primary cloud** | Microsoft Azure |
| **Primary region** | Central India (Pune) |
| **Identity** | Microsoft Entra ID (LLPL/Unilever tenant), Entra-only for production |
| **System of record (transactional)** | Azure Database for PostgreSQL Flexible Server, Central India |
| **Semantic index** | pgvector in the same PostgreSQL instance |
| **Document store** | Azure Blob Storage (versioning + soft-delete on), Central India |
| **AI — OCR** | Azure AI Document Intelligence, India region |
| **AI — extraction / review / Q&A** | Azure OpenAI, India-eligible deployment; retrieval-grounded, advisory only |
| **AI — embeddings** | Azure OpenAI embeddings, or the in-process local embedder (no external call) |
| **E-signature + e-stamp** | Melento (India e-sign / digital stamp vendor) — see TPRM inputs |
| **Secrets** | Azure Key Vault + Managed Identity; no long-lived client secrets in production |
| **Support owner** | LLPL Legal Technology, with IT platform on-call |
| **Approved fallback** | AWS (Bedrock + Textract + S3 + RDS/pgvector), same India region — **business-continuity only**, activated under change control, not run active-active |

### Why Azure primary (not AWS)

The user environment is Microsoft 365 (Entra ID, Outlook, Graph, Teams). Keeping
identity, the approval channel (Outlook Actionable Messages) and hosting on one
platform removes a cross-cloud identity/egress seam and shortens the assurance path.
AWS/Bedrock remains fully supported in code (`EMBEDDINGS_PROVIDER`, `CHAT_PROVIDER`,
`EXTRACT_PROVIDER`, `OCR_PROVIDER` switch with no code change) and is the approved
fallback, so the portability the review praised is preserved without leaving the
production target ambiguous.

### Data residency

All personal data — contract content, user/approver/signatory identities, audit logs,
embeddings, prompts and model outputs, and backups — is stored and processed in the
Central India region. Any support, telemetry or model-processing path that would leave
India is **out of scope for this ADR** and may not be enabled without a transfer
assessment and Unilever privacy approval (see `pra-processing-inventory.md`).

### Zero-external-AI-cost option (retained)

The local/deterministic path (`OCR_PROVIDER=tesseract`, `EMBEDDINGS_PROVIDER=local`,
deterministic review) remains available for non-confidential or offline processing and
incurs no per-token AI cost. It is a configuration of the same approved platform, not a
separate deployment.

## Consequences

- `deployment.md` §10 now states Azure/Central India as the production target and
  labels AWS as the approved DR fallback, subordinate to this ADR. **Done** — it was
  raised as an open item by an external reviewer who read the AWS content in §10
  without the ADR in front of them, which is exactly the misreading this closes.
- The AI provider switches stay in the code and the CI matrix, so a provider change is a
  configuration + change-control action, not a rebuild.
- Cross-border transfer analysis is required **only** if a future support/telemetry
  path leaves India; this ADR assumes none does.

## Review

Re-open this ADR on any of: a change of primary cloud or region; introduction of a
non-India model, support or telemetry path; or a Unilever Cloud/Cyber determination that
directs a different pattern.
