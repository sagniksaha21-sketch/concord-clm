# Continuous agreement milestone — implementation and release status

This document records the change set under review. It is not a claim that the staging deployment or the complete external-negotiation milestone has passed acceptance.

## Implemented in this change set

- Shared desktop/mobile navigation: Home, Work, Contracts, Reports, More. Notifications remain accessible from the bell; creation menus contain creation actions.
- Requestor role label and SSO role aliases, role-specific landing pages, safe agreement deep links, six-step term sheets, private supporting documents, actual legal-team selection and workload-based automatic assignment.
- Scoped business questions/replies, assignment actions, durable inbox/outbox records and audit evidence.
- One agreement workspace with request, saved drafting, contextual review, approval, signature, executed-record, obligations and version sections.
- Persisted editable template drafts and immutable Word source versions. Optimistic revision checks, assigned-counsel checks, document pinning and transactional upload/approval exclusion.
- In-app approval cards with every selected approver required. Rejected rounds can open a new revision only after preserving all previous routing, decisions, comments and document pins in a checksummed evidence snapshot.
- Execution reconciliation that promotes only a verified PDF with completed signer evidence matching the approved source. Repository authority, provisional dates, notices, stakeholder notifications and audit are committed atomically.
- Confirmation, ownership and completion controls for ongoing obligations; provisional dates cannot trigger reminders.
- Existing reports, export themes, AI provider adapters, authentication, legacy routes and specialist capabilities are retained.
- Responsive material primitives and laptop-height login adjustments. Existing brand assets, colour themes, reduced-motion and reduced-transparency support remain.

## Release gates

- Typecheck and local regression tests have passed during implementation. GitHub CI must run the actual PostgreSQL migration and database suite against the final commit.
- The live staging browser still shows the preceding navigation release. This change set has not completed live visual acceptance.
- Exact laptop and phone viewport checks remain pending. Inspection at one available mobile viewport is not evidence for the requested 360/390/412/430 matrix.
- Railway API configuration currently has local document storage and no persistent volume or object-storage configuration. Preserve existing bytes and provision durable storage before an API redeploy. The Railway infrastructure assistant returned a usage-limit error during the read-only investigation; this has not been resolved.
- Microsoft Entra/Graph and real signing/AI-provider integrations are not configured on the inspected staging service. No real Microsoft login, Outlook delivery or provider signing acceptance is claimed.

## Newly requested work not implemented by this change set

- External Negotiation Room, invitation identity verification, resource-scoped guest sessions, expiry/revocation and external-access security tests.
- Negotiation rounds, external redlines/comments, document exchange/Word tracked-change import, material comparison and agreed-form controls.
- Rich paragraph editing, tracked changes, undo/redo, inline comments, clause reorder, contextual AI rewrite and safe autosave for existing uploaded documents.
- Dedicated Approver landing experience and rules-driven approval routing.
- Amendments linked to immutable executed parent agreements.
- Comprehensive executed-document obligation extraction and negotiation analytics in reporting.

These are distinct from the initial lifecycle integration and need their own implementation and acceptance evidence. Do not mark the full milestone complete on the strength of a successful build.
