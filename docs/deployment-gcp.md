# Concord CLM: Google Cloud deployment and AI migration

The repository supports a GCP deployment of the existing Next.js, NestJS and
PostgreSQL application. Google AI is opt-in. Adding these adapters does not
activate a Google service or move Railway data. A company-owned Google Cloud
project, billing, workload identity, approved service locations and live UAT
are still required before activation.

## Implemented capabilities

| Concord capability | Google implementation | Selection |
| --- | --- | --- |
| AI Review | Gemini structured output; schema and source-excerpt validation; document hash/version retained | `AI_REVIEW_PROVIDER=gcp` |
| Authoring | Gemini drafts from existing templates; exact heading/order validation; disclosed template fallback | `AUTHORING_PROVIDER=gcp` |
| Agreement extraction | Gemini JSON, bounded complete input, existing PAN/GSTIN validators | `EXTRACT_PROVIDER=gcp` |
| Repository answers | Gemini using Concord's retrieved passages and citations | `CHAT_PROVIDER=gcp` |
| Semantic retrieval | Gemini embeddings; query/document task types; existing PostgreSQL pgvector | `EMBEDDINGS_PROVIDER=gcp` |
| Optional answer verification | Google Check Grounding against the same retrieved facts; weak/failed checks return the source passage | `GCP_GROUNDING_CHECK=true` |
| OCR | Document AI online processing, version pinning and imageless output | `OCR_PROVIDER=gcp` |
| Original files | Google Cloud Storage with create-only uploads and generation-pinned reads | `GCS_BUCKET` |

Gemini responses must complete normally; blocked/truncated/malformed output is
rejected. Errors contain status information, not returned contract text or tokens.
Transient 429/502/503/504 responses have one retry within an overall deadline.
Google embedding errors never substitute local hash vectors into a semantic index.
The runtime caches short-lived metadata tokens and refreshes them before expiry.

The Google client uses REST and the Cloud Run metadata identity. It does not load
service-account JSON keys or implement the full local ADC credential chain. A
short-lived `GCP_ACCESS_TOKEN` is supported for non-production local tests only.
No account credentials belong in GitHub or rendered Cloud Run configuration.

## Hosting topology

Use a Cloud Run multi-container service: `web` receives traffic on port 3000 and
proxies `/api` to the `api` sidecar on localhost:4000. The browser keeps the same
origin and existing HttpOnly cookie. Add Cloud SQL PostgreSQL, a versioned GCS
bucket, Secret Manager and Artifact Registry. Entra SSO, Graph notifications and
Melento remain the existing business integrations.

Source-controlled deployment files:

- `infra/gcp/cloudbuild.yaml`: builds both Dockerfiles from the current checkout.
- `infra/gcp/config.example.json`: project settings and pinned secret references.
- `scripts/gcp/render-config.cjs`: renders a service and separate migration job.
- `scripts/gcp/migrate.cjs`: applies versioned Prisma migrations and prepares
  pgvector; refuses a conflicting dimension, never drops a table or seeds data.
- `.github/workflows/gcp-provider-tests.yml`: Node 22 builds and offline tests.

The service waits for API readiness before starting the web container. It uses
always-allocated CPU and one active instance for the current in-process cadences.
Review scheduler/claim behavior and replacement overlap before increasing replica
counts. This release does not introduce a Pub/Sub ingestion queue.

## Project preparation

In a project owned by the organization:

1. Enable Cloud Run, Cloud SQL Admin, Cloud Storage, Artifact Registry, Secret
   Manager, Cloud Build, Vertex AI (`aiplatform.googleapis.com`) and Document AI.
   Enable Discovery Engine only if the optional grounding check is selected.
2. Create the Artifact Registry Docker repository, Cloud SQL instance/database
   and GCS bucket. Enable backups and object versioning/soft delete. Choose
   locations deliberately; do not assume all models/processors run in India.
3. Create separate runtime and migration service accounts. Grant Cloud SQL
   Client, access to each named Secret Manager secret, and bucket-scoped storage
   permissions. The GCS boot probe also needs `storage.buckets.get`; use a narrow
   custom role for that permission alongside `roles/storage.objectUser`.
4. Grant `roles/aiplatform.user` and `roles/documentai.apiUser` to the runtime
   identity for the selected AI resources. Optional Check Grounding needs
   `discoveryengine.groundingConfigs.check` and access to that API.
5. Store the existing production integration settings in Secret Manager. Pin
   secret versions. Use a migration database identity with schema privileges;
   the runtime database identity needs CRUD on application tables and the
   repository index, with the existing audit restrictions preserved.
6. Configure the Cloud SQL connection. For a Unix socket use the normal Prisma
   URL with the Cloud SQL host parameter, for example
   `postgresql://USER:PASSWORD@localhost/concord?host=/cloudsql/PROJECT:REGION:INSTANCE`.
   Store its actual value only in Secret Manager. For private IP, provide Direct
   VPC egress network/subnetwork settings in the config and validate reachability.

The renderer starts with restricted ingress (`internal-and-cloud-load-balancing`).
Set up the organization's load balancer, DNS/TLS and Cloud Armor before public
cutover. It does not change IAM or make the application public on its own.

## Configure Google AI

