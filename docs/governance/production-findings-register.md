# Production findings register

Live register of defects found by adversarial review, with status. **This is the
convergence mechanism**: every new finding — from any reviewer, internal or
external — is added here, and anything mechanically checkable becomes a check in
`pnpm verify`. The build is shippable when the CRITICAL/HIGH column is clear and
`pnpm verify` is green.

Sources so far:

1. External architecture assessment (findings C1, C2, H1–H5) — closed.
2. External production-release review (8 P0 blockers) — closed.
3. **Internal adversarial security review** — 30 findings — closed.
4. **Internal adversarial correctness/ops review** — 39 findings — closed.
5. **Internal adversarial review of the fixes for 3 and 4** — 24 findings — closed.
6. **Internal adversarial review of the UI/API workspace round** — 19 findings — closed.
7. **Brand + motion round** — 2 further HIGHs, both hidden by an unrelated failure — closed.
8. **External production exit-condition review** — 16 conditions; 4 repository items closed, 1 further HIGH found while auditing a fifth.
9. **Telemetry + coverage round** — exit condition 6 closed; the checker's own blind spot closed.

Reviews 3–6 were run by us, with code execution, *before* sending anything out.
They found materially more than the external reviews, including a critical
vulnerability the external reviews missed entirely.

Reviews 5 and 6 are the ones that matter most for confidence in this process.
Each was pointed at the *fixes* from the round before it, and each found
CRITICAL defects those fixes had introduced — four in review 5, one in review 6 —
plus tests that passed for the wrong reason. Fixes are code, and code has bugs; a
remediation round that is not itself reviewed is half a round.

Review 6 also produced the sharpest lesson in the register. The assertion that
would have caught its CRITICAL (`not.toContain('MEL-ENV')`) *had been written* —
but against `/api/search`, where no role ever receives an envelope id, so it
could never fail; and never against `/api/notifications`, where every role did.
A test placed where it cannot fail is worse than no test: it purchases
confidence without providing any. Every gating test added in this round is now
**mutation-tested** — the guard is deleted, the suite is run, and the specific
test that must fail is recorded next to the finding.

**Status: no CRITICAL or HIGH finding is open.** `pnpm verify` is **12/12 green**
with a database attached (141 tests across 18 suites), and the browser journey is
green.

---

## Closed — verified by execution

### Security review (3)

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| S-C1 | **CRITICAL** | **Unauthenticated execution forgery.** `verifyWebhook` returned `true` when no secret was configured, and `POST /esign/webhook` is public. A read-only *viewer* could read envelope IDs, then an unauthenticated caller forged `completed` — producing a SHA-256-sealed "Certificate of Execution" for a contract nobody signed. | Exploit reproduced end-to-end, then re-run after the fix: viewer→403, forge→401, archive clean, rejection audited. Regression tests in `webhook-auth.spec.ts` + `app.e2e-spec.ts`. Re-confirmed live this round. |
| S-C2 | **CRITICAL** | Approval callback accepted unauthenticated decisions whenever `NODE_ENV !== 'production'`, and a forged decision consumed the one-shot claim, locking out the real approver. | Token verification and approver authorization are unconditional. The flag is removed, not defaulted on; production refuses to start if a stale config sets it to `false`. |
| S-C3 | **CRITICAL** | Stored XSS: the execution certificate interpolated contract/signatory text into HTML with no escaping and was served `inline; text/html` from the API origin, where the session cookie lives. | `esc()` applied to all untrusted interpolations; both download paths now `attachment` + `application/octet-stream`. |
| S-H4 | HIGH | Filename aliasing replaced **real** uploaded contracts whose name contained `msa`/`lease`/`dpa`/`payroll` with hardcoded sample extraction data — silent data fabrication in a system of record. | Gated behind `DEMO_SAMPLES` (off by default; a hard boot error in production). Now also asserted by `pnpm verify`. |
| S-H5 | HIGH | Degraded-mode detection used the wrong env vars: a correctly configured Graph reported "degraded" while a half-configured one reported healthy. Readiness returned 200 with the database down. | Predicates mirror the services; readiness 503s when `DATABASE_URL` is set but unreachable — and now also when the audit trail is degraded. |
| S-H6 | HIGH | Rate limiter keyed on client-supplied `X-Forwarded-For` (spoofable per request) and `clear()`ed the whole map, handing every client a fresh budget. | `trust proxy` + `req.ip`; bounded eviction; separate stricter login budget. |
| S-H7 | HIGH | Upload endpoint buffered up to 200 × 25 MB ≈ **5 GB** in memory per request. | Capped at 20 files with explicit multer field limits. |
| S-M2 | MEDIUM | `normalizeRole` substring match made any IdP group containing "admin" a full platform admin. | Exact-match map; `admin` unreachable by substring; asserted in `pnpm verify`. |

