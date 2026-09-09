# Concord CLM — cloud deployment & sizing (for IT)

This is the guide for standing Concord up on Azure and the resources it needs to
run smoothly. It covers two paths — a single VM with Docker Compose (pilot) and
Azure Container Apps (recommended) — plus a sizing and cost model.

---

## 1. What runs where

| Component | Tech | Notes |
|-----------|------|-------|
| **Web** | Next.js | The portal (login, intake, authoring, templates, review, repository, obligations, ingest). Stateless. |
| **API** | NestJS | All services + integrations. Stateless. |
| **Database** | PostgreSQL 16 + **pgvector** | Users, intake, templates, clauses, document metadata + extractions, and the semantic-search embeddings. |
| **Object storage** | Azure Blob **or** Amazon S3 | The original agreement files (PDF/DOCX/scans). Provider chosen by env. |
| **Secrets** | Key Vault / Secrets Manager | DB URL, JWT secret, Graph + AI keys. |
| **AI (optional, consumption)** | Managed model **or self-hosted** | Extraction, drafting, embeddings. **Can run at zero API cost** — see §9. |
| **Email** | Microsoft Graph (Exchange Online) | Outlook notifications. No infra to run. |

The API and Web are **stateless** — all state is in Postgres and Blob — so both
scale horizontally.

---

## 2. Path A — Docker Compose (pilot / single VM)

Fastest way to a running stack. Good for a pilot on one VM.

```bash
docker compose up --build
```

Brings up Postgres, a one-shot **`migrate`** service (runs `prisma migrate deploy`
from versioned migrations, then seeds because `SEED_ON_START=true` locally), the
API and the Web app. Open http://localhost:3000, sign in
(`sagnik.saha@lakmelever.com` / `concord`). **VM size:** 2 vCPU / 4 GB RAM / 40 GB
disk (e.g. Azure `Standard_B2s`) handles the pilot comfortably. See §16 for the
production migration/seed controls.

---

## 3. Path B — Azure Container Apps (recommended)

```bash
# 0. Prereqs: az CLI, Docker, an Azure subscription
az group create -n rg-concord-clm -l centralindia

# 1. Container registry + images
az acr create -g rg-concord-clm -n concordclmacr --sku Basic
az acr login -n concordclmacr
docker build -f Dockerfile.api -t concordclmacr.azurecr.io/concord-api:latest .
docker build -f Dockerfile.web -t concordclmacr.azurecr.io/concord-web:latest \
  --build-arg NEXT_PUBLIC_API_BASE=https://<api-fqdn> .
docker push concordclmacr.azurecr.io/concord-api:latest
docker push concordclmacr.azurecr.io/concord-web:latest

# 2. Infra (Postgres, Blob, Key Vault, Container Apps)
az deployment group create -g rg-concord-clm -f infra/main.bicep \
  -p apiImage=concordclmacr.azurecr.io/concord-api:latest \
     webImage=concordclmacr.azurecr.io/concord-web:latest \
     pgAdminPassword=<secret> authJwtSecret=<secret>

# 3. Apply versioned migrations (controlled job — NOT db push at app start)
DATABASE_URL=<from-output> pnpm --filter @concord/api db:migrate
# Optional, gated, reviewed seed (production requires SEED_ALLOW_PROD=true + real password)
DATABASE_URL=<from-output> SEED_ALLOW_PROD=true SEED_USER_PASSWORD=<real> \
  pnpm --filter @concord/api db:seed
```

