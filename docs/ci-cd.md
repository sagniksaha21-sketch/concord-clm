# Concord CLM CI/CD

Concord now follows a source-first release path. `main` is the deployable source
of truth; no workflow downloads or extracts a historical ZIP, and no build may
overwrite the current UI from an archive.

## What runs on every change

`.github/workflows/gcp-provider-tests.yml` is the **Concord CI** workflow. It
runs for application, package, script, infrastructure, Dockerfile, lockfile and
workflow changes, plus pull requests and manual dispatch. The gate performs:

1. Node 22 and pnpm 9.7 installation with a frozen lockfile.
2. Shared-package build, Prisma client generation and workspace typechecks.
3. The complete API Jest suite and production web build.
4. GCP renderer tests and the premium UI/UX regression gate.
5. API and web Docker image builds using the repository Dockerfiles.

Pull requests must pass this gate before merging. A cancelled run is not a
release approval; rerun it after the branch is stable.

## What deploys to Railway

The Railway staging project is connected to this GitHub repository's `main`
branch. A successful source push is picked up by Railway's native deploy
controller for both `concord-api` and `concord-web`. Railway builds from the
current checkout and runs its configured service commands; it is not supplied
with a generated archive.

The database is deliberately not reshaped during application startup. Prisma
migrations remain a controlled operation (`pnpm --filter @concord/api
db:migrate`) and must be run against the intended database before a schema change
is exposed to new application code. This keeps rollback and audit evidence
reviewable.

## Post-deploy verification

After Concord CI succeeds on `main`, `.github/workflows/staging-smoke.yml`
polls the live staging origin for up to six minutes. It checks only read-only
public surfaces:

- `/login` serves the Concord sign-in shell;
- `/api/health` reports liveness;
- `/api/health/ready` reports database, audit and storage readiness.

The smoke test never signs in, uploads a document, mutates a contract, or
prints response bodies. The authenticated browser pass remains a separate,
human-visible QA step because it exercises the real session, navigation and
responsive breakpoints.

## Rollback

If a smoke test or Railway health check fails:

1. Stop promoting further commits to `main`.
2. Use Railway's deployment history to redeploy the last known-good source
   commit, keeping the database migration state compatible with that commit.
3. Inspect the failed build/deploy logs and open a corrective pull request.
4. Re-run Concord CI and the staging smoke workflow before resuming promotion.

Never restore the old ZIP workflow. If a source rollback is required, roll back
to a reviewed Git commit so the exact source and test evidence remain traceable.

## GCP path

The GCP provider verification remains part of Concord CI. The Cloud Run and
migration manifests in `infra/gcp/` are release artifacts, but they are not
created automatically until a company-owned GCP project, billing account,
service accounts, secrets and approved model locations are supplied. See
[`deployment-gcp.md`](./deployment-gcp.md) for the activation checklist.
