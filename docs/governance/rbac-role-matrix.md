# RBAC role & permission matrix

**Closes / evidences:** assessment finding **C1 — Production authorization / RBAC**, and the
"Role and permission matrix", "API-enforced RBAC" and "Document-level authorization"
checklist items.

**Implementation:** `packages/shared/src/roles.ts` (canonical roles + permission matrix),
`apps/api/src/auth/roles.guard.ts` (server-side enforcement), `apps/api/src/auth/rbac.ts`
(`@Roles` / `@Public` decorators). Enforced globally via `APP_GUARD` in
`apps/api/src/auth/auth.module.ts`.

---

## Canonical roles

Concord normalizes any Entra app-role or group name to one of five canonical roles
(`normalizeRole()`), so identity naming and the permission model stay decoupled.

| Canonical role | Label | Intended holder |
|---|---|---|
| `admin` | Administrator | Platform/IT administrator; break-glass |
| `lead` | Legal Lead | Head of Legal / product owner (e.g. Lead – Legal) |
| `counsel` | Counsel | Practising lawyers drafting & negotiating |
| `approver` | Approver | Business approvers who sign off, not draft |
| `viewer` | Viewer | Read-only stakeholders |

## Permission matrix

Each route declares the permission(s) it requires with `@Roles(...)`; `RolesGuard`
denies (403) unless the caller's normalized role holds **all** of them.

| Permission | admin | lead | counsel | approver | viewer |
|---|:--:|:--:|:--:|:--:|:--:|
| `contract:read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `contract:write` | ✅ | ✅ | ✅ | — | — |
| `template:write` | ✅ | ✅ | — | — | — |
| `intake:write` | ✅ | ✅ | ✅ | — | — |
| `ingest:write` | ✅ | ✅ | ✅ | — | — |
| `approve` | ✅ | ✅ | — | ✅ | — |
| `esign:send` | ✅ | ✅ | ✅ | — | — |
| `esign:admin` | ✅ | ✅ | — | — | — |
| `audit:read` | ✅ | ✅ | — | — | — |
| `admin` | ✅ | — | — | — | — |

### Segregation of duties

- **Counsel drafts but cannot approve** — `approve` is held only by `approver`, `lead`,
  `admin`. A drafter cannot self-approve.
- **Approver approves but cannot draft or send for signature** — no `contract:write`,
  `esign:send`, or `template:write`.
- **Audit is privileged** — only `lead` and `admin` hold `audit:read`; the audit trail
  has no write endpoint at all.
- **`admin`** is platform administration (break-glass), kept separate from the legal
  approval authority carried by `lead`.

## Route enforcement (evidence)

| Route | Method | Required permission |
|---|---|---|
| `/api/authoring/templates` | POST / PUT / DELETE | `template:write` |
| `/api/authoring/draft` | POST | `contract:write` |
| `/api/intake` | POST | `intake:write` |
| `/api/ingest`, `/ingest/upload`, `/ingest/validate` | POST | `ingest:write` |
| `/api/contracts/:id/approval` | POST | `approve` |
| `/api/esign` | POST | `esign:send` |
| `/api/esign/:id/advance`, `/esign/nudge/run` | POST | `esign:admin` |
| `/api/obligations/digest/run`, `/obligations/:id/remind` | POST | `contract:write` |
| `/api/audit`, `/audit/verify`, `/audit/export` | GET | `audit:read` |
| `/api/auth/login`, `/auth/sso/*`, `/api/esign/webhook`, `.../approval/action` | — | `@Public` |

All other routes require an authenticated session (any signed-in user). Reads default to
authenticated-only; every state change is permission-gated.

## Entra mapping

Production authenticates through Entra ID SSO only (`auth/sso/callback`). The Entra app
role or group claim maps to a canonical role via `ENTRA_DEFAULT_ROLE` + `normalizeRole()`.
Recommended app roles: `Concord.Admin → admin`, `Concord.Lead → lead`,
`Concord.Counsel → counsel`, `Concord.Approver → approver`, `Concord.Viewer → viewer`.

## Negative testing (evidence)

Verified in-session against a live API instance:

- Viewer token → `POST /api/authoring/templates` → **403** (requires `template:write`).
- Counsel token → `POST /api/authoring/templates` → **403**; `POST /api/intake` → allowed.
- Lead token → `POST /api/authoring/templates` → **201**.
- Counsel/viewer token → `GET /api/audit` → **403**; lead → **200**.
- No token / bad token → **401** on every non-public route.
- Every denied attempt is recorded to the immutable audit trail as
  `access.forbidden` / `access.unauthenticated`.

## Document-level authorization

Executed documents are served only to authenticated users via `/api/esign/archive/:id/file`
(access logged), or through short-lived signed links (`/archive/:id/link` →
`/archive/:id/signed`) that expire and are HMAC-signed. See `evidence-register.md` and the
document-security controls in `deployment.md`.
