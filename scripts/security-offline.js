#!/usr/bin/env node
/**
 * Concord offline security preflight.
 *
 * This is intentionally dependency-free so it runs before pnpm install and in
 * restricted review environments. It does not replace SCA/SAST/DAST; CI still
 * runs pnpm audit, Gitleaks and Trivy. It catches regressions that are specific
 * to Concord's threat model and should never depend on a third-party scanner.
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const failures = [];
const passes = [];

function files(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.next', 'dist', 'coverage'].includes(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) files(p, out);
    else out.push(p);
  }
  return out;
}
const sourceRoots = ['apps', 'packages', 'scripts', '.github', 'infra'].map((p) => path.join(root, p)).filter(fs.existsSync);
const all = sourceRoots.flatMap((p) => files(p));
const texts = all.filter((p) => /\.(?:ts|tsx|js|mjs|cjs|json|ya?ml|bicep|md|env|example)$/.test(p)).map((p) => [p, fs.readFileSync(p, 'utf8')]);
const webApi = texts.filter(([p]) => /apps[\\/]web|apps[\\/]api/.test(p));

function check(name, ok, detail = '') {
  (ok ? passes : failures).push({ name, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
function hits(pattern, list = texts) {
  return list.flatMap(([p, s]) => pattern.test(s) ? [path.relative(root, p)] : []);
}

console.log('\nConcord — offline security preflight\n' + '='.repeat(46));

check('No browser JWT stored in local/session storage', hits(/(?:localStorage|sessionStorage)\s*\.\s*(?:setItem|getItem)\s*\(\s*['\"](?:token|concord_token|jwt)/i, webApi).length === 0);
check('No wildcard CORS origin', hits(/origin\s*:\s*['\"]\*['\"]/i, webApi).length === 0);
check('No CSP unsafe-eval', hits(/unsafe-eval/i, webApi).length === 0);
check('No production demo-user opt-in in manifests/IaC', hits(/AUTH_ALLOW_DEMO_USERS\s*[:=]\s*['\"]?true/i, texts.filter(([p]) => /infra|\.github|Dockerfile/.test(p))).length === 0);
check('No hardcoded sample review route in web app', hits(/\/review\/CLM-\d{4}-\d+/i, texts.filter(([p]) => /apps[\\/]web/.test(p))).length === 0);
check('Document download does not expose storage keys in routes', hits(/documents\/:key|archive\/:storageKey/i, webApi).length === 0);
check('Production security gate rejects placeholder secrets', fs.readFileSync(path.join(root, 'apps/api/src/security/security.config.ts'), 'utf8').includes("prod ? 32 : 16"));
check('Production storage supports managed identity', fs.readFileSync(path.join(root, 'apps/api/src/storage/storage.service.ts'), 'utf8').includes('DefaultAzureCredential'));
check('Browser mutations have Origin enforcement', fs.readFileSync(path.join(root, 'apps/api/src/main.ts'), 'utf8').includes('browserMutationOriginGuard'));
check('JWT verification pins algorithm, issuer and audience', (() => { const s=fs.readFileSync(path.join(root,'apps/api/src/auth/auth.service.ts'),'utf8'); return s.includes("algorithms: ['HS256']") && s.includes("issuer: 'concord-api'") && s.includes("audience: 'concord-web'"); })());
check('Production sample-ingest endpoint is disabled', (() => { const s=fs.readFileSync(path.join(root,'apps/api/src/ingestion/ingestion.controller.ts'),'utf8'); return s.includes('isProduction()') && s.includes("throw new NotFoundException('Not found')"); })());
check('CI blocks high/critical dependency advisories', fs.readFileSync(path.join(root,'.github/workflows/ci.yml'),'utf8').includes('pnpm audit --audit-level high'));
check('CI runs secret + vulnerability/IaC scans', (() => { const s=fs.readFileSync(path.join(root,'.github/workflows/ci.yml'),'utf8'); return s.includes('gitleaks/gitleaks-action') && s.includes('aquasecurity/trivy-action'); })());
check('CodeQL is enabled for JavaScript/TypeScript', (() => { const p=path.join(root,'.github/workflows/codeql.yml'); return fs.existsSync(p) && fs.readFileSync(p,'utf8').includes('github/codeql-action/analyze@v3'); })());
check('Staging workflow includes passive DAST', (() => { const p=path.join(root,'.github/workflows/staging-e2e.yml'); return fs.existsSync(p) && fs.readFileSync(p,'utf8').includes('zap-baseline.py'); })());
check('Production password sign-in is disabled', fs.readFileSync(path.join(root,'apps/api/src/auth/auth.service.ts'),'utf8').includes('Password sign-in is disabled. Use Microsoft SSO.'));
check('No eval/new Function in application source', hits(/\beval\s*\(|new\s+Function\s*\(/, webApi).length === 0);
check('Runtime process execution is limited to the hardened OCR adapter', (() => {
  const found = hits(/(?:node:)?child_process|execFile\s*\(|execSync\s*\(|spawnSync\s*\(/, webApi);
  return found.every((p) => p === 'apps/api/src/ingestion/tesseract-ocr.ts');
})());
check('No committed E2E default credentials in journey', (() => { const s=fs.readFileSync(path.join(root,'scripts/e2e-journey.mjs'),'utf8'); return s.includes('E2E_EMAIL and E2E_PASSWORD are required') && !/const PASSWORD = process\.env\.E2E_PASSWORD \|\| ['"][^'"]+['"]/.test(s); })());

// High-signal secret formats. Generic "api_key=..." matching is deliberately
// excluded to avoid teaching teams to ignore this gate because examples/docs
// trigger it constantly.
const secretPatterns = [
  ['AWS access key', /AKIA[0-9A-Z]{16}/g],
  ['GitHub token', /gh[pousr]_[A-Za-z0-9_]{30,}/g],
  ['PEM private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['Slack token', /xox[baprs]-[A-Za-z0-9-]{20,}/g],
];
for (const [label, re] of secretPatterns) {
  const found = texts.flatMap(([p,s]) => { re.lastIndex = 0; return re.test(s) ? [path.relative(root,p)] : []; });
  check(`No committed ${label}`, found.length === 0, found.length ? found.slice(0,3).join(', ') : '');
}

console.log('='.repeat(46));
console.log(`  ${passes.length} passed · ${failures.length} failed`);
if (failures.length) process.exit(1);
console.log('  Offline security preflight GREEN.\n');