Then set the AI / Graph secrets in Key Vault and reference them from the API
container app: `AZURE_OPENAI_*`, `DOC_INTELLIGENCE_*`, `AZURE_TENANT_ID` /
`AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET`, `GRAPH_SENDER_UPN`,
`APPROVAL_CALLBACK_URL` (the API's public FQDN), `ACTIONABLE_EMAIL_ORIGINATOR`.

> Production hardening: front the web app with Entra ID SSO, put both apps behind
> Azure Front Door / WAF, and use private endpoints for Postgres and Blob.
> Approval-callback token verification is always on and has no opt-out flag.

---

## 4. Resource sizing

### Compute (the apps are light — Node services)

| Service | vCPU | Memory | Replicas | Notes |
|---------|------|--------|----------|-------|
| API | 0.5 | 1 GiB | 1 → 5 (autoscale) | ~150–250 MB idle; 1 GiB gives headroom for OCR buffers. |
| Web | 0.5 | 1 GiB | 1 → 3 | SSR + static. |

Baseline footprint is ~**1 vCPU / 2 GiB** total; scale out on request volume, not
size. A pilot for a 5–15 person legal team runs on the minimums above.

### Database — PostgreSQL Flexible Server

- **Start:** Burstable **B2s** (2 vCPU / 4 GiB), **32 GB** storage, 14-day backups.
- **Grows with:** rows (tiny) + extraction JSON + optional pgvector embeddings.

Metadata is small. Estimated DB size:

| Contracts | Metadata + extractions | + pgvector (RAG, ~50 chunks/doc) | Suggested storage |
|-----------|------------------------|----------------------------------|-------------------|
| 1,000 | ~50 MB | ~0.3 GB | 32 GB |
| 10,000 | ~0.5 GB | ~3 GB | 32–64 GB |
| 50,000 | ~2.5 GB | ~15 GB | 128 GB, move to General Purpose D2s |

### Blob storage — the actual documents

This is where most of the space goes. Rule of thumb per agreement:

- Born-digital PDF/DOCX: **1–3 MB**
- Scanned deed: **5–10 MB**
- Keep ~**3 versions** on average (drafts + executed).

| Contracts | Avg 3 MB × 3 versions | Suggested blob |
|-----------|------------------------|----------------|
| 1,000 | ~9 GB | 32 GB |
| 10,000 | ~90 GB | 128 GB |
| 50,000 | ~450 GB | 512 GB (Hot) + lifecycle to Cool |

Blob is inexpensive; enable a lifecycle rule to tier executed contracts to Cool
after 90 days.

### Container temp disk

Ephemeral only. OCR reads each upload into memory (capped at **25 MB/file**); no
persistent local disk is required — files stream to Blob.

### "How much space to run smoothly" — summary

For a realistic **10,000-contract** deployment: **~1 vCPU / 2 GiB** compute
baseline (autoscaling), a **32–64 GB** Postgres, and **~128 GB** of Blob. Even
at 50,000 contracts you are under ~**150 GB DB + ~512 GB Blob**.

---

## 5. Rough monthly cost (Azure Central India, pilot scale)

| Item | Ballpark / month |
|------|------------------|
| Container Apps (api + web, low traffic) | $30–60 |
| Postgres Flexible B2s + 32 GB | $40–70 |
| Blob (128 GB Hot) | $5–15 |
| Key Vault + Log Analytics + ACR Basic | $15–25 |
| **Infra subtotal** | **~$90–170** |
| Azure OpenAI + Document Intelligence | **consumption** — pay per page/token |
| Microsoft Graph / Exchange Online | included in M365 |

Azure OpenAI (extraction + drafting) and Document Intelligence (OCR) are the main
variable costs: Document Intelligence prebuilt-read is ~$1.50 per 1,000 pages, and
GPT-4o extraction is a few cents per contract. Budget from your expected ingest
volume.

---

## 6. Operations checklist

- **Backups:** Postgres automated backups (14 days) + Blob soft-delete/versioning.
- **Secrets:** all in Key Vault; nothing in images. Rotate `AUTH_JWT_SECRET` and
  the Entra client secret periodically.
- **Scaling:** Container Apps autoscale on concurrent requests; Postgres scale up
  a tier before you exhaust burst credits.
- **Monitoring:** Log Analytics is wired in `main.bicep`; add alerts on API 5xx
  rate and Postgres CPU/storage.
- **Data residency:** everything provisions in **Central India**; keep Azure
  OpenAI / Document Intelligence in an India region too for DPDP alignment.

---

## 7. CI/CD (GitHub Actions)

- `.github/workflows/ci.yml` — type-checks and builds every push / PR.
- `.github/workflows/deploy.yml` — on push to `main`: builds both images, pushes
  to **ACR**, and updates the **Container Apps**, authenticating to Azure with
  **OIDC** (no stored password).

Set repo **secrets** `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`
and **variables** `ACR_NAME`, `AZURE_RESOURCE_GROUP`, `API_BASE_URL`. Grant the
federated identity `AcrPush` + `Contributor` on the resource group.

## 8. Document storage & SSO

- **Originals** live in object storage, provider chosen by env in order **Azure
  Blob → Amazon S3 → local disk** (dev). Azure Blob: set
  `AZURE_STORAGE_CONNECTION_STRING` (container `documents`). Amazon S3: set
  `AWS_S3_BUCKET` (+ `AWS_REGION`; credentials from env or the instance IAM role;
  `AWS_S3_ENDPOINT` for S3-compatible stores like MinIO). Files are uploaded on
  ingest and served by `GET /api/documents/:key/file`.
- **Entra ID SSO** — set `ENTRA_TENANT_ID` / `ENTRA_CLIENT_ID` /
  `ENTRA_CLIENT_SECRET` / `ENTRA_REDIRECT_URI`. The login page then shows
  **Sign in with Microsoft** (`/api/auth/sso/login` → `/api/auth/sso/callback`).
  Register the redirect URI and grant the `openid profile email User.Read` scopes
  on the app registration. Both apps must sit behind one public domain so the
  auth cookie is shared.

## 9. Running with no AI cost

Two bills, and they behave differently. **Hosting** (compute + database + object
storage) is unavoidable on any cloud — that's the ~$90–170/month baseline in §5.
**AI is a choice.** As shipped, the app calls managed AI (Azure OpenAI, Document
Intelligence) which is consumption-billed, but every AI feature has a fallback
seam, so you can run it with **no AI API bill** in three ways:

1. **Local open-source models (recommended — real AI, no per-use bill).**
   - *Semantic search embeddings* (the new Repository feature): set
     `EMBEDDINGS_PROVIDER=ollama` and run a local **Ollama** with
     `nomic-embed-text`. Free, self-hosted, real semantic quality, CPU-friendly —
     no GPU needed. (The default `EMBEDDINGS_PROVIDER=local` is a dependency-free
     lexical embedder that costs nothing and needs nothing running — great for
     demos; Ollama is the upgrade for true semantic matching.)
   - *Drafting / Q&A generation*: set `CHAT_PROVIDER=ollama` + `CHAT_MODEL=llama3.1`
     (or Mistral/Qwen). Free of per-token cost; wants a GPU to be fast, so the
     cost **shifts from an AI bill into a somewhat larger compute instance**.
   - *OCR*: **`OCR_PROVIDER=tesseract`** (free, wired) is the self-hosted
     alternative to Document Intelligence / Textract — `pdftotext` for
     born-digital PDFs, Tesseract for scans/images (`apt-get install
     poppler-utils tesseract-ocr`), at some accuracy cost on messy scans.
2. **Deterministic mode (truly $0 AI).** Leave all AI env unset. AI Review returns
   the built-in analysis, ingestion scans text for PAN/GSTIN, and Q&A returns the
   best-matching passage. Real pipeline, no model — ideal for a pilot/demo.
3. **Managed AI (as shipped).** Best quality, least ops, pay per use — set
   `EMBEDDINGS_PROVIDER=azure|openai` and the `AZURE_OPENAI_*` keys.

The honest trade-off: you can absolutely avoid the AI **API** bill. Embeddings are
near-free on CPU; for the generative LLM you trade an API bill for compute you host
yourself. Outlook/Graph email carries **no** AI cost — it's part of your M365
licence. All of this is a per-environment env-var switch, so a pilot can run $0-AI
and production can flip to managed models without a code change.

### How developers switch AI providers

Two environment variables, no code change. Set them per environment (dev = free,
prod = managed, or any mix) and redeploy:

| Switch | Job | Values |
|--------|-----|--------|
| `EMBEDDINGS_PROVIDER` | Semantic-search vectors | `local` (free, offline, default) · `ollama` (free, self-hosted) · `bedrock` (AWS, managed) · `azure` · `openai` (managed, paid) |
| `CHAT_PROVIDER` | Writes the answer from retrieved clauses | `none`/unset (free — returns top passage) · `ollama` (free) · `bedrock` (AWS, managed) · `azure` · `openai` (managed, paid) |

Supporting vars: `EMBEDDINGS_MODEL`, `CHAT_MODEL`, `OLLAMA_BASE_URL`,
`OPENAI_API_KEY`, `AZURE_OPENAI_*`, `AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT`. The
active provider and vector store are shown in the `/repository` UI and API
response, so it's visible which one served each answer.

**Ollama vs Azure OpenAI — quality & residency.** For *embeddings*, a local Ollama
model (`nomic-embed-text`) is close to managed APIs — little quality lost. For
*answer generation*, frontier managed models (GPT-4o) are stronger than the open
models you'd self-host (Llama 3.1 8B, Mistral, Qwen), but because answers are
**retrieval-grounded** (the model summarises passages Concord retrieved, not its
own memory) a good 7–8B local model performs well on clause Q&A; the gap shows on
messy multi-clause reasoning. On data residency both are defensible for DPDP —
Ollama keeps data in your own VPC/on-prem; Azure OpenAI keeps it in your Azure
tenant/region and does not train on it (unlike a public consumer API). Switching
`EMBEDDINGS_PROVIDER` re-indexes the corpus automatically on the next start.

### Do you need to buy a GPU? No.

There are three ways to get the AI, and only one involves a GPU at all:

1. **Managed AI (no GPU, no box).** Call a hosted service and pay per token/page —
   **Amazon Bedrock** on AWS, or Azure OpenAI on Azure. Nothing to buy or run.
   This is the simplest path when Concord is hosted on that cloud.
2. **Self-hosted (a GPU, rented not bought).** Run Ollama on a **cloud GPU
   instance** (AWS `g5`/`g6`, Azure NVadsA10) — you rent it by the hour/month, you
   don't purchase hardware. Buying a physical GPU box is only worth it for
   heavy, constant, on-prem use.
3. **Free, no GPU at all.** The built-in `local` embedder + passage answers — the
   default. Real search, zero infrastructure.

So: hosting on AWS → use **Bedrock** and skip GPUs entirely (setup below). Only
choose Ollama if you specifically want models running inside your own network.

### Setting up on AWS — Amazon Bedrock (managed, no GPU)

Bedrock is AWS's built-in foundation-model service — the AWS-native equivalent of
Azure OpenAI. No GPU, no instance, no box: you enable models and pay per token.
Concord has it wired for **both** embeddings and answers.

1. In the **Amazon Bedrock console** (in your region) → *Model access* → enable
   the models you'll use: an embeddings model (**Titan Text Embeddings V2**) and a
   chat model (e.g. **Amazon Nova**, **Anthropic Claude**, Llama, or Mistral).
2. Give the app's task/instance an **IAM role** with `bedrock:InvokeModel` (and
   `bedrock:Converse`) — no keys to manage. (Or set `AWS_ACCESS_KEY_ID` /
   `AWS_SECRET_ACCESS_KEY`.)