### Correctness / operations review (4)

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| C-D1 | **CRITICAL** | **Audit events silently lost under autoscale.** `seq` is `UNIQUE` in the database but was allocated from a per-process cache. With 2+ replicas (infra autoscales 1→5) the second replica's insert violates the constraint, is caught and logged, and the business action still succeeds. | Allocation and insertion now happen in ONE transaction under `pg_advisory_xact_lock`. Proven on Postgres 16 with 24 concurrent connections: **24/24 events persisted, 0 unique violations, seq 1–24 contiguous, hash chain links intact**. Counter-proof without the lock: **12 of 24 events lost**. Unit coverage in `audit-concurrency.spec.ts` (two service instances = two replicas, against a fake enforcing the same UNIQUE + lock semantics). |
| C-D7 | **CRITICAL** | **Nobody could approve anything via SSO.** `EntraService` never returned a role claim, so every SSO user became `counsel`, which correctly lacks `approve`. No role-management endpoint existed, so approvers could only be created by direct SQL. | Entra `roles`/`groups`/`wids` claims are read and mapped (`ENTRA_ROLE_MAP` for opaque group GUIDs). Multiple claims resolve to an exact permission fit where one exists, and otherwise to the widest role actually claimed **plus a warning naming what is missing** — never to a role granting permissions no claim carried (see R-10, which caught the first attempt doing exactly that). `admin` only on an exact claim; unknown → `viewer`. `ADMIN_BOOTSTRAP_EMAILS` creates the first admin from configuration. New admin-only `GET /api/auth/users`, `GET /api/auth/roles`, `PATCH /api/auth/users/:email/role`, all audited. Verified live: lead→403, admin→200, approver assigned, invalid role→400. `sso-roles.spec.ts`. |
| C-D6 | HIGH | Approver lockout: `routedApprovers` was a per-process `Map`. Any restart, deploy or a callback landing on another replica → the legitimate approver gets 403. | `ApprovalRouting` table with an explicit `expiresAt`. `approval-durability.spec.ts`. |
| C-D16 | HIGH | E-sign writes fell back to an in-memory store that is **never read** when the DB write fails — silent data loss reported as success. | Fallback removed; failures are raised. The record is written **before** signing emails are sent. Asserted by a source invariant so the pattern cannot return. `esign-concurrency.spec.ts`. |
| C-D15 | HIGH | Lost updates: read-modify-write of the whole signature row with no version/optimistic concurrency; two concurrent webhooks erase each other's signature events. | `version` column + `updateMany … WHERE version = ?`, re-read-and-reapply on conflict. Test drives two signers' webhooks concurrently: both signatures and both audit entries survive, completion derived correctly. Confirmed on real Postgres — a stale writer affects 0 rows and the newer state is preserved. |
| C-D21 | HIGH | Obligations computed from static mock arrays, not real data; `remind` 404'd on every signature-derived row; the daily digest to `legal@lakmelever.com` was built from fictional data. | Composed from live sources (e-sign store + extracted document expiry dates); `getById` resolves against the same composition. Verified live: `POST /api/obligations/OBL-SIG-2026-014/remind` → **201** (was 404). Samples appear only without a database or with `DEMO_SAMPLES=true`. `obligations.spec.ts`. |
| C-D22 | HIGH | `IntakeService.nextId()` derived a primary key from `count() + 1` — concurrent intake creation collides. | Postgres sequence created by migration, seeded from the highest numeric suffix in use (see R-8 — the first attempt seeded from `COUNT(*)` and still collided). Verified on real Postgres: empty database → `INT-2026-001/002/003`; 7 intakes with 2 deleted → `008/009` rather than colliding at `006`; re-running the migration does not rewind. |
| C-D30 | HIGH | Untimed remote calls in `onModuleInit` can hang boot indefinitely (no `AbortSignal` on any outbound fetch). | All 14 outbound calls go through `fetchWithTimeout`; start-up index build bounded and non-fatal; the browser client is bounded too. The deadline stays armed until the response BODY is read, not just the headers (see R-20). `outbound-timeout.spec.ts` proves an abort against a server that accepts and never responds. A source invariant fails the build on any bare `fetch(`, on property access, and on aliasing — proven with a negative control. |
| C-D5 | HIGH | `GET /api/audit` loaded the entire audit table into memory on every call while `ai.review` writes a row per page view. | Filtering and paging pushed into the query; `limit` capped at 1000, with `offset` and `total`. Export and verify stream in pages. Verified live: `?limit=999999` → `limit=1000`. |
| C-D2/D3/D4 | MED–HIGH | Audit chain-tip edge cases: a failed tip load restarts the sequence; the RAM mirror can diverge from the DB; `persistDegraded` never surfaced on readiness. | The tip is read inside each append's transaction, so there is no cached tip to restart or diverge. Boot probe no longer caches. `degraded` now fails `/api/health/ready` with the reason. Restart-continuity test included. |
| C-D26 | MED–HIGH | `sendEmail` never throws, so approval routing was audited as successful even when Graph was down and the approver received nothing. | Routing checks the delivery status, audits `approval.route_failed` and returns 503 rather than recording a routing nobody received. Nudges only record a reminder that was actually delivered, so a failed nudge is retried next sweep. |
| C-D8 | MEDIUM | The approval claim was consumed before the decision was durable; a crash between claim and audit permanently lost the decision. | The decision row **is** the claim — one atomic insert on a primary key. A replay returns the stored decision and decider. Verified on Postgres: 20 concurrent decisions → exactly 1 row. |
| C-D33 | MEDIUM | Three tables created by runtime DDL outside migrations (`job_claim`, `digest_run`, `kb_chunk`), invisible to drift checking and never pruned. | `job_claim` and `digest_run` are now Prisma models in a versioned migration, drift-checked, with a nightly prune (`JOB_CLAIM_RETENTION_DAYS`). `kb_chunk` stays runtime-created — its type is `vector(EMBEDDINGS_DIM)`, set by configuration — but a dimension mismatch is now detected and reported rather than failing every insert, and `ALLOW_VECTOR_DDL=false` forbids it. A source invariant blocks any new runtime DDL. |
| C-D36 | HIGH | `docker compose up --build` could not start: `corepack` was missing from the runtime image, so the migrate job failed with `pnpm: not found`. | Added to the `run` stage. |
| C-D31 | HIGH | No graceful shutdown — SIGTERM killed the process with in-flight requests. | `enableShutdownHooks()` + SIGTERM/SIGINT drain + fatal boot handler. |
| C-D17 | HIGH | An executed document could be permanently lost while being recorded as archived (storage failure left `storageKey: ''` but still wrote the archive row and an `esign.executed` audit event). | Archive aborts and retries instead of recording a false seal. Regression test included. |
| C-D18 | HIGH | Demo samples were archived at boot into the **real** archive/storage/audit trail, leaking a new certificate file on every restart. | Seeding gated; sample archiving off by default. |
| C-D20 | HIGH | `POST /esign/:id/advance` drove any envelope to executed — forging execution with no signature — and was live in production. | Refused in production. |
| C-D14 | HIGH | E-sign state machine had no monotonicity guard: a late `viewed`/`declined` callback regressed an **executed** agreement. | Monotonic transitions; terminal states are final. Preserved through the concurrency rework. |
| C-D19 | HIGH | `signed` webhooks never updated per-signer state, so nudges chased people who had signed and certificates carried no signing timestamps. | Per-signer marking with timestamps; completion derived from signatories. |
| C-D37/38 | MEDIUM | `.env.example` omitted load-bearing settings; several docs described removed behaviour. | Audited mechanically: **53** settings were undocumented (not the ~15 first estimated). All **108** are now documented, and `pnpm verify` fails if a new one is added without an entry. `ACTIONABLE_ENFORCE_TOKEN` references removed from the docs and compose. |

