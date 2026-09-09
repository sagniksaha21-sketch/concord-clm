#!/usr/bin/env node
/**
 * Concord — executable definition of done.
 *
 *   pnpm verify   → green means shippable, by definition.
 *
 * Every production exit criterion that can be checked mechanically lives here.
 * When a reviewer (internal or external) finds something new, it becomes a check
 * in this file — so the review loop converges instead of running forever.
 *
 * Steps that need infrastructure we may not have locally (a database) SKIP
 * rather than fail, and are reported as skipped so nothing is silently green.
 */
const { execSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const results = [];

function step(name, cmd, { optional = false, skipIf = false, skipReason = '' } = {}) {
  if (skipIf) {
    results.push({ name, status: 'SKIP', note: skipReason });
    process.stdout.write(`  SKIP  ${name} — ${skipReason}\n`);
    return;
  }
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'pipe' });
    results.push({ name, status: 'PASS' });
    process.stdout.write(`  PASS  ${name}\n`);
  } catch (e) {
    const out = `${e.stdout || ''}${e.stderr || ''}`.trim().split('\n').slice(-12).join('\n');
    results.push({ name, status: optional ? 'WARN' : 'FAIL', note: out });
    process.stdout.write(`  ${optional ? 'WARN' : 'FAIL'}  ${name}\n${out ? `        ${out.replace(/\n/g, '\n        ')}\n` : ''}`);
  }
}

console.log('\nConcord — production verification gate\n' + '='.repeat(46));

// 1. Runtime consistency
step('Node.js runtime is 22', 'node scripts/check-node.js');

// 2. Build + type integrity
step('Shared package builds', 'pnpm --filter @concord/shared build');
step('All packages typecheck', 'pnpm -r typecheck');

// 3. Functional + security test suite (RBAC, audit chain, uploads, webhook auth…)
step('Automated test suite', 'pnpm --filter @concord/api test');

// 3b. Source-level invariants that keep closed findings closed: no unbounded
//     outbound HTTP, no runtime DDL, no undocumented settings, no silent
//     fallback on a failed durable write, no invented SSO role.
step('Source invariants hold', 'node scripts/check-invariants.js');

// 3c. Interaction architecture + accessibility foundations.
step('UI/UX interaction invariants hold', 'node scripts/check-ux.js');

// 4. Applications build for production
step('API builds', 'pnpm --filter @concord/api build');
step('Web builds', 'pnpm --filter @concord/web build');

// 5a. The Prisma schema actually PARSES. Runs with no database and no network:
//     the whole file was invalid for months behind a blocked engine download.
step('Prisma schema is valid', 'node scripts/check-prisma-schema.js');

// 5b. Database schema matches the data model (skips without a database)
step('Migration matches schema.prisma', 'python3 scripts/check-migration-drift.py', {
  skipIf: !process.env.DATABASE_URL,
  skipReason: 'DATABASE_URL not set — run against staging to include this check',
});

// 6. Production boot posture: a placeholder secret must refuse to start.
step(
  'Production refuses a placeholder secret',
  `node -e "process.env.NODE_ENV='production';process.env.AUTH_JWT_SECRET='change-me-in-production';` +
    `const {inspectSecurityConfig}=require('./apps/api/dist/security/security.config.js');` +
    `const errs=inspectSecurityConfig().filter(i=>i.level==='error');` +
    `if(!errs.length){console.error('boot guard did NOT reject a placeholder secret');process.exit(1)}"`,
);

// 7. Production must refuse demo fixtures, which substitute fabricated
//    extraction data for real uploaded contracts.
step(
  'Production refuses demo fixtures',
  `node -e "process.env.NODE_ENV='production';process.env.AUTH_JWT_SECRET='V9x2Lm7Qr4Ts8Wz1Bn6Kd3Hj5Pf0Ac';` +
    `process.env.DEMO_SAMPLES='true';` +
    `const {inspectSecurityConfig}=require('./apps/api/dist/security/security.config.js');` +
    `const errs=inspectSecurityConfig().filter(i=>i.level==='error');` +
    `if(!errs.some(e=>/DEMO_SAMPLES/.test(e.message))){console.error('boot guard did NOT reject DEMO_SAMPLES in production');process.exit(1)}"`,
);

// 8. Least privilege: an unrecognised identity-provider claim must never
//    resolve to a privileged role (findings C-D7 / S-M2).
step(
  'SSO claims never resolve to more than was claimed',
  `node -e "const {resolveRole,normalizeRole}=require('./packages/shared/dist/index.js');` +
    `const bad=['Contract Administrator','Legal Admins','Read-only Admin','some-unknown-group','aaaa-bbbb-cccc'];` +
    `for(const c of bad){if(resolveRole([c])==='admin'){console.error('escalated to admin from: '+c);process.exit(1)}}` +
    `if(resolveRole([])!=='viewer'){console.error('empty claims did not resolve to viewer');process.exit(1)}` +
    `const {PERMISSIONS}=require('./packages/shared/dist/index.js');` +
    `const claimed=new Set([...PERMISSIONS.counsel,...PERMISSIONS.approver]);` +
    `const combined=resolveRole(['Concord.Counsel','Concord.Approver']);` +
    `for(const p of PERMISSIONS[combined]){if(!claimed.has(p)){console.error('combining claims invented permission: '+p);process.exit(1)}}` +
    `if(normalizeRole('Contract Reviewer')!=='counsel'){console.error('reviewer downgraded to read-only');process.exit(1)}"`,
);

// ── summary ────────────────────────────────────────────────────────────────
const failed = results.filter((r) => r.status === 'FAIL');
const skipped = results.filter((r) => r.status === 'SKIP');
const passed = results.filter((r) => r.status === 'PASS');

console.log('='.repeat(46));
console.log(`  ${passed.length} passed · ${failed.length} failed · ${skipped.length} skipped`);
if (failed.length) {
  console.log('\n  NOT SHIPPABLE — the checks above must pass.\n');
  process.exit(1);
}
if (skipped.length) {
  console.log('\n  GREEN (with skips) — run the skipped checks against staging before go-live.\n');
} else {
  console.log('\n  GREEN — all production verification checks pass.\n');
}
