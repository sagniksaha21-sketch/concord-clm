# Concord UI refinement — 9 September 2026

Baseline: `6173401` on `main`. Target: the existing Railway web service and the existing Next.js application.

## Live audit

The authenticated staging product was inspected before implementation. The audit covered Command Center, Intake, Contracts, the review queue and contract detail, approvals, Authoring, Templates and clauses, Repository and AI search, Obligations, E-signature and Archive, Audit, Ingest, Notifications, login, the command palette and account appearance controls.

| Area | Observed issue | Refinement |
| --- | --- | --- |
| Shared shell | Header controls crowded page titles; small labels; surfaces had similar visual weight | Compact floating chrome, readable navigation, separate panel and reading materials, consolidated semantic tokens |
| Motion | Multiple entrance animations obscured newly loaded content; static panels reacted like buttons | One route entrance, selective hover elevation, restrained press feedback, deterministic reduced-motion counters |
| Contracts | An unbounded warning SVG occupied most of the screen | Intrinsic icon dimensions; compact warning; clearer lanes and record cards |
| Dashboard | Weak type hierarchy and uniformly glassy panels | Portfolio heading, readable metric hierarchy, contextual status accents and quieter working panels |
| Review and approvals | Dense document and findings; section selection did not follow navigation; redline action buttons had no handlers | Reading material, section navigation state, readable comparisons; actionable copy control alongside suggested-action guidance |
| Authoring and templates | Sparse draft and loading states; native confirm prompt; weak field hierarchy | Shared loading/error/empty primitives, labelled controls, clause accordions, keyboard-accessible native confirmation dialog |
| Repository and Audit | Loading could look like an empty result; older requests could overwrite newer results | Distinct pending/error/empty states, stale-response guards, filter reset, readable results and contract drill-down |
| Notifications, Intake, E-signature | Small feedback and empty states | Shared loading and empty treatments; consistent form, signature and archive surfaces |
| Tables | Desktop-only row presentation | Labelled record cards at small widths across seven tables, retaining table roles and header semantics |
| Account and command palette | Dense menus and incomplete dismissal/focus behavior | Larger controls, outside/Escape dismissal, palette focus return and background scroll lock, native button keyboard behavior |
| Login | Oversized marketing headline competed with sign-in | Balanced hierarchy, quieter proof content, stronger form material and readable supporting copy |

## Implementation boundaries

- The API client, rewrites, middleware, session handling, RBAC, backend, database schema, dependencies and Railway service configuration are unchanged.
- Data continues to come from the existing APIs. Existing illustrative-data notices remain visible.
- Approval, intake, signature, stamping, archive, notification and reminder mutations retain their existing handlers and endpoints.
- The previously inert redline buttons did not implement acceptance or contract mutation. The new copy control copies suggested text; it does not mark a deviation accepted or modify a legal record.
- No credentials, tokens or environment values were added.
- No historical ZIP extraction or alternative hosting architecture was introduced.

## Validation

- Node 22 and the repository's pinned pnpm 9.7.0; frozen-lockfile install without dependency changes.
- Frontend production build, including shared package build and Next.js TypeScript validation: passed.
- Frontend standalone typecheck: passed.
- Existing `scripts/check-ux.js` gate: 17/17 passed.
- `git diff --check`: passed.
- Railway successfully deployed `95be012` from current GitHub `main` (deployment `f143f817-c511-409b-93ea-202744b091d9`). The existing authenticated session continued to work after reload.
- Post-deployment desktop screenshots covered the command center, contract pipeline, contract review and approval navigation, intake, authoring, templates, repository, obligations, e-signature and archive, notifications, audit and ingestion.
- Verified risk filtering and contract drill-down, section selection, template edit/cancel and confirmation dismissal (without deletion), repository no-results/clear behavior, and signatory addition/removal and stamp-field visibility (without sending).
- Live inspection identified and prompted follow-up fixes for metric height alignment, a sidebar overflow strip, legacy card typography, the review/approval column layout, a literal newline in the approval placeholder, and command-palette keyboard order and focus visibility.

### Responsive and accessibility scope

The implementation includes layouts for 360px, 390px, 430px, tablet and desktop through shared breakpoints. Small screens use vertically arranged contract lanes, stacked forms, labelled table records, floating navigation and bottom sheets. Touch targets, safe-area padding, focus visibility, reduced motion, reduced transparency and forced colors are accounted for.

The available authenticated browser does not expose viewport resizing or media emulation. Exact-width visual verification at 360/390/430px and tablet widths, and emulated reduced-preference behavior, remain unverified. Source inspection is not a substitute for these browser checks.

### Existing staging observations

The product reports illustrative records on some portfolio screens and degraded local-disk storage. Those pre-existing environment/data indicators are preserved and are outside this frontend pass. Browser workflow QA is read-only: it does not send signature invitations, approve contracts, delete templates, create intake requests or send reminders.

The live Audit screen also reports failed audit persistence and an unverified chain: Prisma cannot deserialize a `void` result from a raw query. This backend problem is unresolved by the frontend refinement. The audit failure remains visible; the application must not be represented as having a verified, complete audit trail. Backend implementation and database configuration were not modified in this pass.
