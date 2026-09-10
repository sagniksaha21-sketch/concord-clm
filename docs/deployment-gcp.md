# Concord CLM on Google Cloud

This is the GCP path for the existing Concord monorepo. It keeps the current
Next.js web app, NestJS API, PostgreSQL schema, same-origin session cookie and
workflow code intact. It does not introduce a second application architecture.

## Recommended shape

Run one Cloud Run **multi-container service** with two containers:

| Container | Image | Port | Role |
| --- | --- | ---: | --- |
| `web` (ingress) | `Dockerfile.web` | 3000 | Public Next.js shell, login and `/api` same-origin proxy |
| `api` (sidecar) | `Dockerfile.api` | 4000 | NestJS API, workflows, jobs and integrations |

Cloud Run sends public traffic only to `web`. The Next.js rewrite reaches the
sidecar at `http://localhost:4000`, so the browser continues to use the existing
same-origin `/api` contract and host-only HttpOnly cookie. The API does not need
to be exposed as a second public hostname.

The durable services are:

- **Cloud SQL for PostgreSQL** (enable `vector` if semantic search is enabled).
- **Cloud Storage** for original agreement files. Concord selects it with
  `GCS_BUCKET` and uses the Cloud Run service account through the metadata
  server; no service-account key belongs in the image or repository.
- **Secret Manager** for `DATABASE_URL`, `AUTH_JWT_SECRET`, SSO credentials,
  Graph/e-signature credentials and any AI provider keys.
- **Artifact Registry** for the two images.

Cloud Run instances are stateless. Do not use local disk as the production
document store. The scheduled obligations/e-signature nudges currently run in
the API process, so choose a single active instance for the pilot or move those
cadences to a separately controlled Cloud Run Job before running many API
replicas.

## One-time project setup

```bash
export PROJECT_ID="your-gcp-project"
export REGION="asia-south1"              # choose the region nearest your users/data
export REPOSITORY="concord"
export SERVICE="concord"
export API_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/concord-api"
export WEB_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/concord-web"

gcloud config set project "$PROJECT_ID"
gcloud services enable \
  run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com \
  sqladmin.googleapis.com storage.googleapis.com secretmanager.googleapis.com \
  vpcaccess.googleapis.com
gcloud artifacts repositories create "$REPOSITORY" \
  --repository-format=docker --location="$REGION" \
  --description="Concord CLM images"
```

Create a dedicated runtime service account and grant only the roles required by
the selected integrations. At minimum, Cloud Run needs `roles/cloudsql.client`,
Secret Manager access to the named secrets, and bucket-scoped
`roles/storage.objectUser` (or `roles/storage.objectAdmin` only if the team
needs object lifecycle operations from the app). Keep the bucket IAM policy
resource-scoped rather than granting project-wide storage administration.

Create the Cloud SQL instance/database and the production GCS bucket with
soft-delete/versioning and retention rules appropriate for executed agreements.
Run the versioned Prisma migrations from a reviewed release job before sending
traffic to the new service; the API should not run `db push` or seed demo users at
startup.

## Build and publish the existing images

The web image now accepts `API_INTERNAL_BASE` as a build argument. For the
sidecar topology it must be `http://localhost:4000`:

```bash
gcloud auth configure-docker "${REGION}-docker.pkg.dev"

docker build -f Dockerfile.api -t "${API_IMAGE}:candidate" .
docker build -f Dockerfile.web \
  --build-arg NEXT_PUBLIC_API_BASE=http://localhost:4000 \
  --build-arg API_INTERNAL_BASE=http://localhost:4000 \
  -t "${WEB_IMAGE}:candidate" .

docker push "${API_IMAGE}:candidate"
docker push "${WEB_IMAGE}:candidate"
```

## Deploy the Cloud Run service

Cloud Run's multi-container service manifest is the clearest way to express the
web ingress container and API sidecar. Replace the placeholders below with the
project-specific values; do not commit the rendered manifest containing secret
values.

