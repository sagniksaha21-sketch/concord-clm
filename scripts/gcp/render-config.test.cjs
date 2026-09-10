const { test } = require('node:test');
const assert = require('node:assert/strict');
const { render } = require('./render-config.cjs');
const config = () => ({
  projectId: 'concord-uat', region: 'asia-south1', service: 'concord',
  runtimeServiceAccount: 'runtime@concord-uat.iam.gserviceaccount.com', migrationServiceAccount: 'migration@concord-uat.iam.gserviceaccount.com',
  cloudSqlInstance: 'concord-uat:asia-south1:postgres', bucket: 'concord-documents-uat', webOrigin: 'https://concord.uat.test',
  apiImage: 'asia-south1-docker.pkg.dev/concord-uat/concord/api:abc123', webImage: 'asia-south1-docker.pkg.dev/concord-uat/concord/web:abc123',
  inferenceLocation: 'asia-south1', geminiModel: 'gemini-test', documentAiLocation: 'us', documentAiProcessor: 'ocr123',
  secretRefs: { DATABASE_URL: { name: 'db', version: '1' }, AUTH_JWT_SECRET: { name: 'auth', version: '1' } },
  migrationDatabaseSecret: { name: 'db-migrate', version: '1' },
});
test('keeps one browser origin, waits for API readiness, and mounts only referenced secrets', () => {
  const { service, migration } = render(config());
  const [web, api] = service.spec.template.spec.containers;
  assert.deepEqual(web.ports, [{ containerPort: 3000 }]); assert.equal(api.ports, undefined);
  assert.equal(api.startupProbe.httpGet.path, '/api/health/ready');
  assert.equal(service.spec.template.metadata.annotations['run.googleapis.com/container-dependencies'], '{"web":["api"]}');
  assert.equal(service.spec.template.metadata.annotations['run.googleapis.com/cpu-throttling'], 'false');
  assert.equal(api.env.find(e => e.name === 'DATABASE_URL').valueFrom.secretKeyRef.name, 'db');
  assert.equal(api.env.find(e => e.name === 'GCP_ACCESS_TOKEN'), undefined);
  assert.equal(migration.spec.template.spec.template.spec.containers[0].env[0].valueFrom.secretKeyRef.name, 'db-migrate');
  assert.equal(migration.spec.template.spec.template.spec.maxRetries, 0);
});
test('rejects placeholders, plaintext secrets and duplicate identity controls', () => {
  assert.throws(() => render({ ...config(), geminiModel: 'SET_MODEL' }), /placeholder/);
  assert.throws(() => render({ ...config(), extraEnv: { OPENAI_API_KEY: 'plaintext' } }), /secret reference/);
  assert.throws(() => render({ ...config(), extraEnv: { NODE_ENV: 'development' } }), /conflicting/);
  assert.throws(() => render({ ...config(), webOrigin: 'http://insecure.test' }), /HTTPS/);
});
test('pins secret versions and refuses an unsupported stored-vector dimension', () => {
  const c = config(); c.secretRefs.DATABASE_URL.version = 'latest';
  assert.throws(() => render(c), /unpinned/);
  assert.throws(() => render({ ...config(), embeddingsDimension: 3072 }), /IVFFlat/);
});
