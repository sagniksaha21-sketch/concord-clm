# Concord brand and sign-in refinement — 10 September 2026

Baseline: `7914ee0` on GitHub `main`. This continues the broader screen and component audit in `ui-refinement-2026-09-09.md`.

## Findings and changes

| Finding | Change |
| --- | --- |
| Command Center truncates the authenticated name at the first space, so the staging account becomes “Concord” | Render the full trimmed `greetingName` supplied by the authenticated dashboard API; omit the name when absent; allow long names to wrap |
| The product name has inconsistent treatments and gets lost beside the owner branding | Shared selectable-text Concord wordmark, using the existing self-hosted display font, optical spacing, and theme-aware gold initial |
| Sidebar, mobile navigation sheet, quick actions, command palette, repository AI, and supporting copy each render the brand independently | Reuse the wordmark in authored UI copy; preserve account names, search records, native select options, metadata, and accessible labels as plain text |
| Live desktop login inherits a two-column grid despite having only one content column | Explicit single-column layout restores the original centered composition; retain Lakmē Salon, Lakmē Lever, Xcelerate, cream/black/gold colors, and the exact build credit |
| Appearance controls are unavailable before sign-in | Reuse the shell's System/Light/Dark controls and existing saved preference on the login page, with 44px controls and accessible names |
| A system-dark CSS rule overrides the owner's logo even when Light is explicitly selected | Scope the media fallback to roots without an explicit Light theme |
| Reduced motion makes the decorative watermark fully opaque | Disable its movement without changing its subtle opacity; keep the reduced-transparency removal |
| Supporting login copy is too faint; entrance layers linger | Use the existing secondary ink color for supporting text; constrain entrance transitions to 360–450ms |
| Dashboard loading/error states miss the shared accessibility treatment | Announce portfolio loading and reuse the existing error primitive |

## Boundaries

Only frontend presentation and this audit note change. API endpoints, authentication handlers, session keys, middleware, permissions, data, workflow mutations, dependencies, and Railway configuration remain as before. There is no added fixture data or account-name substitution. “Concord UAT Administrator” is an account display name; changing its actual identity is outside this UI change.

The earlier reported Audit persistence/chain failure remains unresolved and visible. This frontend pass does not certify audit completeness.

## Verification

The final implementation passed the shared package/frontend production build, including Next.js type validation, all 17 existing UX regression checks, and `git diff --check`.

## Authenticated follow-up review

The secure sign-in subsequently succeeded. The original cream/black/gold login, the full authenticated greeting, and the internal workspace were inspected on the live Railway URL.

The follow-up covers Command Center, intake, pipeline, AI review and contract detail/approval controls, authoring, clauses, templates, repository/search, executed-copy empty states, obligations, signature preparation, notifications, ingestion, Audit, and the command/account controls. Desktop light and dark views were inspected. Verified interactions include pipeline risk filtering, clause expansion, template edit/cancel, repository no-result/clear recovery, signature add/remove and stamp disclosure, and command navigation.

Additional findings addressed in this release:

- Hydrate account name and role from the existing authenticated `/auth/me` endpoint so restored cookies do not depend on localStorage identity.
- Reflow the dashboard attention table and key dates onto separate rows at intermediate widths; keep short status pills, monetary values and dates intact.
- Rank an exact command label ahead of matches in another command's description. Searching “Templates” previously selected Authoring first.
- Distinguish built-in review examples and metadata summaries from document findings using existing API provenance. Preserve every finding and legal workflow action.
- Add an executed-copy empty state in the repository and simplify notifications and signature guidance.
- Keep the failed audit verification visible, with technical diagnostic details under an accessible disclosure. Remove unconditional claims of audit completeness and archive immutability from general UI copy.
- Call the existing keyword-based intake classification “Guided triage.” No classification or business logic changes.

Remaining verification limits and findings:

- The browser exposes no viewport resize or preference-emulation capability. Exact 360px, 390px, 430px and tablet visual checks, and emulated reduced-motion/transparency checks, remain pending. Responsive source review and the UX gate are not substitutes for device screenshots.
- The staging Audit screen explicitly reports failed persistence and an unverifiable/incomplete chain. Its diagnostic cites Prisma raw-query deserialization of PostgreSQL `void`. No backend/audit fix is included in this frontend release.
- Staging reports degraded local-disk storage, sample pipeline records and a built-in contract review. These are not production integration acceptance evidence.
- Notification and signing histories are empty. No approval email, reminder or signing envelope was sent as part of UI inspection; no legal record was edited.
- Fresh full login submission after the final deployment remains a separate acceptance check; the signed-in session and public login appearance are rechecked after deployment.

The final source build/type validation and all 17 existing UX checks pass. Deployment success and the resulting live screen checks are reported with the released commit. No authentication handlers, cookies, API rewrites, RBAC rules, dependencies, database data or Railway source settings were changed.