### Regressions I introduced fixing reviews 3 and 4, caught by review 5

Every one of these was created by a fix in this round. They are listed in full
rather than folded into the items above, because the rate at which a remediation
round introduces its own defects is the thing worth knowing.

| ID | Severity | Finding | Fix |
|---|---|---|---|
| R-5 | **CRITICAL** | Making audit writes throw in strict mode turned one remaining floating `void this.audit.record(...)` into a process-killer: Node 22 exits on an unhandled rejection, and the trigger was attacker-supplied text inside an uploaded file. | That call awaited with an explicit catch; a process-wide `unhandledRejection` handler added so no future missed `.catch()` can take the API down. |
| R-6 | **CRITICAL** | The e-sign webhook claimed its idempotency key *before* doing the work. A failure afterwards (storage down, strict-mode audit failure) left the key consumed — the provider's retry answered "already processed" and the event was lost for good. Two live triggers, both reachable. | `JobsService.releaseClaim` / `runOnce`; the webhook releases on every failure path. The archive's audit write no longer propagates, since the archive itself is already durable. Verified live: first delivery applies, exact replay dedupes. |
| R-7 | **CRITICAL** | `verify()` attested **"Chain intact"** against a truncated or tail-deleted audit table. The hash chain proves the events that remain are unaltered; it cannot see deletion, which is the most obvious attack on an evidentiary log. | New `AuditAnchor` high-water mark, written in the same transaction as each append. Verified on Postgres: deleting the last 3 events and truncating the table are both detected. Also fixed the suffix anchor to key off `max(seq)` rather than the row count, which silently degraded to a full scan and then reported false tampering. |
| R-8 | **CRITICAL** | The intake sequence was seeded from `COUNT(*)`, not the highest id in use. With any deleted intake the sequence collides with existing rows and submissions 500 — the exact failure C-D22 was meant to remove. Proven by the reviewer against real Postgres. | Seeded from the maximum numeric suffix, with `is_called = false` so an empty table yields `INT-YYYY-001`. Verified: empty → 001/002/003; 7 rows with 2 deleted → 008/009; re-running the migration does not rewind. |
| R-9 | HIGH | `degraded` was set by failed **reads** as well as failed writes, and never cleared — one slow admin query would permanently fail readiness and make `verify()` unattestable for the life of the replica. | Narrowed to lost writes only, with the reasoning written down; reads log and continue. |
| R-10 | HIGH | Combining two Entra group claims granted `template:write`, `esign:admin` and `audit:read` — three permissions **neither group carried**. `audit:read` is the whole trail; `esign:admin` gates the execute-without-signature endpoint. `pnpm verify` was asserting this escalation as a requirement. | Resolution now never returns a permission no matched role held: an exact fit, otherwise the widest role actually claimed, plus a warning naming what is missing and how to grant it. The gate asserts the subset property instead. |
| R-11 | HIGH | `sendEmail` returns `dry-run` when Graph is unconfigured and never `failed`, so the new "was it delivered?" checks passed in production for mail nobody received — leaving C-D26 open under a fix that claimed to close it. | `wasDelivered()`: `sent` always counts; `dry-run` only outside production. Covered by a test that runs with `NODE_ENV=production`. |
| R-12 | HIGH | Approval routing is an upsert keyed on the contract and was written *before* the send. A failed re-route revoked the previous approvers, never emailed the new ones, and threw "Nothing was routed" — leaving the contract approvable by nobody. | The previous routing is captured and rolled back on any send failure; a first-time failure clears it entirely. |
| R-13 | HIGH | Emails were stored as Entra returned them (case preserved) but looked up lower-cased. `Priya.Sharma@…` became invisible to role assignment *and* to approver authorization — permanently unfixable from inside the app, which is the exact chicken-and-egg C-D7 was about. | One canonical form at the boundary (`normaliseEmail`). Verified live: a mixed-case PATCH returns 200. |
| R-14 | HIGH | The migration backfilled `roleSource = 'sso'`, so every approver created by hand — the only way one could exist before this round — would be demoted at their next SSO sign-in. | Existing rows backfill as `'manual'`; only new rows default to `'sso'`. |
| R-15 | HIGH | `ALTER COLUMN … TYPE TIMESTAMP(3)` on the pre-existing `timestamptz` claim tables converts using the session timezone, silently shifting every stored instant by +5:30 under the app's default `Asia/Kolkata`. | `USING (created_at AT TIME ZONE 'UTC')`. Verified: an instant stored as 00:00 UTC is still 00:00 after the migration runs under Asia/Kolkata. |
| R-16 | MEDIUM | The append retry could not distinguish "rolled back" from "committed, then the client failed", so a post-commit error wrote the same event twice — and the chain verified happily over a trail claiming a contract was approved twice. | One event id for all attempts; the retry detects its own committed row. |
| R-17 | MEDIUM | `claimDecision` caught *any* error and then read the table — a dropped connection after a successful commit would return the caller's own row and report `first: false`, telling the real approver they were too late and skipping the audit event. | Only a genuine unique violation is treated as a conflict; anything else propagates. |
| R-18 | MEDIUM | Export and verify stopped *collecting* at their caps but kept *fetching* — 20,000 queries to return 50,000 events from a large table. | `eachPage` stops when the consumer is done. |
| R-19 | MEDIUM | Obligations were read from the 500 most recent documents, silently dropping every earlier renewal date from the calendar, the digest and `remind`. Swapping a fictional list for a truncated real one is not a fix. | Full keyset-paged scan selecting only the needed columns, a short-lived cache so one request does not rescan per helper, and an explicit error if the safety valve is ever hit. |
| R-20 | MEDIUM | `fetchWithTimeout` cleared its deadline as soon as headers arrived, so a server that returned headers and then stalled the body hung the caller forever — the very failure it was written to prevent. It also discarded a caller's own `AbortSignal`. | The timer stays armed for the whole budget (unref'd); the caller's signal is chained. The response body is deliberately not touched, which would lock the stream. |
| R-21 | MEDIUM | The invariant checker caught 1 of 4 bare-`fetch` evasions and 0 of 3 env-var forms — `const env = process.env` alone hid 11 real settings. Two of its five checks matched dead strings and could never fire. | Broadened patterns (property access, aliasing, destructuring, bracket env access), DDL of every kind, both apps scanned, and the dead checks rewritten to assert current shape. Re-run immediately found 4 real gaps. |
| R-22 | MEDIUM | Tests for C-D6/C-D8 and the jobs claim ran with `{ enabled: false }` — they exercised the in-process Maps the fixes exist to replace, and **passed unchanged against the pre-fix code**. | New `durability-db-paths.spec.ts` drives the database branches: routing visible to a second replica, decision durable at claim time, claim refused rather than faked, claim released on failure. |
| R-23 | LOW | `ApprovalDecision.tokenVerified` was written by nothing and defaulted to `true` — a schema default masquerading as a recorded fact on the row that holds the legally significant decision. | Written from the actual verification result. |
| R-24 | LOW | A failed audit write turned an intended 401/403 into a 500, losing the security event and the correct status. | Denial-path audit writes carry an explicit catch. |
| R-25 | LOW | A redundant second index on `AuditEvent(seq)` — `@unique` already indexes it — was schema drift plus write cost on the hottest table. | Removed. |

