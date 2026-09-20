# Lifecycle intelligence

This release extends existing agreement services and keeps Home, Work, Contracts, Reports and More as the primary navigation.

## Approval policies

Administrators configure policies under More → Approval policies. Rules combine exact agreement types, business units, governing-law labels, risk levels, request value/currency and term-sheet flags. Matching reviewers are mandatory server-side. Unknown facts and amounts in another currency retain the approval conservatively; no currency conversion is inferred. Reviewers must hold current approval authority and cannot approve their own routing. Policy revisions are recorded with each route, while previous decisions remain unchanged. Policy changes apply to new rounds. Values come from the request term sheet and must be checked against negotiated terms by Legal.

## Commitment extraction

Verified execution queues a durable job against the authoritative archive. With selected GCP, Azure or Tesseract OCR, the job reads the signed PDF. Otherwise it uses the hash-verified approved source and labels that limitation. Suggestions carry literal source quotations and remain unconfirmed. Owners and dates must be confirmed before reminders. No date is invented from an ambiguous trigger. Failed jobs remain visible and can be retried from the agreement. Existing executed records can request extraction there too.

## Negotiation intelligence

Counterparty responses queue an internal analysis. It uses the existing AI_REVIEW_PROVIDER selection, supports GCP and Azure, validates quotation evidence and playbook citations, and preserves model and document provenance. Without a provider it reports the exact change count without fabricating risk scores. Analysis never appears in the guest response. Generated alternatives remain proposals requiring human review. Oversized or ungrounded responses fail visibly rather than being presented as complete analysis.

## Negotiation reporting

Reports include agreement-level round counts, elapsed days to agreed form, actual response-time medians and text-based recurring provision topics. Open negotiations are excluded from completion medians; missing observations remain null. Time is calendar elapsed time, not business hours or an SLA measure. Finance-style aggregation across currencies is not performed. The same snapshot feeds Excel, PDF, both editable PowerPoint themes and the optional AI narrative. Negotiation data requires contract:write permission.

## Word preservation

Imported Word paragraphs, including table-cell text, can be edited while retaining other package parts, drawings and table layout. Changed paragraphs keep their paragraph properties and first run style; intra-paragraph mixed formatting may need Word review. Anchored drawings, comments, fields and notes are protected. Paragraph insertion/deletion/reordering and structural tracked revisions in imported formatted documents require Word document exchange. Native Concord clause drafts retain their existing insertion/reordering tools.

Word text revisions are preserved until explicitly confirmed. Every save creates a new document/version. Preparing a clean external copy removes comments, custom data and document-property parts. Unknown parts, hidden runs, unresolved revisions and external document references block external preparation. Legal must review the full Word copy; the browser text view is not a page-layout renderer. The exact clean version must pass review before sharing and approval.

## Guest administration

More → Guest access shows the latest 500 invitations; each agreement retains its own participant history. Legal owners can change permissions and expiry in context. Changes invalidate guest sessions and require email verification again. Revoked invitations cannot be restored. Executed-PDF download requires an explicit grant tied to the exact authoritative archive, an active invitation, a current session and a verified checksum. Revocation removes that grant. Sharing queues a Microsoft notification only when configured.

## Deployment and configuration

Migration 20260920220000_lifecycle_intelligence is additive. No signing, authentication or provider credentials are introduced. Existing AI_REVIEW_PROVIDER, OCR_PROVIDER and Microsoft Graph configuration are reused. A working cloud account and provider credentials remain necessary for live AI, corporate SSO, email and real e-signature. Scheduled jobs use database claims to avoid duplicate processing across replicas. The release is tested through the existing CI with disposable PostgreSQL before Railway deployment.
