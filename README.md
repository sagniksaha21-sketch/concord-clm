# Concord CLM — vertical slice

**AI Review → Outlook approval**, for the Lakmē Lever Contract Lifecycle Management concept.

This is a runnable, unified-TypeScript slice of the concept prototype: a **NestJS** API that
performs AI contract review and dispatches **Outlook notifications via Microsoft Graph**, and a
**Next.js** app that renders the AI Review workspace and lets an approver route the contract with
one click. It is the same foundation proposed for the full platform (and the Franchise Management
Portal): NestJS services + a Next.js portal + a shared types package.

> Illustrative concept for Lakmē Lever Private Limited. Sample data only — not live contracts.

---

## What the slice does

1. **AI Review** — `GET /api/contracts/:id/review` returns extracted key terms, clause findings,
   a playbook **risk score**, and suggested **redlines**. For the Zenoti MSA this is a built-in
   deterministic analysis; wire a live model with the Azure OpenAI seam (below).
2. **Outlook approval** — `POST /api/contracts/:id/approval` renders an approval email and sends it
   through **Microsoft Graph** (`/users/{sender}/sendMail`) to the named approvers. With Graph
   unconfigured it runs in **dry-run**: the exact email is logged and returned, so the flow works
   end to end with no tenant.

The Next.js `/review/[id]` page shows the document with AI-highlighted clauses, the risk gauge,
extracted terms and deviations, and an **Approve & route via Outlook** button that calls the API and
shows the result (sent / dry-run).

---

## Structure

```
concord-clm/
├─ apps/
│  ├─ api/                 NestJS API
│  │  └─ src/
│  │     ├─ contracts/     contract records
│  │     ├─ ai-review/     clause extraction, risk, redlines (Azure OpenAI seam)
│  │     ├─ workflow/      approval routing → fires the notification
│  │     ├─ auth/          login (bcrypt + JWT) + Entra ID SSO
│  │     ├─ storage/       Azure Blob / Amazon S3 originals (local-disk fallback)
│  │     ├─ documents/     download originals
│  │     ├─ intake/        request intake + AI triage (persisted)
│  │     ├─ authoring/     template storage + clause library → AI draft
│  │     ├─ repository/    lexical search + semantic Q&A (pgvector / in-memory)
│  │     ├─ embeddings/    env-switchable vectors — local (free) · ollama · bedrock · azure · openai
│  │     ├─ obligations/   key-date tracking → Outlook reminders + scheduled digest
│  │     ├─ esign/         Melento e-signature + digital stamp paper (stub → live API)
│  │     ├─ ingestion/     bulk ingest → OCR (Textract · Azure DI · BDA · Tesseract-free) → extract (Bedrock · Azure · OpenAI) → PAN/GSTIN
│  │     ├─ persistence/   Prisma / Postgres + pgvector (optional, in-memory fallback)
│  │     └─ notifications/ Microsoft Graph sendMail · Adaptive Card + JWT validation
│  │  prisma/              schema + seed
│  └─ web/                 Next.js portal (login-gated via middleware)
│     └─ app/              /login · /intake · /authoring · /templates · /ingest · /review · /repository · /obligations · /esign
├─ infra/main.bicep        Azure Container Apps + Postgres + Blob + Key Vault
├─ Dockerfile.api · Dockerfile.web · docker-compose.yml
└─ packages/shared/        types + seed data + PAN/GSTIN validators
└─ packages/
   └─ shared/              shared domain types + seed data
```

## Prerequisites

- Node.js **22** (pinned: root `engines` is `>=22 <23`, `.nvmrc` and both Dockerfiles
  agree, and `pnpm verify` fails on anything else — 20 will not work)
- **pnpm 9** (`corepack enable` then `corepack use pnpm@9`)

## Run it

```bash
pnpm install
cp .env.example .env      # optional — dry-run works without editing
pnpm dev                  # builds shared, then runs API (:4000) + web (:3000)
```

Open **http://localhost:3000** → sign in (`sagnik.saha@lakmelever.com` / `concord`) → Command
Center. From AI Review, **Approve & route via Outlook** returns the drafted email (dry-run) until
Graph is set.

