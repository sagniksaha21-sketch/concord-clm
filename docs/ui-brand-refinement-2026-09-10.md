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

The original reference screenshot and current live desktop login were inspected. The new secure browser sign-in did not complete, and its session ended; a fresh target-domain page still shows login. Internal post-deployment workflow inspection therefore remains pending. The available cloud browser does not provide viewport resizing or preference emulation: exact 360px, 390px, 430px, and tablet visual checks remain pending, as documented in the prior audit. Responsive source review is not equivalent to these visual checks.

Railway status and public login appearance are checked after publication; the actual result is reported with the delivered commit rather than presumed from compilation.