### Regressions I introduced building the workspace UI, caught by review 6

The Command Center, lifecycle board, global search and notification history were
built in one round. Reviewing that round found 19 defects in it — one CRITICAL —
plus two the review did not find, which the widened invariant checker caught
afterwards. Each row names the check that now fails if the defect returns.

| ID | Severity | Finding | Fix and the check that pins it |
|---|---|---|---|
| W-1 | **CRITICAL** | `GET /api/notifications` shipped behind `@Roles('contract:read')` — the permission *every* signed-in role holds — while serving rows read straight from the audit trail, echoing each event's raw `summary`. A read-only viewer could harvest routed approver addresses, signatory addresses and provider envelope ids: the reconnaissance step of the execution-forgery chain closed as S-C1, re-opened under a new route name. Verified live: viewer/approver/counsel all got `200`. | Route carries `@Roles('audit:read')`, matching `/api/audit` itself; the service rebuilds every line from the action and entity id and never echoes the summary. Pinned by `app.e2e-spec.ts` ("does NOT expose the notification history below audit:read", asserting 403 for three roles *and* no `MEL-ENV` in the lead's own payload), by `workspace.spec.ts` ("rebuilds each line from safe fields"), and structurally by invariant 7 below. Live re-check: lead `200`, Board Counsel `403` — identical to `/api/audit`. |
| W-2 | **HIGH** | The tests that should have caught W-1 were **vacuous**. `not.toContain('MEL-ENV')` was asserted against `/api/search`, which never emits an envelope id for any role, so it passed with the gating deleted; it was never asserted against `/api/notifications`. A third test named the permission matrix without ever calling `search()`. | Rewritten so each gating test fails when its guard is removed, with a positive control (counsel *does* receive the envelope id) so "returns nothing at all" cannot pass either. **Mutation-tested**: four guards deleted one at a time, each failing exactly the named test; restored, 19/19 green. |
| W-3 | **HIGH** | Three components — `ApproveBar`, `DigestButton`, `RemindButton` — called bare `fetch()` instead of the API client, so no `Authorization` header was attached. All three routes carry a role, so **all three buttons were dead in the browser**. Not found by review 6; found by widening `check-invariants.js`, which had scanned `apps/web/app` but never `apps/web/components`. Proven live: `401` without the header, `201` with it. | Routed through `apiFetch` (`requestApproval`, `remindObligation`, `sendObligationsDigest`). The checker now scans `apps/web/components`; mutation-tested by reverting one button to a bare fetch. |
| W-4 | **HIGH** | Obligation reminders and the weekly digest sent real Outlook email and wrote **nothing to the audit trail** — the only outbound mail in Concord that did not. `NOTIFYING_ACTIONS` already listed `obligation.` and `digest.`, so the notification history had two branches that could never match: the page said "no notifications recorded" on a day the digest had emailed seven obligations to the legal mailbox. | `ObligationsService` records `obligation.reminded` and `digest.sent` with recipients and delivery status; a failed trail write is logged loudly but never fails a send that already happened. Four tests in `obligations.spec.ts`, including one pinning the action names to the prefixes the history filters on. Mutation-tested. |
| W-5 | **HIGH** | The browser journey's content assertions read `body.innerText`, which includes the sidebar. Once the sidebar listed every screen by name, the needles `intake`/`repository`/`obligation`/`signature` matched their own nav links on every page. **Demonstrated**: with `main.stage` emptied — a page rendering literally nothing — all four old needles still passed. | Scoped to `main.stage`, needles changed to page-specific copy, four new screens added, plus a check that stage text is separable from the chrome. |
| W-6 | MEDIUM | The permission-filtered navigation failed **open**: `!n.needs \|\| !perms \|\| …` showed every gated link while permissions were unknown — on the first paint of every navigation, and permanently if `/api/auth/me` was down. | Fails closed; the catch and the loading state are the same state. Invariant 8 rejects the fail-open form. |
| W-7 | MEDIUM | Dashboard stats were read by array index (`stats[3]`), but the array is now role-dependent — the e-sign stat is omitted below `esign:send`. A viewer would have been told "0 carrying high playbook risk" regardless of the real count. | Looked up by key. |
| W-8 | MEDIUM | Eight pages rendered their own `<h1>` and their own `.foot`, duplicating the shell's — two `<h1>`s and two footers per page. | Converted to the shared `.view-head`/`h2` pattern; page-specific closing notes use a distinct `.page-note`. |
| W-9 | MEDIUM | `.mono-badge` and `.tnum` were used but had **no rule in the stylesheet** — the SHA-256 seal on an executed contract rendered as unstyled body text, reading as a typo rather than as evidence. | Added, along with `.page-note`. A script now diffs every class used in TSX against the stylesheet: 170 classes, 0 undefined. |
| W-10 | MEDIUM | The audit filter fired one request per keystroke, with responses able to land out of order, and did not reset paging — a filter typed on page 5 showed "no events". | Debounced with last-response-wins; paging resets on filter change. |
| W-11 | LOW | `/login` and the middleware both redirected to `/intake`, so the app had two different "homes" depending on how you arrived. | Both go to `/`. |
| W-12 | LOW | Shell effects set state with no cancellation, so a slow response from the previous route could overwrite the current one's badges. | Cancelled on unmount and on route change. |
| W-13 | LOW | The theme toggle showed a "switch to dark" moon to users already in OS dark, and stored-dark users got a white flash on every navigation. | Effective theme resolved on mount; a tiny pre-paint script in `layout.tsx` applies the stored theme before first paint. |
| W-14 | LOW | `NAV_COUNTS_CACHE_MS` was read but undocumented. | Documented in `.env.example`; the existing invariant catches this class. |
| W-15 | LOW | The notification bell linked to a route the role could not open. | Gated with the same rule as its sidebar entry. |

