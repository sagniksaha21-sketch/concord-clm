# Concord CLM — RC change summary

This release candidate builds on `PRODUCTION-HARDENING-CHANGELOG.md`.

## Added
- Same-origin Next.js API proxy and nonce-aware CSP.
- Cookie mutation Origin/CSRF protection.
- JWT issuer/audience/algorithm pinning.
- Azure Blob managed-identity support and provider readiness probes.
- Runtime system readiness indicator.
- Premium enterprise login, global action/account menus and mobile navigation.
- Real contract-backed AI review queue and upgraded grounded-review workspace.
- Rebuilt intake, ingestion, pipeline, repository and e-signature experiences.
- Persisted contract fixtures for non-production browser E2E only.
- Concord-specific dependency-free security preflight.
- Full CI browser E2E job with isolated Postgres.
- Staging Entra SSO E2E, security-header verification and ZAP baseline workflow.
- CodeQL/security and dual-image Trivy enforcement retained/extended.

## Removed / corrected
- Hardcoded sample AI review navigation.
- Fixture-backed contract selection in e-signature UI.
- Hardcoded named approval recipients and signatories.
- Production password-login surface.
- Production sample-ingestion route.
- Swallowed demo-mode UI errors and prototype/illustrative copy.
- Optional SBOM failure behavior.
- Client-trusted e-signature contract title.

See `RELEASE-CANDIDATE-REPORT.md` for executed gates, blocked environment checks and go-live conditions.