> **Local development only.** The seeded accounts and that password exist so the slice runs with
> no tenant. Production authenticates through **Microsoft Entra ID SSO**, and the boot guard
> *refuses to start* if demo logins or a placeholder `AUTH_JWT_SECRET` are present with
> `NODE_ENV=production`. Nothing below marked "dry-run" or "stub" sends, signs or scans anything
> until its integration is configured — `/api/health/ready` lists every such mode at runtime.

**Full stack with Postgres (persists intake, templates, uploads):**

```bash
docker compose up --build      # api + web + Postgres
```

Schema changes are applied by a **dedicated one-shot `migrate` service** running
`prisma migrate deploy` against the versioned migrations in
`apps/api/prisma/migrations/`. The API never migrates and never seeds at startup —
that was removed deliberately, so a deploy cannot silently reshape a production
database. Seeding is gated by `SEED_ON_START` (off by default) and refuses to run
in production without `SEED_ALLOW_PROD=true` and a real `SEED_USER_PASSWORD`.

Cloud deploy (Azure Container Apps) and **resource sizing** for IT: see
`docs/deployment.md`. Persistence, auth and Actionable-Message registration are all
env-driven — see `.env.example`, `docs/actionable-message-registration.md`.

Run apps individually with `pnpm dev:api` / `pnpm dev:web`. Type-check everything with
`pnpm typecheck`; build with `pnpm build`.

---

## Wire up Outlook (Microsoft Graph)

1. In **Microsoft Entra ID → App registrations**, create an app.
2. **API permissions → Microsoft Graph → Application permissions → `Mail.Send`**, then **Grant admin
   consent**.
3. **Certificates & secrets → New client secret**.
4. Put the values in `.env`:

   ```
   AZURE_TENANT_ID=…
   AZURE_CLIENT_ID=…
   AZURE_CLIENT_SECRET=…
   GRAPH_SENDER_UPN=clm@lakmelever.com
   ```

Restart the API — approvals now send real Outlook mail. The client-credentials flow is used, so the
service sends on a schedule with no user in the loop (renewals, obligations, digests).

> To upgrade to a one-click **actionable message** (an Approve button rendered inside Outlook),
> attach an Adaptive Card and register an Actionable Email provider in Entra. The deep link in the
> current email is the graceful fallback. See `notifications/templates.ts`.

## Swap in a live AI model (Azure OpenAI)

Set `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`. `ai-review.service.ts`
then sends the contract to your deployment and expects structured `AiReview` JSON back; on any error
it falls back to the built-in analysis. Feed real document text (from the repository / OCR service)
in place of the placeholder prompt.

---

## Document intake & extraction

`POST /api/ingest` bulk-ingests agreements and returns, per document, the
**effective date, term, expiry**, each **party's name & registered address**, and
their **PAN & GSTIN** — every tax ID run through `packages/shared/validators.ts`
(PAN regex + holder-type, GSTIN format + **mod-36 checksum**, and a PAN⇄GSTIN
cross-check). Low-confidence or invalid documents come back `needs-review`.

Production pipeline: file → **OCR** (`OCR_PROVIDER`: Amazon Textract or Azure
Document Intelligence) → **structured extraction** (`EXTRACT_PROVIDER`: Amazon
Bedrock, Azure OpenAI, or OpenAI) → validators. Set `OCR_PROVIDER=textract` +
`EXTRACT_PROVIDER=bedrock` for a fully AWS-native pipeline. With those unset the
service resolves known sample filenames and scans raw text for IDs, so it runs
offline. `GET /api/ingest/samples` re-runs the six bundled agreements; the
`/ingest` page drives it.

## In-Outlook approval (Adaptive Card)

The approval email embeds an **Actionable Message Adaptive Card**, so the approver
clicks **Approve / Reject inside Outlook**. The buttons POST to
`/api/contracts/:id/approval/action`, which validates the bearer token (seam),
records the decision, and returns a refresh card with the `CARD-UPDATE-IN-BODY`
header. The HTML body is the fallback for clients that don't render actionable
messages.