3. Set Concord's env:
   ```bash
   EMBEDDINGS_PROVIDER=bedrock
   CHAT_PROVIDER=bedrock
   BEDROCK_REGION=ap-south-1
   BEDROCK_EMBEDDINGS_MODEL=amazon.titan-embed-text-v2:0
   BEDROCK_CHAT_MODEL=amazon.nova-lite-v1:0      # confirm the id for your region
   EMBEDDINGS_DIM=1024                            # Titan v2 native dim
   ```
   Confirm the exact model IDs in your region — some models require an
   inference-profile id (e.g. `us.amazon.nova-lite-v1:0`). Keep Bedrock in an
   India region alongside the rest for DPDP. Cost is per token/page; there is no
   fixed GPU cost.

### Setting up the free option — the Ollama box

**Ollama is free, open-source software — no subscription, no API key, no
per-token charge.** Concord ships the *client* wiring only; Ollama itself is
**not bundled and not running** until IT installs it on a server and pulls the
models. What it costs you is that server (below). If you never set it up, the app
still runs on its zero-dependency defaults (`EMBEDDINGS_PROVIDER=local` + passage
answers) — no GPU, no install.

Install & point Concord at it (once, on a Linux box with the GPU):

```bash
curl -fsSL https://ollama.com/install.sh | sh     # installs the Ollama service
ollama pull nomic-embed-text                       # embeddings model (runs on CPU)
ollama pull llama3.1                               # answer model (8B; needs a GPU)
# Concord env:
EMBEDDINGS_PROVIDER=ollama
CHAT_PROVIDER=ollama
CHAT_MODEL=llama3.1
OLLAMA_BASE_URL=http://<ollama-host>:11434
```

**GPU sizing** (4-bit / Q4 quantization — the practical default). Add ~20–30%
headroom over the model size for context + KV cache:

| Model | Role in Concord | VRAM (Q4) | GPU that fits | Approx. speed* |
|-------|-----------------|-----------|---------------|----------------|
| `nomic-embed-text` | Embeddings (search) | <1 GB | **CPU is fine** — no GPU | embeds in ms |
| Llama 3.1 **8B** / Qwen 2.5 7B | Answers (recommended) | ~5–6 GB | 8 GB (RTX 4060) → 16 GB comfortable (T4/L4) | ~30–60 tok/s |
| Mistral 7B | Answers (alt) | ~5 GB | 8 GB → 16 GB | ~30–60 tok/s |
| Qwen 2.5 **14B** | Stronger drafting | ~9 GB | 16 GB (RTX 4060 Ti 16GB / A10) | ~15–30 tok/s |
| Qwen 2.5 **32B** | Stronger reasoning | ~19 GB | 24 GB (RTX 4090 / A10 / L40S) | ~8–15 tok/s |
| Llama 3.1 **70B** | Top open quality | ~42 GB | 48 GB+ (2×RTX 4090, 1×A100/H100/L40S) | ~10–25 tok/s |

\* Approximate and hardware-dependent — treat as ballpark, not a guarantee.
Because Concord's answers are **retrieval-grounded and short** (a few sentences
from the retrieved clauses), even the 8B model feels responsive; you don't need a
70B to get good clause Q&A. Embeddings never need a GPU.

**Recommendation for a 5–15 person legal team:** one **16 GB GPU** running Llama
3.1 8B (or Qwen 2.5 7B) for answers, with `nomic-embed-text` on CPU for search.
Cloud equivalents if you don't want on-prem hardware: **Azure** NVadsA10 v5 (A10
24 GB) or an NC-series VM; **AWS** `g5.xlarge`/`g6.xlarge` (A10G/L4 24 GB). Step
up to 14B/32B only if you want stronger drafting. The box runs 24×7, so it's a
fixed monthly compute cost — the trade for having **no per-token AI bill**.

### Setting up the managed option — Azure OpenAI

**No access-request form is required** (the old waitlist was retired) — you need
an Azure subscription and permission to create resources. One-time developer
setup:

1. **Create the resource** — Azure portal → *Create a resource* → *Azure OpenAI*
   → pick subscription, resource group, region, name, Standard tier. Or CLI:
   ```bash
   az cognitiveservices account create -n concord-openai -g rg-concord-clm \
     -l eastus --kind OpenAI --sku s0 --custom-domain concord-openai --yes
   ```