Also from this round, verified rather than asserted: the notification history's
action filter runs **in the database**, not after the fetch. Taking "the newest N
events of any kind" and filtering afterwards makes the page go permanently empty
once N non-notifying events accumulate after the last notification — days, not
months, since every request writes one. The symptom only appears at a data volume
a unit test will not reach, so the test asserts on the *query* instead.

### Round 7 — brand, motion, and what a blocked CDN was hiding

The visual layer was rebuilt against the approved prototype (Lakmē Salon
wordmark, Xcelerate 2026 marks, glass chrome, entrance choreography, animated
gauge). Two defects surfaced that had nothing to do with the styling.

| ID | Severity | Finding | Fix and the check that pins it |
|---|---|---|---|
| X-1 | **HIGH** | `schema.prisma` had **34 validation errors**. Every model was documented with `/** … */` block comments, which the Prisma schema language does not accept — it takes `//` and `///` only. `prisma generate` and `prisma migrate` would have failed on the first developer machine that ran them. It survived undetected because the only schema check (`check-migration-drift.py`) needs a live `DATABASE_URL` and had SKIPPED on every single run, and because the build sandbox cannot reach `binaries.prisma.sh` at all — so every Prisma command died at the engine download long before it parsed the file. **A network error was standing in front of a syntax error and hiding it.** | Comments converted to `///` (which Prisma keeps as model documentation). New gate step `scripts/check-prisma-schema.js` validates the schema with **no database and no network**: the CLI parses with a bundled WASM module, so pointing `PRISMA_SCHEMA_ENGINE_BINARY`/`PRISMA_QUERY_ENGINE_LIBRARY` at any existing path makes it skip the download. Mutation-tested by restoring one block comment. |
| X-2 | **HIGH** | The Next.js middleware matcher gated everything except `_next/*`, so `/brand/lakme-salon.png` was redirected to `/login` — and a visitor on the sign-in page has no cookie by definition. **The login screen's own logos rendered as broken-image icons.** The app's front door, wearing two placeholder glyphs. | Matcher excludes `brand/` and static image/font extensions. Verified live: brand asset `200` unauthenticated, `/audit` still `307` to login. |

