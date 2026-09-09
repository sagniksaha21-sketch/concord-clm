# PRA processing inventory, roles, data flow & retention schedule

**Closes / evidences:** assessment appendix **B.3 (PRA compliance gaps)** — processing
inventory, controller/processor/subprocessor allocation, data-flow, retention schedule,
data-subject rights, minimisation, automated-decision impact.

> This is a **PRA input**, not a completed Privacy Risk Assessment. The mandatory PRA and
> the privacy reviewer's disposition remain owned by Unilever Privacy/DPA. This document
> gives them a project-specific, accurate starting inventory.

---

## 1. Processing inventory

| Data category | Data subjects | Purpose | Source | Recipients | Storage |
|---|---|---|---|---|---|
| Contract content (clauses, terms, values) | Counterparties, LLPL entities | Contract lifecycle management | Uploaded / drafted docs | Legal users, approvers | PostgreSQL + Blob (India) |
| Party identifiers (PAN, GSTIN, addresses) | Counterparties, LLPL entities | Validation, KYC-style checks | Extraction from documents | Legal users | PostgreSQL (India) |
| User identity (name, email, role) | LLPL employees | Authentication, authorization, audit attribution | Entra ID | System, auditors | PostgreSQL (India) |
| Approver identity & decision | LLPL approvers | Approval workflow, evidence | Outlook action + token | Audit trail | PostgreSQL audit store |
| Signatory identity & signature events | Signatories (internal + counterparty) | E-signature, execution evidence | Melento | Audit, archive | PostgreSQL + Blob |
| Audit events (actor, action, entity, AI provenance) | All users | Legal auditability, security | System-generated | Lead/Admin only | Append-only audit store |
| Embeddings (vector representations of clauses) | Derived from contract text | Semantic search | Derived at ingest | System | pgvector (India) |
| AI prompts & outputs | Derived from contract text | Extraction, review, Q&A | Derived at processing | System, requesting user | Logs (restricted) |
| Reminder / notification metadata | Owners, signatories | Obligations & nudges | System-generated | Recipients via Outlook | PostgreSQL |

## 2. Role allocation

| Party | Role | Notes |
|---|---|---|
| LLPL / Unilever | **Controller** | Determines purposes & means of processing |
| Microsoft Azure (host) | **Processor** | Hosting, PostgreSQL, Blob, Azure OpenAI, Document Intelligence — India region |
| AWS (DR fallback) | **Processor** (contingent) | Only if DR is activated under change control |
| Melento | **Processor / subprocessor** | E-signature + e-stamp; receives signatory identity & document |
| LLPL Legal Technology | Internal operator | Support & administration |

Full subprocessor detail: `tprm-inputs.md`.

## 3. End-to-end personal-data flow (production)

1. **Ingress** — user authenticates via Entra ID (India tenant) → portal (Azure, India).
2. **Upload** — document → content-security check → Blob Storage (India), versioned.
3. **OCR/extraction** — Azure AI Document Intelligence + Azure OpenAI (India) → structured
   fields; prompts are purpose-bound and untrusted content is fenced.
4. **Index** — clause embeddings → pgvector (India).
5. **Workflow** — approval via Outlook Actionable Message; decision recorded in audit store.
6. **E-sign** — envelope + signatory identity → Melento (India) → executed copy sealed
   (SHA-256) into Blob archive.
7. **Audit** — every material action appended to the immutable audit store (India).

**No personal data leaves India in this design.** Any support/telemetry/model path that
would cross borders requires a transfer assessment before enablement (see ADR-001).

## 4. Retention schedule

Configured via `RETENTION_YEARS` (default 8) with per-category overrides at deploy.
`retentionUntil` and `legalHold` are stored on each executed record; legal hold suspends
disposal.

| Category | Retention period | Trigger | Legal hold |
|---|---|---|---|
| Executed agreements | 8 years after expiry/termination | Contract end | Suspends deletion |
| Drafts & superseded versions | 2 years after execution or abandonment | Execution / closure | Suspends deletion |
| User records | Duration of employment + 1 year | Leaver event | N/A |
| Audit logs | 8 years (immutable) | Event date | Always retained |
| Embeddings | Tied to source document lifecycle | Source deletion | Follows source |
| AI prompts/outputs | 90 days (restricted logs) unless attached to a decision | Processing date | Follows decision record |
| Backups | 35 days rolling | Backup date | Reconciled with legal hold |

Deletion, backup expiry and legal-hold reconciliation must be **tested end-to-end** at
Gate 4 (evidence in `evidence-register.md`).

## 5. Data-subject rights (DSR) operating procedure

1. **Intake** — DSR received by Legal/Privacy; logged.
2. **Search** — locate structured records (PostgreSQL) and documents (Blob) by data subject.
3. **Legal-exemption review** — assess litigation hold, legal obligation, contractual necessity.
4. **Action** — access/correction/restriction/deletion within the exemption boundary.
5. **Evidence** — record the action in the audit trail; retain response evidence.

## 6. Privacy by design & minimisation

- Extraction is **field-level**: only defined fields (dates, term, parties, PAN/GSTIN) are
  pulled; free document text is not indexed beyond what semantic search requires.
- AI prompts are **purpose-bound** and fence untrusted content; injection attempts are
  screened and routed to human review.
- Logging of prompts/outputs is **restricted** and time-boxed (90 days) unless attached to
  a decision.
- Redaction seam available for sensitive fields before AI processing where policy requires.

## 7. Automated decision-making & human oversight

Concord's AI is **advisory only** (`AiGuardrailsService.advisoryOnly`). It extracts, drafts,
flags and scores; it **never** approves, signs, executes or reaches a legal conclusion
autonomously. Every material outcome (approval, signature, execution) requires a human
actor, and the human decision — with rationale — is recorded in the immutable audit trail.
There is therefore no solely-automated decision producing legal effects; the PRA should
record this determination and the human-override model.

## 8. Transparency notices

Applicable information notices (employee, supplier, franchisee, counterparty, signatory) are
to be determined and provided by Privacy/Legal before live processing. Not yet drafted —
tracked as a PRA closure item.
