# Contextual editing and focused approvals

This branch extends the continuous-agreement release without replacing existing services. It is not a declaration that the complete negotiation milestone is finished or deployed.

## Implemented in this source iteration

- Direct agreement editing loads the current saved source, checks its SHA-256 and retains the agreement and request context.
- Native template drafts retain clause structure. Supported Word and UTF-8 text uploads open as paragraph editing copies; Word tracked insertions/deletions can be compared and restored before saving. Files with tables, referenced content or embedded objects continue through Word exchange to avoid silently losing content.
- Clause insertion, deletion, ordering, undo/redo, library insertion, internal comments and controlled AI rewrite proposals live in the agreement workspace. AI is advisory and requires an actually configured provider.
- Saved documents receive separate immutable version records with author, source, reason, timestamp, stage, hash and clause differences. Older source files remain preserved. Legacy provenance is explicitly labelled as unrecorded.
- Stale document/revision writes fail. The UI retains unsaved work and provides comparison with the current source before reconciliation.
- Reopening an agreed or approved form records the previous approval evidence, invalidates current approval indexes and requires a newly saved document and fresh review. Active signing packages and executed records remain locked.
- An executed agreement can start an idempotent linked amendment lifecycle. The parent document is unchanged.
- Approvers have a separate landing page, assigned approval cards and a scoped document download. They no longer have generic contract, repository, reporting or drafting access. Notifications deep-link to their approval cards.

## Validation and remaining gates

Local typecheck and production build pass. The document import/comparison tests and direct API role-isolation checks pass. The new real-PostgreSQL editing, amendment and approval tests must also pass in Concord CI before release.

The existing Railway API still needs a verified document backup and persistent storage before redeployment. A successful compile is not evidence of a deployed visual pass. Exact laptop/phone viewport validation, production SSO, real Outlook delivery and real signature-provider completion remain release acceptance gates.

Secure external invitations, guest sessions, the external negotiation room, externally scoped comments/redlines, agreed-form negotiation completion, automated approval policy rules and broader obligation extraction remain further work. This branch does not expose a placeholder guest login or an unprotected document-sharing URL.