To go live: register the `originator` in the **Actionable Email Developer
Dashboard** (https://aka.ms/publishoam), set `ACTIONABLE_EMAIL_ORIGINATOR` and a
public `APPROVAL_CALLBACK_URL`, and implement the JWT verification noted in
`notifications/adaptive-card.ts`.

---

## Semantic search & scheduled digest

**Repository Q&A runs on real embeddings.** At startup the API embeds a knowledge
base (one passage per contract + curated portfolio facts) and, per question,
embeds the query and retrieves the nearest passages by **cosine similarity** —
using **pgvector** when Postgres is connected (`kb_chunk` table + `ivfflat`
index) and an in-memory ranking otherwise. The `/repository` page shows the
retrieved passages, their similarity scores, and the vector store / provider in
use.

**Obligations digest.** One Outlook email of every key date due in the window,
sent on a schedule (`OBLIGATIONS_DIGEST_CRON`, default Mon 08:00, when
`OBLIGATIONS_DIGEST_ENABLED=true`) via Graph — or on demand from the **Send
weekly digest now** button / `POST /api/obligations/digest/run`.

**AI cost is a switch, not a given.** `EMBEDDINGS_PROVIDER` picks how text is
vectorised: `local` (default — deterministic, offline, **free**), `ollama`
(real vectors from a local server, **free, self-hosted**), or `bedrock` / `azure`
/ `openai` (managed, paid). An optional `CHAT_PROVIDER` writes answers from
retrieved context; unset, the top passage is returned verbatim. On AWS, set both
to `bedrock` to run all AI managed with **no GPU box**. You can also run the whole
app at **zero AI-API cost** — see `docs/deployment.md` §9, and §12 for the full
map of where AI is used across the portal.

## API reference

| Method | Route | Purpose |
|--------|-------|---------|
| `GET`  | `/api/contracts` | List sample contracts |
| `GET`  | `/api/contracts/:id` | One contract |
| `GET`  | `/api/contracts/:id/review` | AI review (terms, clauses, risk, redlines) |
| `POST` | `/api/contracts/:id/approval` | Route for approval + send Outlook notice |
| `GET`  | `/api/repository/search?q=` | Lexical filter across the repository |
| `GET`  | `/api/repository/semantic?q=&k=` | Vector search — top-k passages by cosine similarity |
| `POST` | `/api/repository/ask` | Semantic Q&A (embeddings retrieval + citations) |
| `GET`  | `/api/obligations` | Obligations & key dates |
| `GET`  | `/api/obligations/upcoming?days=90` | Upcoming key dates in a window |
| `GET`  | `/api/obligations/digest/preview?days=90` | Preview the digest email (no send) |
| `POST` | `/api/obligations/digest/run` | Send the obligations digest now (dry-run without Graph) |
| `POST` | `/api/obligations/:id/remind` | Fire an Outlook reminder via Graph |
| `GET` / `POST` | `/api/esign` | List / send a contract for e-signature (Melento) + e-stamp |
| `POST` | `/api/esign/:id/advance` | Demo: simulate the next signer step |
| `POST` | `/api/esign/nudge/run` | Auto-nudge pending signatories now (scheduled daily) |
| `GET`  | `/api/esign/archive` | Signed-document archive — executed contracts, sealed |
| `GET`  | `/api/esign/archive/:id/file` | Download an executed record (SHA-256 sealed) |
| `POST` | `/api/esign/webhook` | Melento status callback (HMAC-verified) |
| `POST` | `/api/contracts/:id/approval/action` | Outlook Adaptive Card Approve/Reject callback |
| `POST` | `/api/ingest` | Bulk ingest → extract dates, parties, PAN & GSTIN |
| `GET`  | `/api/ingest/samples` | Re-run the six bundled sample agreements |
| `POST` | `/api/ingest/validate` | Validate a PAN / GSTIN pair (checksum) |
| `POST` | `/api/ingest/upload` | Multipart upload → Document Intelligence OCR → extract |
| `GET` / `POST` | `/api/intake` | List / submit (AI-triaged) intake requests |
| `GET`  | `/api/authoring/templates` · `/clauses` | Templates & clause library |
| `POST` | `/api/authoring/draft` | Generate a draft from a template |

`POST` body:

```json
{ "approvers": ["vivek.mittal@lakmelever.com"], "note": "Approving with redlines." }
```

## How this maps to the full concept

This slice is the **AI Review** and **Outlook Notifications** modules of the prototype, made real.
The same pattern extends to Intake, Authoring, Repository and Obligations as additional NestJS
modules behind the API gateway, with the Next.js portal adding the remaining views — all on the
architecture shown in the prototype's *Architecture & Security* view (Azure, Entra ID, Zenoti/SAP
integrations, PostgreSQL + vector search).