Two smaller things from the same round: fonts are now **self-hosted** via
`@fontsource` rather than fetched from `fonts.googleapis.com` — an enterprise
deployment should not make a third-party request per page load, a locked-down
network may not reach that CDN, and a silent fallback to system fonts changes
how the entire product looks; and every animated figure is written so its
resting state is its correct state, so `prefers-reduced-motion` removes
decoration and never meaning. The speedometer on the Command Center is wired to
the same risk distribution the legend beside it prints — a dial that sweeps to a
position nothing computed would be a chart that lies.

### Round 8 — external exit-condition review (16 conditions)

An external reviewer produced a 16-item production exit-condition note. Twelve are
operational and correctly owned outside the repository. Four were repository items;
every one was checked against the source before acceptance, and auditing our side of
a fifth (operational) item surfaced the worst finding of the round.

| ID | Severity | Finding | Fix and the check that pins it |
|---|---|---|---|
| E-1 | **HIGH** | **Malware scanning was a stub that ignored a configured endpoint.** With `MALWARE_SCAN_URL` unset it returned `unscanned` — honest. With it *set*, it also returned `unscanned` (engine `'seam'`), having contacted nothing, logged nothing and thrown nothing. The real call was commented out. An operator setting the variable would see a clean boot and successful uploads and conclude scanning was on; it was off, and invisibly so *because the control reported itself as present*. Worse than no control, since it stops anyone looking for one. Not in the reviewer's note — found auditing their condition 5. | Scanner is actually called through `fetchWithTimeout`. Four outcomes, none silently passing: clean / infected / `unscanned+none` (absent) / `unscanned+error` (configured but failed or unparseable — never guessed clean). Two boot guards: production refuses `UPLOAD_REQUIRE_SCAN=true` with no scanner, **and** refuses a scanner whose verdict is not enforced. Eight tests, five standing a real HTTP server up — including an assertion that the scanner was *contacted*, the assertion whose absence let the stub live. Mutation-tested: restoring the seam fails four. |
| E-2 | **HIGH** | The README advertised that `docker compose up` brings up Postgres with the **"schema pushed & seeded"** — behaviour deliberately removed in the hardening round and replaced with a one-shot versioned-migration job. The README was documenting, in writing, the exact control exit condition 4 exists to prevent. An auditor reading it concludes the app reshapes the database at startup and blocks the release on evidence that already exists. It also stated "Node.js 20+" against a pinned Node 22, so a developer following it installs a runtime the gate rejects at step 1. | Corrected, plus demo credentials now explicitly marked local-only against production's Entra SSO and demo-login refusal. **Invariant 10** rejects any README claiming schema push or `db push`; **invariant 9** rejects a stated Node major that disagrees with `engines.node`. |
| E-3 | MEDIUM | `apps/web` carried `@types/node@^20` while root `engines` required `>=22 <23` and the API used `^22`. The web type-check passed regardless — Node 20's type surface is close enough that nothing errored — so it survived every gate run. Types describing a different runtime than the one shipped is silent divergence, not cosmetics. | Aligned to `^22.5.0`. **Invariant 9** compares `@types/node` in every workspace against `engines.node`. Mutation-tested. |
| E-4 | MEDIUM | **Section 2 of `Concord-Production-Readiness-Response.docx` was empty** — the heading "P0 release blockers — point by point" was followed immediately by heading 3. No paragraphs, no table. Every other numbered section had one. The blank section was the one that actually answers the eight blockers, in a document written for reliance by IT, Cyber and TPRM. | Written: a per-blocker table of what changed and the automated check holding it. A stale appendix claiming "8 suites · 38 tests" corrected to the real 17 / 137. |
| E-5 | LOW | Reviewer reported the cloud position as unresolved. **Partly refuted:** ADR-001 already records Azure/Central India as production with AWS as change-controlled DR fallback. But the ADR's own Consequences committed to updating `deployment.md`, and had not — §10 was still titled "Portability — AWS, Azure, or either" and read as co-equal options. The reviewer met that section without the ADR and drew the obvious conclusion. | §10 retitled and reframed as fallback evidence subordinate to ADR-001; the ADR's open consequence marked done. |