Set the following on the API (the renderer supplies them from its config):

```text
GCP_PROJECT_ID=<organization project>
GCP_LOCATION=<approved location supported by the chosen models>
GCP_GEMINI_MODEL=<currently available model selected and evaluated by the team>
GCP_EMBEDDINGS_MODEL=gemini-embedding-001
EMBEDDINGS_DIM=768
EMBEDDINGS_PROVIDER=gcp
CHAT_PROVIDER=gcp
AI_REVIEW_PROVIDER=gcp
AUTHORING_PROVIDER=gcp
EXTRACT_PROVIDER=gcp
OCR_PROVIDER=gcp
GCP_DOCUMENT_AI_LOCATION=<approved processor location>
GCP_DOCUMENT_AI_PROCESSOR=<processor ID>
GCP_DOCUMENT_AI_PROCESSOR_VERSION=<tested version, when pinning is available>
```

There is deliberately no automatic US-region or generative-model default. Model
availability changes. Select a supported model/location before deployment and
record it with the evaluation results. `GCP_LOCATION=global` uses Google's global
inference host and is an explicit data-routing choice.

Optional Check Grounding uses Google's documented global endpoint. It is off by
default; enabling it requires `GCP_GROUNDING_LOCATION=global`. It checks the answer
against supplied Concord passages; it does not browse the web or copy the corpus
into a second search datastore. A support score is a model estimate, not proof of
legal correctness. Production use still requires legal review.

## Build, render, migrate and deploy

Run from the current reviewed GitHub checkout with Node 22 and pnpm 9.7:

```bash
pnpm install --frozen-lockfile
pnpm --filter @concord/api db:generate
pnpm build
pnpm test
node --test scripts/gcp/render-config.test.cjs

# Authenticate to the company-owned project first. No credentials in the command.
gcloud builds submit --config infra/gcp/cloudbuild.yaml \
  --project "$CONCORD_PROJECT_ID" \
  --substitutions "_REGION=$CONCORD_REGION,_RELEASE=$CONCORD_RELEASE"

# Copy config.example.json outside the repo and replace its placeholders.
# Populate extraEnv with the existing required production integration settings.
node scripts/gcp/render-config.cjs /secure/concord-config.json /secure/concord-rendered

gcloud run jobs replace /secure/concord-rendered/migration.json \
  --project "$CONCORD_PROJECT_ID" --region "$CONCORD_REGION"
gcloud run jobs execute concord-migrate --wait \
  --project "$CONCORD_PROJECT_ID" --region "$CONCORD_REGION"
gcloud run services replace /secure/concord-rendered/service.json \
  --project "$CONCORD_PROJECT_ID" --region "$CONCORD_REGION"
```

The example is not a populated production config. `extraEnv` must include the
existing Entra identity/redirect and role mapping, Graph sender/tenant/client,
HTTPS approval callback and allowed senders, malware scanner, and verified
Melento settings. Store their secrets via `secretRefs`. The existing production
boot guards remain in effect; do not bypass them to make a rollout pass.

Repository embeddings rebuild at startup. Keep 768 dimensions to reuse the
existing index shape. Use a maintenance cutover when switching providers/models,
not a mixed-provider rolling release against the same index. Model/dimension
namespaces filter reads; a differing database dimension must be migrated by the
controlled job before activation. A failed index is reported as unavailable.
The current knowledge base consists of contract metadata and explicit demo facts;
it does not imply every page of every uploaded agreement has been indexed.

## Limits and activation evidence

Document AI online OCR requests use imageless mode (up to 30 pages for supported
processors) and a conservative 20 MiB adapter limit. Processor-specific limits
still apply. DOCX needs a processor supporting Office documents; an OCR-only
processor may reject it. Larger documents require a separate durable batch job;
this release returns an error instead of silently processing only some pages.
Complete Gemini extraction is limited to 120,000 characters. AI Review retains
the existing complete-review limit and blocks oversized production requests.

Before moving users from Railway, verify real Google model access, processor
results, source citations, IAM, database migration, object checksums and complete
legal workflows in the target project. Run a lawyer-reviewed set of redacted
agreements through OCR, extraction, review, authoring and questions, including
missing clauses, poor scans, prompt injection and unsupported formats. Capture
latency, cost and false/missed findings. Verify backup/restore, monitoring,
secret access, network restrictions, audit writes and rollback separately.

Keep Railway operational until the Google environment passes UAT. Migrating SQL
rows does not migrate agreement bytes: copy originals under the same stored keys,
verify their SHA-256 checksums, then reconcile document counts. Do not point an
existing database at an empty bucket. Rollback must restore a consistent database
and object-store pair; avoid writing to both systems after cutover.

Official references: [Gemini inference](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference),
[text embeddings](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/embeddings/get-text-embeddings),
[Document AI limits](https://docs.cloud.google.com/document-ai/limits),
[Check Grounding](https://docs.cloud.google.com/generative-ai-app-builder/docs/check-grounding),
[Cloud Run containers](https://docs.cloud.google.com/run/docs/configuring/services/containers),
[Cloud Run secrets](https://docs.cloud.google.com/run/docs/configuring/services/secrets),
[Cloud SQL connections](https://docs.cloud.google.com/sql/docs/postgres/connect-run).