```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: concord
spec:
  template:
    metadata:
      annotations:
        run.googleapis.com/container-dependencies: '{"web":["api"]}'
    spec:
      serviceAccountName: concord-runtime@PROJECT_ID.iam.gserviceaccount.com
      containers:
        - name: web
          image: REGION-docker.pkg.dev/PROJECT_ID/concord/concord-web:candidate
          ports:
            - name: http1
              containerPort: 3000
          env:
            - name: NODE_ENV
              value: production
            - name: API_INTERNAL_BASE
              value: http://localhost:4000
        - name: api
          image: REGION-docker.pkg.dev/PROJECT_ID/concord/concord-api:candidate
          env:
            - name: NODE_ENV
              value: production
            - name: PORT
              value: "4000"
            - name: GCS_BUCKET
              value: concord-documents-PROJECT_ID
            # Reference Secret Manager values here with Cloud Run secretKeyRef.
            # Never put DATABASE_URL or auth/provider secrets in this file.
```

Save the rendered file outside the repository and deploy it:

```bash
gcloud run services replace concord-cloud-run.yaml --region "$REGION"
gcloud run services update concord --region "$REGION" \
  --ingress=all --min=1 --max=5 --cpu=1 --memory=1Gi
```

The exact Cloud Run YAML fields for Secret Manager references should be
generated with `gcloud run services describe` from the target project, because
the CLI/API version may add or rename fields. The important invariant is that
the API receives the existing production variables (`DATABASE_URL`,
`AUTH_JWT_SECRET`, `WEB_ORIGIN`, `APPROVAL_CALLBACK_URL`, identity/provider
secrets) from Secret Manager, while the web and API remain under one public
origin.

## Database, migrations and networking

Use Cloud SQL's documented Cloud Run integration. Private IP plus Direct VPC
egress (or a Serverless VPC Access connector) is preferred for a production
database. If the team uses the Cloud SQL Unix socket instead, validate the
Prisma connection-string format in the target project before rollout; the
application still consumes the normal `DATABASE_URL` variable.

```bash
# Run from a controlled migration runner with the same image and secrets.
DATABASE_URL='postgresql://...' \
  pnpm --filter @concord/api db:migrate
```

Cloud SQL for PostgreSQL supports the `vector` extension used by the repository
semantic-search path. Enable it deliberately and include the migration in the
release checklist; it is not enabled by this document automatically.

## GCS document storage

Set only:

```text
GCS_BUCKET=concord-documents-PROJECT_ID
```

In Cloud Run, omit `GCS_ACCESS_TOKEN`: the adapter obtains a short-lived access
token from the attached service account metadata endpoint. `GCS_ACCESS_TOKEN`
and `GCS_API_BASE` are test hooks for local/CI smoke tests, not production
secrets. The adapter verifies the bucket at boot, uploads with an
`ifGenerationMatch=0` precondition, and downloads the exact object generation
recorded in metadata.

## Cutover checklist

1. Create Cloud SQL, the versioned GCS bucket, Artifact Registry and secrets.
2. Grant the runtime service account least-privilege Cloud SQL, GCS and Secret
   Manager access.
3. Build and push both current images; run API type-check, tests and web build.
4. Apply Prisma migrations from a controlled release runner.
5. Deploy the two-container Cloud Run service with `web` as ingress.
6. Confirm `/api/health/ready`, login, upload/download, approvals, e-signature,
   audit and repository search in a non-production project before DNS cutover.
7. Configure backups, Cloud Monitoring alerts, Cloud Armor/WAF as required,
   and a separate cadence runner if scheduled jobs must scale independently.

Official references: [Cloud Run multi-container deployments](https://cloud.google.com/run/docs/deploying),
[Cloud SQL from Cloud Run](https://cloud.google.com/sql/docs/postgres/connect-run),
[Cloud Storage IAM](https://cloud.google.com/storage/docs/access-control/iam-roles), and
[Cloud Run secrets](https://cloud.google.com/run/docs/configuring/services/secrets).
