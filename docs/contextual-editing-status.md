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

## Secure counterparty negotiation added

- Legal shares an exact saved, reviewed document from the Agreement Workspace. Invitations are tied to an email, agreement and permission set, expire within 30 days and can be revoked. Preparing invitations does not imply successful delivery.
- Guests enter a separate review room through a confirmed email OTP. Codes are short-lived and single-use, attempts are persisted and limited, session tokens are random and hashed at rest, and every access rechecks invitation scope, expiry and revocation. Internal login tokens confer no guest access. Mutation Origin checks run before upload parsing.
- The external response explicitly includes only the shared document, external discussion, the participant’s own response and shared activity. Internal risk, playbook, request terms, business discussions and audit data are not returned. Word copies must first be saved through the clean editing-copy workflow before Legal may share them, preventing embedded internal Word comments from leaking.
- Browser suggestions and supported Word redlines create separate, attributed versions, comparisons, notifications and audit evidence. Earlier shared and uploaded files remain intact. Concurrent and stale submissions fail without replacing newer versions; matching retries are idempotent.
- Legal resolves changes in the same editor, saves a Legal version and explicitly shares the next round. Agreed form requires the exact final review, acceptance by all active participants and resolution of comments and business questions. It freezes the document hash, closes external editing and carries that document into approval.
- External invitation, new-version and Legal-reply emails use a leased outbox. Uncertain provider acceptance is surfaced instead of blindly retried. No verification code activates for a dry-run or unconfirmed email. Legal-reply email is grouped once per shared round; the full discussion updates within the room.
- Guest session expiry and stale shared versions retain unsaved suggestions in the tab and provide reauthentication and explicit comparison before continuing.

## Validation and remaining gates

Local typecheck and production build pass. The document import/comparison tests and direct API role-isolation checks pass. The editing, amendment and approval PostgreSQL tests passed in CI run 34804275630. The subsequent guest-negotiation database tests are release gates for this newer revision.

The existing Railway API still needs a verified document backup and persistent storage before redeployment. A successful compile is not evidence of a deployed visual pass. Exact laptop/phone viewport validation, production SSO, real Outlook delivery and real signature-provider completion remain release acceptance gates.

Remaining product work includes configurable automatic approval-policy routing, broader evidence-grounded obligation extraction, negotiation-specific AI round summaries and reporting dimensions, rich Word fidelity (tables, drawings, headers/footnotes), guest access administration beyond the agreement, and optional executed-copy sharing. The editor is a controlled clause/paragraph editor; it does not claim full Microsoft Word fidelity or multi-user live coediting. Unsupported Word content is rejected explicitly rather than silently removed.

No real email, SSO or signing credentials were used for these tests; provider responses are substituted only in the isolated test suite. Secure invitations and OTP delivery require Microsoft Graph to be configured before the external journey is usable. Staging deployment remains blocked until existing upload files have been backed up and durable storage is verified. The Railway agent still reports its usage limit when asked to inspect the running files.