The reviewer's central point is the one this register exists to serve: a claim in a
document is not evidence. Our own readiness response having a blank section where the
evidence should be is the sharpest illustration of it in the bundle, and it was ours.

### Round 9 — telemetry, and the blind spot that produced round 8

Two pieces of work: closing exit condition 6, and fixing the reason four
documentation defects reached an external reviewer before they reached us.

| ID | Severity | Finding | Fix and the check that pins it |
|---|---|---|---|
| T-1 | **HIGH** | **The invariant checker had never scanned anything but source, and could not tell you so.** It walked five directories of `.ts`/`.tsx` and printed "invariants hold" — the same words whether it covered 100% of the artifact or 60%. That indistinguishability produced three separate defects: `apps/web/components` unscanned (three dead buttons), the Prisma schema check permanently SKIPPED (34 validation errors), and manifests/README/docs scanned by nothing (the four items an external reviewer found). | **Invariant 11** enumerates every shipped `.ts`/`.tsx` file and fails if any lives outside the scanned roots; new directories must be added deliberately or exempted with a reason. The success line now states its own scope. Adding it immediately found two more unscanned files: `apps/web/middleware.ts` (the file that decides which requests reach the app at all — and that had gated the login page's own logos) and `apps/api/prisma/seed.ts` (which holds the refuse-to-seed-production guard). Bringing seed.ts into scope then found `SEED_ALLOW_PROD` undocumented. Mutation-tested by removing `apps/web/components` and by adding a new directory. |
| T-2 | **MEDIUM** | Telemetry instruments were created at module load, before `sdk.start()` registered a MeterProvider. `metrics.getMeter()` returns a **NoopMeter** in that window and — unlike the traces API, which proxies and re-resolves — a counter built from it stays no-op permanently. Traces worked, the boot log said "active", and every counter read zero: indistinguishable from "nothing has failed yet". Caught by deliberately quarantining an upload and finding the counter still absent at the collector. | Instruments resolve lazily on first use. Proven end to end against a real OTLP collector: `concord.ingest.quarantined = 2` with `{scan, engine}` attributes after two quarantined uploads. |
| T-3 | — | Exit condition 6 (central monitoring) implemented. | OpenTelemetry SDK with OTLP/HTTP and Azure Monitor exporters; auto-instrumentation for HTTP, Nest and Postgres; resource attributes carrying service name, version, namespace, environment and instance. Health-probe spans deliberately excluded — they are polled every few seconds and would bury real traffic. Six operational counters chosen for what should page a human: audit-append failures, quarantined uploads, notification failures, approval-routing failures, dead-lettered jobs, executed envelopes. **Invariant 12** asserts the telemetry bootstrap is the first import in `main.ts`, because anything loaded above it is never instrumented and the service then reports no spans while appearing configured. |

**Verified against a live collector**, not asserted: 167 spans across `/api/dashboard`,
`/api/contracts`, `/api/auth/login`, `/api/obligations/digest/run` and `/api/audit`,
with 0 spans for `/api/health` as intended; and `concord.ingest.quarantined = 2` after
two quarantined uploads. With no exporter configured, the collector's payload was
byte-identical before and after five requests and a quarantine — a genuine no-op, not
a no-op exporter, because a no-op exporter looks the same in the logs as a working one.

### Regressions I introduced fixing the assessment, caught by review 4

| ID | Severity | Finding | Fix |
|---|---|---|---|
| R-1 | HIGH | My coarser idempotency key would have **silently dropped a second signer's signature** (both arrive as `signed`), and claimed the key before confirming the envelope existed. | Key includes the provider event timestamp; envelope resolved first. |
| R-2 | MEDIUM | My `normalizeRole` fix downgraded **"Contract Reviewer" → viewer** (`reviewer` contains `view`), stripping write access from a common CLM role. | Word-boundary matching; regression test, now also asserted in `pnpm verify`. |
| R-3 | MEDIUM | My `trust proxy` fix landed in `main.ts` but audit writes still recorded the forgeable `X-Forwarded-For`, so every forensic IP stayed falsifiable. | All audit writes use trusted `req.ip`. |
| R-4 | LOW | `ACTIONABLE_ENFORCE_TOKEN` became a phantom setting still promised by compose/docs. | Removed from compose and docs; production refuses to start if it is set to `false`. |

---

## Open

Nothing CRITICAL or HIGH.

| ID | Severity | Finding | Owner |
|---|---|---|---|
| C-D43 | MEDIUM | Audit appends serialize on a single cluster-wide advisory lock inside an interactive transaction, so each waiter holds a pooled connection while queued. Bounded by `AUDIT_LOCK_TIMEOUT_MS` (fail fast rather than hold), but a hash chain is inherently serial: sustained write throughput is capped by it. Raise Prisma's `connection_limit` accordingly, and revisit if append volume grows. | Eng |
| C-D44 | LOW | `kb_chunk` is created at runtime because its column type is `vector(EMBEDDINGS_DIM)`, which a static migration cannot express. Mitigated by dimension detection and `ALLOW_VECTOR_DDL=false`. | Eng |
| C-D40 | MEDIUM | The `concord_token` cookie is not `HttpOnly`, because the web client reads it to send `Authorization: Bearer` and Next's middleware reads it to gate routes. Making it HttpOnly requires moving the browser to same-origin, credentialed requests — a front-end change, deliberately not bundled into this round rather than shipped half-done. | Eng |
| C-D41 | LOW | `AUDIT_STRICT` makes a failed durable write throw to the *caller*, but the interceptor's baseline event is recorded after the handler has run, so a strict failure there cannot un-do the mutation — it marks the replica degraded and fails readiness instead. Recording inside the business transaction would close the remaining window. | Eng |

**Owned outside the repo** (unchanged): independent penetration test,
backup/restore and DR drills, the GitHub `production` environment reviewer list,
and Key Vault / managed-identity provisioning.

---

## Definition of done

`pnpm verify` — **12/12 green** with `DATABASE_URL` set:

| Check | What it protects |
|---|---|
| Node.js runtime is 22 | Azure SDK dependencies |
| Shared package builds | — |
| All packages typecheck | — |
| Automated test suite | 141 tests, 18 suites |
| **Source invariants hold** | no bare `fetch(` *(now including `apps/web/components`, where it found three dead buttons)*, no runtime DDL, no undocumented setting, no silent fallback after a failed durable write, no SSO role fallback that strips approval, **no route serving audit data below `audit:read`**, **no fail-open permission filter in the navigation**, **@types/node matching the pinned runtime**, **no README claim of removed behaviour**, **no source outside the scanned roots**, **telemetry first in main.ts** |
| API builds / Web builds | — |
| **Prisma schema is valid** | the schema parses at all — no database, no network (X-1) |
| **Migration matches schema.prisma** | 13 models / 109 columns, against a real database |
| Production refuses a placeholder secret | secret hygiene |
| **Production refuses demo fixtures** | fabricated extraction data reaching a real portfolio |
| **SSO claims never resolve to more than was claimed** | privilege escalation by claim-combination, and the reviewer-downgrade regression |

Plus `scripts/e2e-journey.mjs` for the browser journey — green, 15 checks:
sign-in and **eight** screens, each asserted against `main.stage` rather than the
whole body, no page errors, no 5xx. It also asserts that the web server is
serving the build on disk: rebuilding under a running `next start` produces empty
screens that look exactly like a product regression and are not one. (That trap
was hit twice more during this round; the guard caught it both times.)

### Two things this table cannot check

- **Mutation testing is manual.** Every security-relevant test added in round 6
  was verified by deleting its guard and confirming the named test fails. That
  discipline is not automated, and a future test can still be written where it
  cannot fail. The register records the mutation next to each finding so the
  claim is auditable rather than asserted.
- **Prisma's engine CDN is blocked in the build sandbox** (`binaries.prisma.sh`
  returns 403), so `prisma generate` cannot run there and the demo instance falls
  back to in-memory stores — which the readiness probe reports honestly as
  `persistence: in-memory`, `database: unreachable`. The database-dependent
  proofs (audit-chain serialization under concurrent writers, deletion detection
  via the anchor, intake sequence recovery) were run against a real Postgres 16
  through `psql` and a standalone driver, not through Prisma. The `pnpm verify`
  migration check is skipped for the same reason and must be run against staging
  before go-live.

Every check above was added because something was found. When the next finding
lands, it goes in this register and, if it can be checked mechanically, it
becomes a row in this table.