2. **Deploy the models** in Azure AI Foundry (https://ai.azure.com) →
   *Deployments* → *Deploy base model*: deploy a chat model (e.g. `gpt-4o`) and an
   embedding model (e.g. `text-embedding-3-small`). Note the **deployment name**
   you give each.
3. **Grab the four values** and set Concord's env:
   ```bash
   AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com
   AZURE_OPENAI_API_KEY=<key1 from the resource's Keys page>
   AZURE_OPENAI_DEPLOYMENT=<your chat deployment name>       # e.g. gpt-4o
   AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT=<your embedding deployment name>
   AZURE_OPENAI_API_VERSION=2024-08-01-preview
   CHAT_PROVIDER=azure
   EMBEDDINGS_PROVIDER=azure
   ```
   Gotcha (already handled in code): Azure calls use the **deployment name** you
   chose, not the underlying model name. Billing is per token/page — no fixed GPU
   to run. Keep the resource in an India region alongside the rest for DPDP.

## 10. Portability — Azure is the production target; AWS is the approved fallback

> **Approved position (ADR-001).** Production runs on **Azure, Central India**.
> **AWS is the approved business-continuity fallback only** — activated under change
> control, never run active-active. This section is the portability evidence behind
> that fallback and the exit-cost answer for procurement; it is **not** a menu of
> co-equal options. See `docs/governance/ADR-001-cloud-and-residency.md`, which this
> section is subordinate to.

The app is cloud-agnostic by construction: state lives in **Postgres (+pgvector)** and
**object storage**, both of which exist on every cloud, and storage/AI sit behind
adapters chosen by env. That is what makes the fallback credible and keeps lock-in low.
Azure specifics — the ones to build — are in §3; the AWS equivalents below are what a
DR activation would map onto:

| Concern | Azure (§3) | AWS equivalent |
|---------|-----------|----------------|
| Containers | Container Apps | ECS Fargate, App Runner, or EKS |
| Database | Postgres Flexible Server | RDS for PostgreSQL or Aurora (both support `CREATE EXTENSION vector`) |
| Object storage | Blob (`AZURE_STORAGE_*`) | **S3** (`AWS_S3_BUCKET`, `AWS_REGION`) |
| Secrets | Key Vault | Secrets Manager / SSM Parameter Store |
| Managed AI (optional) | Azure OpenAI + Document Intelligence | **Amazon Bedrock** (wired — embeddings + answers) + Textract — **or** self-host per §9 to avoid it |
| Registry | ACR | ECR |
| Email | Microsoft Graph (M365) — **cloud-agnostic, unchanged** | same |
| SSO | Entra ID — **identity provider, cloud-agnostic** | same (Entra), or Cognito |

Container images (`Dockerfile.api`, `Dockerfile.web`) and `docker-compose.yml`
run unchanged on either cloud; only the managed-service wiring differs. Enable
pgvector on RDS/Aurora exactly as on Azure — `CREATE EXTENSION vector` (the app
does this automatically on start).

## 11. Semantic search & the scheduled digest

- **Semantic search** — the Repository's natural-language Q&A embeds a knowledge
  base at startup and retrieves by cosine similarity: **pgvector** when Postgres is
  connected (`kb_chunk` table, `ivfflat` cosine index), else an in-memory ranking.
  Zero-config and free by default (§9). Switching `EMBEDDINGS_PROVIDER` re-indexes
  automatically on the next start.
- **Obligations digest** — one Outlook email of every key date due in the window,
  sent on `OBLIGATIONS_DIGEST_CRON` (default Mon 08:00) when
  `OBLIGATIONS_DIGEST_ENABLED=true`. It's an in-process timer, but it is
  **multi-replica-safe**: each scheduled run is claimed atomically in Postgres
  (a `digest_run` row via `INSERT … ON CONFLICT`), so with any number of API
  replicas exactly one sends the email — no duplicates. (Without Postgres you're
  single-instance, so there's nothing to coordinate.) You can still disable it and
  drive `POST /api/obligations/digest/run` from an external scheduler (Azure Logic
  Apps, EventBridge Scheduler, cron) instead. Recipients:
  `OBLIGATIONS_DIGEST_RECIPIENTS`.

## 12. Where AI is used across Concord (the AI usage map)

AI is used in **five** places. Everything else — validation, notifications, the
digest, approvals, workflow — is deterministic code with **no** AI. Every AI spot
has a free/offline fallback, so the portal runs end-to-end even with all AI off.

| # | Portal area | What the AI does | Kind of AI | Provider options | Fallback when AI is off |
|---|-------------|------------------|-----------|------------------|-------------------------|
| 1 | **Document Intake — OCR** | Reads text from PDFs / scanned deeds | OCR | Azure DI · Amazon Textract · Amazon Bedrock Data Automation · **Tesseract (free)** — all wired via `OCR_PROVIDER` | resolves known sample files / uses supplied text |
| 2 | **Document Intake — extraction** | Pulls effective date, term, expiry, party names & addresses, **PAN & GSTIN** | LLM | Bedrock · Azure OpenAI · Ollama (free) | regex/text-scan for PAN & GSTIN + heuristics |
| 3 | **AI Review** | Clause extraction, risk score, playbook deviations, redlines | LLM | Bedrock · Azure OpenAI · Ollama (free) | built-in deterministic analysis |
| 4 | **Authoring** | Drafts a contract from a template + clause library | LLM | Bedrock · Azure OpenAI · Ollama (free) | template assembly (no AI) |
| 5a | **Repository — search** | Embeds text so questions match by meaning | Embeddings | `local` (free) · Ollama (free) · Bedrock/Titan · Azure/OpenAI | in-memory lexical embedder (free) |
| 5b | **Repository — answer** | Writes the answer from the retrieved clauses | LLM | Ollama (free) · Bedrock · Azure · OpenAI · none | returns the top passage verbatim (free) |

**Not AI** (deterministic, always free): PAN/GSTIN format + checksum validation,
intake triage rules, obligation key-date tracking, the scheduled digest &
reminders, Outlook approvals / Adaptive Cards, and all Microsoft Graph email.

The portal's AI footprint — and its entire AI bill — is controlled by **three env
choices**, no code change: `EMBEDDINGS_PROVIDER` (row 5a), `CHAT_PROVIDER` (5b) /
`EXTRACT_PROVIDER` (row 2), and `OCR_PROVIDER` (row 1). Set the model ones to
`bedrock` and OCR to `textract` to run the whole portal on AWS-native AI with no
GPU; leave them at the free defaults for a zero-AI-cost pilot.

### Fully AWS-native option (no Azure services)

Everything Azure-branded now has an AWS-native equivalent wired in, so nothing
Azure is required when hosting on AWS:

| Job | Azure service | AWS-native equivalent (wired) |
|-----|---------------|-------------------------------|
| OCR | Document Intelligence | **Amazon Textract** (`OCR_PROVIDER=textract`) |
| Field extraction | Azure OpenAI | **Amazon Bedrock** (`EXTRACT_PROVIDER=bedrock`) |
| Embeddings / answers | Azure OpenAI | **Amazon Bedrock** (Titan / Nova) |
| Email | Microsoft Graph | *unchanged — M365, cloud-agnostic* |
| SSO | Entra ID | *unchanged — identity provider, cloud-agnostic* |

For a 100% AWS ingestion pipeline set `OCR_PROVIDER=textract` +
`EXTRACT_PROVIDER=bedrock`: **Textract** OCRs the document (multi-page PDFs are
read async from S3; images/single-page use the sync API), then **Bedrock**
(Converse) pulls the structured fields — dates, parties, PAN & GSTIN — which the
deterministic validators then check. Email stays on Microsoft Graph and SSO on
Entra because those are M365/identity services, not Azure-hosting dependencies —
they work identically whichever cloud runs the app.

> **Amazon Bedrock Data Automation (BDA)** is a newer, higher-level alternative,
> now **wired** as `OCR_PROVIDER=bda`: one managed service does OCR + layout from
> a document in S3 (and, with a blueprint, structured fields), so you can A/B it
> against Textract behind the same seam. It needs the doc in S3 plus
> `BDA_PROFILE_ARN` and `BDA_OUTPUT_S3_URI` (optionally `BDA_PROJECT_ARN` /
> `BDA_BLUEPRINT_ARN`). Textract + Bedrock remains the recommended default —
> GA, battle-tested, finer control over messy Indian tax/property scans — with
> BDA there to trial as a one-service consolidation.

The free path is also fully wired: **`OCR_PROVIDER=tesseract`** reads born-digital
PDFs with `pdftotext` and OCRs scans/images with Tesseract locally
(`apt-get install -y poppler-utils tesseract-ocr`) — no cloud call, no cost. So
the end-to-end zero-AI-cost pipeline is complete: Tesseract OCR + `local`
embeddings + passage-mode answers (or Ollama), with the deterministic PAN/GSTIN
validators always running.

## 13. Cost — managed (Bedrock) vs a self-hosted GPU (Ollama)

The recurring question: pay-per-token (Bedrock) or a fixed GPU box (Ollama)?
**At a legal team's volumes, managed is dramatically cheaper** and has zero idle
cost. Figures are list price, US regions — confirm ap-south-1 (Mumbai) — and use
**Amazon Nova Lite** ($0.06 / 1M input, $0.24 / 1M output), **Titan embeddings**
(~$0.02 / 1M, negligible) and **Textract** OCR ($1.50 / 1,000 pages). Assumptions:
a Q&A ≈ 1,500 in + 300 out tokens; an ingested contract ≈ 8 pages OCR + ~5,000
tokens extraction.

| Monthly volume | Bedrock — Q&A | Bedrock — extraction | Textract — OCR | **Bedrock total** | Ollama GPU box |
|----------------|---------------|----------------------|----------------|-------------------|----------------|
| Light: 500 Q&A · 200 docs | ~$0.08 | ~$0.08 | ~$2.40 | **~$3 / mo** | ~$350–590 / mo |
| Medium: 2,000 Q&A · 1,000 docs | ~$0.32 | ~$0.39 | ~$12 | **~$13 / mo** | ~$350–590 / mo |
| Heavy: 10,000 Q&A · 5,000 docs | ~$1.60 | ~$1.95 | ~$60 | **~$64 / mo** | ~$350–590 / mo |

The **GPU box** is one 24 GB instance (AWS `g6.xlarge` L4 ≈ $0.805/hr ≈ **$588/mo**
on-demand; `g5.xlarge` A10G ≈ $1.006/hr ≈ $734/mo; ~40% less on a 1-year Savings
Plan ≈ $350–440/mo) running **24×7 regardless of usage**. On that box, Ollama
answers and extracts for free, and **`OCR_PROVIDER=tesseract`** does OCR for free
too — so the box removes the Textract line entirely. OCR and LLM are independent
switches, so mixing is fine (e.g. Textract OCR + Ollama extraction).

**Read:** the biggest cost on the Bedrock path is **OCR (Textract)**, not the LLM —
Nova Lite calls are fractions of a cent. Bedrock stays far below the GPU box's
~$350+ floor until very high volume: break-even is roughly **~230,000 pages/month
(~29,000 contracts)** if OCR-dominated, or **millions** of questions if Q&A-dominated.
So choose the **GPU box only** for (a) very high, sustained volume, or (b) a hard
requirement that data never leave your VPC. Otherwise **Bedrock wins on cost, ops
and elasticity**. A premium answer model (e.g. Claude 3.5 Sonnet ≈ $3 / $15 per 1M)
raises the LLM lines ~13–50× but they're so small it barely moves the totals —
OCR still dominates. To cut OCR cost, use **`OCR_PROVIDER=tesseract`** (free) —
`pdftotext` handles born-digital PDFs instantly and Tesseract OCRs the scans.

## 14. Scheduled jobs (digest + signature nudges)

Concord runs two jobs on a schedule, both **in-process** (via `@nestjs/schedule`)
and evaluated in **`SCHEDULE_TZ`** (default `Asia/Kolkata`):

| Job | Default cadence | Enable with | What it does |
|-----|-----------------|-------------|--------------|
| **Obligations digest** | **daily 08:00 IST** (`OBLIGATIONS_DIGEST_CRON=0 8 * * *`) | `OBLIGATIONS_DIGEST_ENABLED=true` | One Outlook email of every key date / renewal / pending-signature due in the window, to `OBLIGATIONS_DIGEST_RECIPIENTS`. |
| **Signature auto-nudge** | **daily 09:00 IST** (`MELENTO_NUDGE_CRON=0 9 * * *`) | `MELENTO_NUDGE_ENABLED=true` | Reminds any signatory unsigned for ≥ `MELENTO_NUDGE_AFTER_DAYS` (2), re-nudging every `MELENTO_NUDGE_EVERY_DAYS` (1). |

**They're already switched on in `docker-compose.yml`**, so `docker compose up`
fires them on the cadence above. For Container Apps / ECS, set the same env vars
on the API container (they're in `.env.example`). Both stay **dormant unless
their `*_ENABLED` flag is `true`**, so they never fire unexpectedly in dev.

**Cadence** is env-driven — change the cron string (standard 5-field, in
`SCHEDULE_TZ`) and the nudge windows without touching code. E.g. a Monday-only
digest is `0 8 * * 1`; a gentler nudge is `MELENTO_NUDGE_AFTER_DAYS=5` +
`MELENTO_NUDGE_EVERY_DAYS=7`.

**Multiple replicas:** both the **digest and the signature nudge are
multi-replica-safe** — each scheduled run is claimed atomically in Postgres (the
digest via `digest_run`, the nudge via `JobsService.claimOnce` / `job_claim`), so
exactly one replica fires each run. You can still turn the in-app jobs off
(`*_ENABLED=false`) and drive the endpoints from an **external scheduler** — Azure
Logic Apps, AWS EventBridge Scheduler, k8s CronJob, or a scheduled task — hitting
`POST /api/obligations/digest/run` and `POST /api/esign/nudge/run`. The external
route also decouples scheduling from app uptime.

---

## 15. Production controls & assurance

This release closes the CRITICAL and HIGH findings from the architecture
assessment. The controls are implemented in code and verified; the governance
decisions and assurance inputs are in **`docs/governance/`**.

| Finding | Control | Where |
|---|---|---|
| **C1 RBAC** | Canonical roles + permission matrix, global auth + roles guards, `@Roles` on every mutating route, Entra role mapping | `packages/shared/src/roles.ts`, `apps/api/src/auth/*`, `docs/governance/rbac-role-matrix.md` |
| **C2 Audit** | Append-only, hash-chained audit store with AI provenance; interceptor + exception filter; `GET /api/audit`, `/verify`, `/export` (admin) | `apps/api/src/audit/*` |
| **H1 Durable async** | Atomic once-only claims (replica-safe scheduling + idempotency), retry/backoff + DLQ seam; idempotent webhook + approval action | `apps/api/src/jobs/jobs.service.ts` |
| **H2 Document security** | Magic-byte MIME sniff + size + executable deny + quarantine; malware-scan seam; signed short-lived download links; retention + legal hold | `apps/api/src/security/file-security.service.ts`, `download-link.service.ts` |
| **AI guardrails** | Prompt-injection screening + content fencing, confidence gate → human review, advisory-only invariant | `apps/api/src/security/ai-guardrails.service.ts` |
| **H4 Cloud/residency** | Single approved position: Azure / Central India, AWS DR fallback | `docs/governance/ADR-001-cloud-and-residency.md` |
| **H5 Identity/secret** | Boot guard refuses placeholder secrets / demo login in production; Entra-only prod login | `apps/api/src/security/security.config.ts` |

**New production env vars:** `AUTH_JWT_SECRET` (required, ≥16 chars in prod),
`AUTH_ALLOW_DEMO_USERS` / `AUTH_DISABLE_DEMO_USERS`, `UPLOAD_MAX_BYTES`,
`UPLOAD_REQUIRE_SCAN`, `MALWARE_SCAN_URL`, `DOWNLOAD_LINK_SECRET`,
`DOWNLOAD_LINK_TTL_SECONDS`, `RETENTION_YEARS`, `AI_CONFIDENCE_THRESHOLD`.

**Assessment response:** `Concord-Assessment-Response.docx` (bundle root) answers the
review point-by-point; `docs/governance/` holds the ADR, RBAC matrix, remediation
tracker, PRA inventory, TPRM inputs, evidence register and PWA policy.

---

## 16. Production-readiness controls (engineering)

Closes the GPT 5.6 production-release review (P0 blockers + P1 hardening).

**Runtime consistency (P0).** Node.js is pinned to **22** everywhere — root `engines`
(`>=22 <23`), `.nvmrc`, `.npmrc` (`engine-strict`), CI `node-version: 22`, both
Dockerfiles (`node:22-bookworm-slim`), and a CI assertion (`scripts/check-node.js`).

**Database change control (P0).** The API no longer runs `db push`/seed at start. A
dedicated one-shot `migrate` service (compose) / Container Apps job runs
`prisma migrate deploy` from versioned migrations in `apps/api/prisma/migrations/`;
seeding is gated by `SEED_ON_START` (off in prod) and refuses to run in production
without `SEED_ALLOW_PROD=true` + a real `SEED_USER_PASSWORD`.

**Approval security (P0).** The Outlook callback validates the actionable-message JWT
(signature/issuer/audience/expiry); enforcement is **on by default in production**.
The verified identity must hold `approve` and be one of the contract's routed
approvers, and the **first decision wins** (conflicting/replayed decisions are
rejected). Denials are audited.

**Secrets & fallbacks (P0).** Boot guard refuses placeholder/weak `AUTH_JWT_SECRET`
and demo logins in production; `degradedModes()` surfaces every dry-run/fallback in
the boot log and `/api/health/ready`, and `PROD_REQUIRE_REAL_INTEGRATIONS=true` turns
them into hard startup errors. Secrets come from Key Vault / managed identity.

**Dependencies (P0).** Direct Multer 1.x removed; a pnpm override forces **multer 2.x**
across the tree. CI runs `pnpm audit` (blocks high/critical), Gitleaks secret scan,
Trivy fs + image scan, and emits a CycloneDX SBOM.

**Tests & gates (P0).** Jest suite (`pnpm --filter @concord/api test`) — unit tests for
roles, audit hash-chain, file security, signed links, AI guardrails, boot posture and
jobs, plus an API integration test (authn, RBAC, audit gating + verify, health,
webhook idempotency). CI runs the suite; deploy is gated by a verification job, a
manual `production` environment approval, image scan, controlled migration, a
post-deploy `/api/health` smoke test and automatic rollback.

**Operational protections (P1).** Liveness `/api/health` and readiness
`/api/health/ready`; per-IP rate limiting, `X-Request-Id` correlation and baseline
security headers (middleware); a request-timeout interceptor; retry/backoff + DLQ and
idempotent webhooks/approvals (`JobsService`). Correlation IDs flow into the audit
trail; login success/failure and AI-review generation are audited.

**Exit criteria owned outside the repo:** independent penetration test, backup/restore
& DR drills, the GitHub `production` environment reviewer list, and Key Vault / managed
identity provisioning — see `docs/governance/`.

---

## 17. Correctness & durability hardening (internal adversarial review)

This round closes the findings from Concord's **own** adversarial review — two
hostile passes over the codebase, run with code execution before anything went
to an external reviewer. Full status per finding lives in
`docs/governance/production-findings-register.md`.

### 17.1 The audit trail is now safe to autoscale

`AuditEvent.seq` is `UNIQUE`. It used to be allocated from a **per-process
cache**, which is correct on one replica and wrong on two: both compute the same
next `seq`, one INSERT wins, the other raises a unique violation that was caught
and logged — while the business action carried on. Under the 1→5 autoscale
profile in §4 that silently drops audit events.

The append now takes a **transaction-scoped Postgres advisory lock**
(`pg_advisory_xact_lock`), reads the real chain tip inside that transaction, and
inserts — so allocation and insertion are atomic across every replica. There is
no in-process tip left to drift.

Verified on Postgres 16 with 24 concurrent connections:

| | events persisted | unique violations |
|---|---|---|
| With the transactional lock | **24 / 24** | 0 |
| Without it (the old behaviour) | 12 / 24 | 12 |

A durable-write failure now also sets a `degraded` flag that **fails
`/api/health/ready`**, so the replica is pulled from rotation instead of quietly
producing an incomplete trail. `AUDIT_STRICT` (default ON in production) makes a
failed write throw to the caller rather than being swallowed.

`GET /api/audit` is paged in the database (`limit` capped at 1000, plus `offset`
and `total`); export and verification stream in pages. The endpoint previously
read the entire table into memory on every call.

### 17.2 SSO users can now hold a role — including approver

`EntraService` returned only name and email. The SSO callback read a `role` field
that was never populated, so every SSO user was created with the default, which
normalised to `counsel` — and `counsel` correctly lacks `approve`. **Nobody could
approve anything via SSO**, and the only way to create an approver was direct SQL
against production.

Now:

- Entra `roles`, `groups` and `wids` claims are read from the id token.
- `ENTRA_ROLE_MAP` translates opaque group object-ids (GUIDs) to canonical roles.
- Multiple claims never grant more than the claims did. Where one role is an
  exact fit it is used; otherwise the widest role the user actually holds is
  granted, together with a warning naming the missing permission and the
  endpoint that assigns it. (The first cut of this returned the smallest role
  that *covered* both claims — for counsel+approver that is `lead`, which also
  carries `audit:read` and `esign:admin`: two permissions neither Entra group
  granted. That was a privilege escalation, caught by internal review.)
- `admin` is unreachable except by an exact `admin` claim.
- Unrecognised claims fall back to `ENTRA_DEFAULT_ROLE`, which defaults to
  `viewer` (the `User.role` column default changed from `Legal` to `viewer`).
- `ADMIN_BOOTSTRAP_EMAILS` seeds the first administrator from configuration, so
  the first role grant is a reviewed config change rather than a SQL statement.
- New admin-only endpoints: `GET /api/auth/users`, `GET /api/auth/roles`,
  `PATCH /api/auth/users/:email/role` — every assignment is audited. A role set
  here (`roleSource: manual`) is not overwritten by a later SSO sign-in.

### 17.3 Durability and concurrency

| Area | Was | Now |
|---|---|---|
| Approval routing | per-process `Map` — lost on restart/deploy, invisible to other replicas, approver got 403 | `ApprovalRouting` table with an explicit expiry |
| Approval decision | claim a key, *then* write the audit event — a crash in between lost the decision **and** locked out the approver | the decision row **is** the claim: one atomic insert, so either it exists with who decided what, or nothing happened |
| Signature-request writes | a failed DB write fell back to an in-memory array nothing ever read — reported as success | no fallback; the failure is raised, and the record is written **before** signing emails go out |
| Concurrent webhooks | whole-row read-modify-write; two signers' callbacks erased each other's signature | `version` column + `updateMany … WHERE version = ?`, with re-read-and-reapply on conflict |
| Archive on storage failure | archive row written with an empty storage key | aborts and retries; no false seal |

### 17.4 Data that is actually data

Obligations were computed from static fixtures in `@concord/shared` — including
the signature rows, which came from sample data rather than the live e-signature
store. The daily digest to the legal mailbox was therefore a list of fictional
commitments, and `POST /api/obligations/:id/remind` returned **404** for every
signature-derived row because `getById` only searched the static array.

Obligations are now composed from live sources — pending signatures from the
e-sign store, renewals from extracted document expiry dates — and `getById`
resolves against exactly what `list()` returns, so anything shown can be
reminded on. Sample fixtures appear only when there is no database or
`DEMO_SAMPLES=true` is explicitly set.

### 17.5 Nothing hangs, nothing is undocumented

- **Timeouts.** Node's `fetch` has no default timeout, and every outbound call
  (Azure OpenAI, Document Intelligence, Ollama, OpenAI, Melento) was issued
  without one — a provider that accepts the connection then stalls could hold a
  request, or a boot, open forever. All outbound calls go through
  `fetchWithTimeout` (`OUTBOUND_HTTP_TIMEOUT_MS`, default 20s), and start-up
  index building is bounded by `REPOSITORY_INDEX_TIMEOUT_MS` and is never fatal.
- **Identifiers.** `IntakeService` derived a primary key from `count() + 1`;
  concurrent intakes collided. It now uses a Postgres sequence created by a
  migration, seeded past any existing rows.
- **Schema.** `job_claim` and `digest_run` were created by runtime
  `CREATE TABLE IF NOT EXISTS`, invisible to migrations and to drift checking,
  and never pruned. Both are now Prisma models in a versioned migration, and a
  nightly sweep prunes rows past `JOB_CLAIM_RETENTION_DAYS`. `kb_chunk` remains
  runtime-created — its column type is `vector(EMBEDDINGS_DIM)`, which cannot be
  pinned in a migration — but a dimension mismatch is now detected and reported
  instead of failing every insert, and `ALLOW_VECTOR_DDL=false` forbids it.
- **Configuration.** `.env.example` documents **all 108** settings the code
  reads; a check in `pnpm verify` fails the build if a new one is added without
  documenting it.

### 17.6 What the gate now enforces

`pnpm verify` — **11 checks, all green** with a database attached:

Node 22 · shared build · typecheck · 102 tests across 16 suites · **source
invariants** · API build · web build · **schema drift vs a real database** ·
production refuses a placeholder secret · production refuses demo fixtures ·
SSO claims never resolve to more than was claimed.

The source-invariant check (`scripts/check-invariants.js`) is what stops these
findings coming back: it fails on a bare `fetch(`, on runtime `CREATE TABLE`
outside the one documented exception, on an undocumented setting, on a silent
in-memory fallback after a failed durable write, and on an SSO role fallback
that would strip approval rights.

### 17.7 The fixes were themselves reviewed — and four were CRITICAL

Everything in §17 was put through a third adversarial pass, pointed only at the
changes. It found 24 defects, four of them critical, all created by the fixes:

- The strict-audit change turned one remaining fire-and-forget audit call into a
  **process killer** (Node exits on an unhandled rejection), triggerable by text
  inside an uploaded file.
- The e-sign webhook claimed its idempotency key *before* doing the work, so a
  storage failure left the key consumed and the provider's retry answered
  "already processed" — losing the event permanently.
- `verify()` reported **"Chain intact"** against a truncated audit table. A hash
  chain proves the events that remain are unaltered; it cannot see deletion,
  which is the obvious attack on an evidentiary log.
- The intake sequence was seeded from `COUNT(*)` rather than the highest id in
  use, so any deleted intake made it collide — the very failure it replaced.

It also found several tests that **passed unchanged against the pre-fix code**,
because their fakes ran the in-memory branch the fixes exist to replace.

All are closed and re-verified; the full list is in the findings register under
R-5 to R-25. The point worth keeping: a remediation round is code, and code has
defects at roughly the rate any other code does. Reviewing the fixes is not
optional, and it is the step that most often gets skipped.
