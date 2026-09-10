#!/usr/bin/env node
// Pure rendering: no Google calls, provisioning, secrets or deploys.
const fs = require('node:fs');
const path = require('node:path');

function render(config) {
  const required = ['projectId', 'region', 'service', 'runtimeServiceAccount', 'migrationServiceAccount',
    'cloudSqlInstance', 'bucket', 'webOrigin', 'apiImage', 'webImage', 'inferenceLocation',
    'geminiModel', 'documentAiLocation', 'documentAiProcessor'];
  for (const key of required) {
    if (typeof config[key] !== 'string' || !config[key] || /SET_|RELEASE|your-project|example\.com/.test(config[key])) {
      throw new Error(`Replace the placeholder for ${key}`);
    }
  }
  const origin = new URL(config.webOrigin);
  if (origin.protocol !== 'https:' || origin.origin !== config.webOrigin || origin.username || origin.password) throw new Error('webOrigin must be an HTTPS origin');
  const dim = config.embeddingsDimension ?? 768;
  if (!Number.isInteger(dim) || dim < 1 || dim > 2000) throw new Error('embeddingsDimension must be 1–2000 for the pgvector IVFFlat index');
  const secrets = config.secretRefs || {};
  if (!secrets.DATABASE_URL || !secrets.AUTH_JWT_SECRET) throw new Error('Database and auth secret references are required');
  const secret = (name, ref) => {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name) || !ref || !/^[A-Za-z0-9_-]+$/.test(ref.name) || !/^\d+$/.test(String(ref.version))) throw new Error(`Invalid or unpinned secret reference: ${name}`);
    return { name, valueFrom: { secretKeyRef: { name: ref.name, key: String(ref.version) } } };
  };
  const env = {
    NODE_ENV: 'production', PORT: '4000', WEB_ORIGIN: config.webOrigin,
    GCS_BUCKET: config.bucket, GCP_PROJECT_ID: config.projectId, GCP_LOCATION: config.inferenceLocation,
    GCP_GEMINI_MODEL: config.geminiModel, GCP_EMBEDDINGS_MODEL: 'gemini-embedding-001',
    EMBEDDINGS_DIM: String(dim), EMBEDDINGS_PROVIDER: 'gcp', CHAT_PROVIDER: 'gcp', AI_REVIEW_PROVIDER: 'gcp',
    AUTHORING_PROVIDER: 'gcp', EXTRACT_PROVIDER: 'gcp', OCR_PROVIDER: 'gcp',
    GCP_DOCUMENT_AI_LOCATION: config.documentAiLocation, GCP_DOCUMENT_AI_PROCESSOR: config.documentAiProcessor,
    ALLOW_VECTOR_DDL: 'false', DEMO_SAMPLES: 'false', AUTH_DISABLE_DEMO_USERS: 'true',
  };
  if (config.documentAiProcessorVersion) {
    if (config.documentAiProcessorVersion.startsWith('SET_')) throw new Error('Replace documentAiProcessorVersion');
    env.GCP_DOCUMENT_AI_PROCESSOR_VERSION = config.documentAiProcessorVersion;
  }
  for (const [name, value] of Object.entries(config.extraEnv || {})) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name) || name in env || name in secrets || /SECRET|PASSWORD|TOKEN|API_KEY|DATABASE_URL/.test(name)) throw new Error(`Use a secret reference or remove conflicting extraEnv: ${name}`);
    env[name] = String(value);
  }
  for (const name of Object.keys(secrets)) if (name in env) throw new Error(`Duplicate environment setting: ${name}`);
  const apiEnv = [...Object.entries(env).map(([name, value]) => ({ name, value })), ...Object.entries(secrets).map(([name, ref]) => secret(name, ref))];
  const network = { 'run.googleapis.com/cloudsql-instances': config.cloudSqlInstance };
  if (config.network && config.subnetwork) {
    network['run.googleapis.com/network-interfaces'] = JSON.stringify([{ network: config.network, subnetwork: config.subnetwork }]);
    network['run.googleapis.com/vpc-access-egress'] = 'private-ranges-only';
  }
  const service = {
    apiVersion: 'serving.knative.dev/v1', kind: 'Service', metadata: { name: config.service,
      annotations: { 'run.googleapis.com/ingress': 'internal-and-cloud-load-balancing' } },
    spec: { template: { metadata: { annotations: { ...network,
      'run.googleapis.com/container-dependencies': '{"web":["api"]}',
      'run.googleapis.com/cpu-throttling': 'false', 'autoscaling.knative.dev/minScale': '1', 'autoscaling.knative.dev/maxScale': '1' } },
      spec: { serviceAccountName: config.runtimeServiceAccount, timeoutSeconds: 120, containerConcurrency: 20,
        containers: [
          { name: 'web', image: config.webImage, ports: [{ containerPort: 3000 }],
            env: [{ name: 'NODE_ENV', value: 'production' }, { name: 'API_INTERNAL_BASE', value: 'http://localhost:4000' }],
            resources: { limits: { cpu: '1', memory: '512Mi' } },
            startupProbe: { httpGet: { path: '/login', port: 3000 }, periodSeconds: 5, timeoutSeconds: 3, failureThreshold: 36 } },
          { name: 'api', image: config.apiImage, env: apiEnv, resources: { limits: { cpu: '1', memory: '1Gi' } },
            startupProbe: { httpGet: { path: '/api/health/ready', port: 4000 }, periodSeconds: 5, timeoutSeconds: 3, failureThreshold: 36 },
            livenessProbe: { httpGet: { path: '/api/health', port: 4000 }, periodSeconds: 30, timeoutSeconds: 3 } },
        ] } } },
  };
  const migration = {
    apiVersion: 'run.googleapis.com/v1', kind: 'Job', metadata: { name: `${config.service}-migrate` },
    spec: { template: { spec: { taskCount: 1, parallelism: 1, template: { metadata: { annotations: network },
      spec: { serviceAccountName: config.migrationServiceAccount, maxRetries: 0, timeoutSeconds: '600', containers: [{
        image: config.apiImage, command: ['node'], args: ['scripts/gcp/migrate.cjs'],
        env: [secret('DATABASE_URL', config.migrationDatabaseSecret), { name: 'EMBEDDINGS_DIM', value: String(dim) }],
        resources: { limits: { cpu: '1', memory: '1Gi' } },
      }] } } } } },
  };
  return { service, migration };
}

if (require.main === module) {
  try {
    const [input, output] = process.argv.slice(2);
    if (!input || !output) throw new Error('Usage: node scripts/gcp/render-config.cjs config.json output-directory');
    const rendered = render(JSON.parse(fs.readFileSync(input, 'utf8')));
    fs.mkdirSync(output, { recursive: true });
    for (const [name, value] of Object.entries(rendered)) fs.writeFileSync(path.join(output, `${name}.json`), JSON.stringify(value, null, 2) + '\n');
    console.log('Rendered Cloud Run service and migration job; no resources were created.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { render };
