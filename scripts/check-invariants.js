#!/usr/bin/env node
/**
 * Source-level invariants that keep closed findings closed.
 *
 * These are the checks that cannot be expressed as a unit test because they are
 * about the ABSENCE of a pattern anywhere in the codebase. Each one corresponds
 * to a finding that was fixed once and would be easy to reintroduce.
 *
 * Run standalone, or as a step in `pnpm verify`.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const problems = [];

function walk(dir, out = []) {
  // A root may name a single file (e.g. apps/web/middleware.ts), which sits at a
  // package root rather than in a directory and is otherwise easy to leave out.
  if (fs.existsSync(dir) && fs.statSync(dir).isFile()) {
    if (/\.(ts|tsx|js|mjs)$/.test(dir)) out.push(dir);
    return out;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.next') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const apiSrc = walk(path.join(ROOT, 'apps/api/src'));
// The fetch rule applies to every file we ship, not just the API.
//
// `apps/web/components` was missing from this list, which meant the shell — the
// component every single screen renders inside, and the one that calls
// /api/auth/me and /api/nav-counts — was never scanned at all. A whole source
// directory silently outside the checker is worse than a missing rule, because
// the checker still reports "invariants hold".
// `apps/web/middleware.ts` is a single file at the package root, not in a
// directory, and was therefore outside every root while being the file that
// decides which requests reach the application at all. It gated /brand/*.png
// behind login, so the sign-in page's own logos rendered as broken images.
const WEB_ROOTS = ['apps/web/app', 'apps/web/components', 'apps/web/middleware.ts'];
const serverSrc = [
  ...apiSrc,
  ...WEB_ROOTS.flatMap((r) =>
    fs.existsSync(path.join(ROOT, r)) ? walk(path.join(ROOT, r)) : [],
  ),
];
const rel = (f) => path.relative(ROOT, f);

/** Strip block and line comments so a rule cannot fire on prose about itself. */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ── 1. C-D30: no unbounded outbound HTTP ────────────────────────────────────
// Node's fetch has no default timeout, so a bare `fetch(` can hang a request or
// a boot indefinitely. Everything must go through fetchWithTimeout. The earlier
// version of this rule was trivially evadable — `globalThis.fetch(...)` and
// `const f = fetch` both slipped past a plain negative lookbehind.
const FETCH_PATTERNS = [
  // fetch(...) not preceded by a dot or an identifier char, and not our wrapper
  { re: /(?<![A-Za-z0-9_$.])fetch\s*\(/, why: 'bare fetch()' },
  // globalThis.fetch(...), window.fetch(...), g.fetch(...)
  { re: /\.\s*fetch\s*\(/, why: 'fetch() reached through a property' },
  // const f = fetch;  /  const { fetch } = globalThis  /  = globalThis.fetch
  { re: /=\s*(?:globalThis|window|global)\s*\.\s*fetch\b/, why: 'fetch aliased from a global' },
  { re: /=\s*fetch\s*;/, why: 'fetch aliased to a local' },
  { re: /\{\s*fetch\s*[,}]/, why: 'fetch destructured' },
];
// The two wrapper implementations are where the real `fetch` lives.
const FETCH_ALLOWED = ['apps/api/src/common/http.ts', 'apps/web/app/lib/api.ts'];
for (const file of serverSrc) {
  if (FETCH_ALLOWED.includes(rel(file))) continue;
  const lines = stripComments(fs.readFileSync(file, 'utf8')).split('\n');
  lines.forEach((line, i) => {
    if (/fetchWithTimeout/.test(line)) return;
    for (const { re, why } of FETCH_PATTERNS) {
      if (re.test(line)) {
        problems.push(
          `${rel(file)}:${i + 1} — ${why}, no timeout (C-D30). Use fetchWithTimeout from common/http.`,
        );
        return;
      }
    }
  });
}

// ── 2. C-D33: no runtime DDL outside the one documented exception ───────────
// Tables created by `CREATE TABLE IF NOT EXISTS` at runtime are invisible to
// migrations and to drift checking. kb_chunk is the sole allowed exception
// because its column type is vector(EMBEDDINGS_DIM), set by configuration.
const DDL_ALLOWED = new Set(['apps/api/src/repository/repository.service.ts']);
// Schema is versioned in migrations. Runtime DDL of ANY kind is invisible to
// migrations and to drift checking, not just CREATE TABLE.
const DDL = /\b(CREATE\s+(TABLE|INDEX|SEQUENCE|EXTENSION|SCHEMA)|ALTER\s+TABLE|DROP\s+(TABLE|INDEX|SEQUENCE))\b/i;
for (const file of apiSrc) {
  if (DDL_ALLOWED.has(rel(file))) continue;
  const lines = stripComments(fs.readFileSync(file, 'utf8')).split('\n');
  const hit = lines.findIndex((l) => DDL.test(l));
  if (hit >= 0) {
    problems.push(
      `${rel(file)}:${hit + 1} — issues DDL at runtime (C-D33): ${lines[hit].trim().slice(0, 80)}. ` +
        'Put it in a versioned migration instead.',
    );
  }
}

// ── 3. C-D37: every env var the code reads is documented in .env.example ────
const envExample = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
const documented = new Set(
  [...envExample.matchAll(/^#?\s*([A-Z0-9_]+)=/gm)].map((m) => m[1]),
);
const codeRoots = ['apps/api/src', 'apps/api/prisma/seed.ts', ...WEB_ROOTS, 'packages/shared/src', 'scripts'];
const used = new Set();
for (const r of codeRoots) {
  const dir = path.join(ROOT, r);
  if (!fs.existsSync(dir)) continue;
  for (const file of walk(dir)) {
    // Strip comments: this file's own documentation of the patterns it looks
    // for would otherwise be scanned as if it were code.
    const src = stripComments(fs.readFileSync(file, 'utf8'));
    // process.env.<NAME>
    for (const m of src.matchAll(/process\.env\.([A-Z0-9_]+)/g)) used.add(m[1]);
    // bracket access on process.env
    for (const m of src.matchAll(/process\.env\[\s*['"`]([A-Z0-9_]+)['"`]\s*\]/g)) used.add(m[1]);
    // destructured from process.env
    for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=\s*process\.env/g)) {
      for (const part of m[1].split(',')) {
        const name = part.split(':')[0].trim();
        if (/^[A-Z0-9_]+$/.test(name)) used.add(name);
      }
    }
    // aliased: const env = process.env, then env.<NAME> (this hid 11 vars)
    for (const alias of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*process\.env\b/g)) {
      const name = alias[1];
      const re = new RegExp(`\\b${name}\\.([A-Z0-9_]{2,})\\b`, 'g');
      for (const m of src.matchAll(re)) used.add(m[1]);
    }
  }
}
for (const name of [...used].sort()) {
  if (!documented.has(name)) {
    problems.push(`.env.example — ${name} is read by the code but not documented (C-D37).`);
  }
}

// ── 4. C-D16: a failed durable write must not be downgraded to a warning ────
// The original bug: catch a persistence error, log a warning, and write to a
// process-local array that nothing ever reads again — success reported, data
// gone. Assert the CURRENT shape rather than matching a dead string: the durable
// write paths must not be wrapped in a catch that only warns.
{
  const f = 'apps/api/src/esign/esign.service.ts';
  const src = stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  const warnSwallow =
    /catch\s*\([^)]*\)\s*\{[^{}]*logger\.warn\([^;]*\);?\s*\}\s*\n\s*\}?\s*this\.(mem|archiveMem)\./;
  if (warnSwallow.test(src)) {
    problems.push(`${f} — a failed durable write falls back to an in-memory store (C-D16).`);
  }
  for (const [name, body] of [
    ['persist', src.match(/private async persist\([\s\S]*?\n  \}/)?.[0]],
    ['persistArchive', src.match(/private async persistArchive\([\s\S]*?\n  \}/)?.[0]],
  ]) {
    if (body && /catch\s*\(/.test(body)) {
      problems.push(`${f} — ${name}() swallows its write error (C-D16); it must propagate.`);
    }
  }
}

// ── 5. C-D7: the SSO callback must take its role from claims ────────────────
{
  const f = 'apps/api/src/auth/auth.controller.ts';
  const src = stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  if (!/claims\.role/.test(src)) {
    problems.push(
      `${f} — the SSO callback does not use the identity provider's role claim (C-D7); ` +
        'every SSO user would land on the default role and could not approve.',
    );
  }
  if (/\|\|\s*'Legal'/.test(src) || /\?\?\s*'Legal'/.test(src)) {
    problems.push(`${f} — SSO falls back to 'Legal', which normalises to counsel (C-D7).`);
  }
}

// ── 6. Least privilege: role resolution must never invent a permission ──────
{
  const f = 'packages/shared/src/roles.ts';
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (!/grants\.length === needed\.length/.test(src)) {
    problems.push(
      `${f} — resolveRoleDetailed no longer requires an EXACT permission fit, so combining ` +
        'two group claims can grant permissions neither group carried (privilege escalation).',
    );
  }
}

// ── 7. No route may serve audit-trail data below `audit:read` ───────────────
//
// The notification history shipped as a read of `AuditService.list()` behind
// `@Roles('contract:read')` — a permission every signed-in role holds. That
// handed a read-only viewer the routed approver addresses and provider envelope
// ids embedded in audit summaries: the reconnaissance step of the closed
// execution-forgery chain (S-C1), re-opened under a new route name.
//
// The rule is structural rather than a spelling check: any controller that
// reaches the audit service must carry `audit:read` on the handlers that do.
{
  const controllers = apiSrc.filter((f) => /\.controller\.ts$/.test(f));
  for (const file of controllers) {
    const raw = fs.readFileSync(file, 'utf8');
    const src = stripComments(raw);
    // Does this controller read the trail at all — directly, or through a
    // service method whose name says it returns audit-derived rows?
    const TOUCHES = /\baudit\s*\.\s*(?:list|count|verify|all)\s*\(|\bnotifications\s*\(/;
    if (!TOUCHES.test(src)) continue;

    // Split into per-handler blocks. Decorators sit ABOVE the method, and
    // `@Roles(...)` sits above `@Get(...)`, so splitting on the HTTP decorator
    // alone would file each handler's @Roles with the PREVIOUS handler — which
    // is how the first version of this rule reported two false positives on
    // routes that were correctly gated. Fragments are accumulated instead, and
    // a fragment carrying an HTTP decorator closes the run.
    const fragments = src.split(/(?=\n\s*@(?:Roles|Public|Get|Post|Put|Patch|Delete)\()/);
    const handlers = [];
    let pending = '';
    for (const frag of fragments) {
      pending += frag;
      if (/@(?:Get|Post|Put|Patch|Delete)\(/.test(frag)) {
        handlers.push(pending);
        pending = '';
      }
    }
    if (pending.trim()) handlers.push(pending);

    for (const block of handlers) {
      if (!TOUCHES.test(block)) continue;
      if (/@Roles\(\s*'audit:read'/.test(block) || /@Public\(\)/.test(block)) continue;
      const route = (block.match(/@(?:Get|Post|Put|Patch|Delete)\(\s*'([^']*)'/) || [])[1] ?? '(root)';
      problems.push(
        `${rel(file)} — the handler for '${route}' serves audit-trail data but does not ` +
          "carry @Roles('audit:read'). Any role holding contract:read could then read " +
          'approver addresses and provider envelope ids out of the trail (S-C1).',
      );
    }
  }
}

// ── 8. The permission-gated navigation must fail CLOSED ─────────────────────
//
// `NAV.filter(n => !n.needs || !perms || perms.includes(n.needs))` shows every
// gated link whenever the permission fetch has not answered — on first paint of
// each navigation, and permanently if /api/auth/me is down.
{
  const f = 'apps/web/components/AppShell.tsx';
  const p = path.join(ROOT, f);
  if (fs.existsSync(p)) {
    const src = stripComments(fs.readFileSync(p, 'utf8'));
    if (/!\s*n\.needs\s*\|\|\s*!\s*perms\b/.test(src)) {
      problems.push(
        `${f} — the nav filter treats unknown permissions as "show everything" (fails open). ` +
          'Gated items must stay hidden until permissions are known.',
      );
    }
  }
}

// ── 9. Node version is stated identically everywhere ────────────────────────
//
// `apps/web` carried `@types/node@^20` while the repo required Node 22 and the
// API used `^22`. The web typecheck still passed — Node 20's types are close
// enough that nothing errored — so the mismatch was invisible until an external
// reviewer read the manifests. Types that describe a different runtime than the
// one you ship on is a silent-divergence bug: it compiles, and then a Node 22
// API behaves differently at runtime than the types promised.
{
  const root = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const engines = root.engines?.node ?? '';
  const wantMajor = (engines.match(/(\d+)/) || [])[1];
  if (!wantMajor) {
    problems.push('package.json — engines.node is missing, so no runtime version is pinned.');
  } else {
    for (const pkg of ['apps/api/package.json', 'apps/web/package.json', 'packages/shared/package.json']) {
      const f = path.join(ROOT, pkg);
      if (!fs.existsSync(f)) continue;
      const m = JSON.parse(fs.readFileSync(f, 'utf8'));
      const dep = (m.devDependencies || {})['@types/node'] || (m.dependencies || {})['@types/node'];
      if (!dep) continue;
      const got = (dep.match(/(\d+)/) || [])[1];
      if (got !== wantMajor) {
        problems.push(
          `${pkg} — @types/node is ${dep} but engines.node requires ${engines} (major ${wantMajor}). ` +
            'The types must describe the runtime actually shipped.',
        );
      }
    }
    // The README is what a new developer follows; if it names a different major
    // they install the wrong Node and the gate rejects them at step 1.
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    const stated = readme.match(/Node\.js\s+\*\*(\d+)/);
    if (stated && stated[1] !== wantMajor) {
      problems.push(
        `README.md — states Node.js ${stated[1]} but engines.node requires major ${wantMajor}.`,
      );
    }
  }
}

// ── 10. The README must not describe behaviour that was removed ─────────────
//
// It advertised "schema pushed & seeded" on `docker compose up` long after the
// hardening round replaced runtime `db push` with a one-shot versioned-migration
// job. That is not a cosmetic staleness: an auditor reading it concludes the
// application reshapes the database at startup — the precise control the change
// was made to establish — and marks the release blocked on evidence that already
// exists.
{
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const claims = [
    { re: /schema\s+pushed/i, why: 'claims the schema is pushed; migrations are versioned and run by a separate job' },
    { re: /\bdb push\b/i, why: 'mentions `db push`, which the API no longer does at any point' },
  ];
  for (const c of claims) {
    if (c.re.test(readme)) {
      problems.push(`README.md — ${c.why}.`);
    }
  }
}

// ── 12. Telemetry must be the first thing the process loads ────────────────
//
// OpenTelemetry auto-instrumentation patches modules as they are required.
// Anything imported above the SDK's start is never patched, so moving this
// import — or adding an innocent-looking one above it — produces a service that
// reports no spans while every log line still says telemetry is active. The
// failure is silent and looks exactly like "we have no traffic".
{
  const f = 'apps/api/src/main.ts';
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const firstImport = src.split('\n').find((l) => /^import\s/.test(l.trim()));
  if (!firstImport || !/telemetry/.test(firstImport)) {
    problems.push(
      `${f} — the telemetry bootstrap must be the FIRST import (found: ` +
        `${(firstImport || '(none)').trim().slice(0, 60)}). Anything loaded before it is ` +
        'never instrumented, and the service reports no spans while appearing configured.',
    );
  }
}

// ── 11. The checker must not silently certify a SUBSET of what ships ────────
//
// This is the rule that exists because of how the other rules kept failing.
//
// Three separate defects in this project were caused by the same thing, not by
// a missing rule but by a rule looking at less than it appeared to:
//
//   1. `apps/web/components` was absent from the scanned roots, so the shell —
//      the component every screen renders inside — was never checked. Three
//      user-facing buttons shipped calling bare `fetch()` with no auth header
//      and 401'd in the browser. The checker said "invariants hold".
//   2. The Prisma schema check required a live DATABASE_URL and therefore
//      SKIPPED on every run. 34 schema-validation errors sat behind that skip.
//   3. Nothing scanned manifests, README or docs, so `@types/node` pointing at
//      the wrong Node major and a README advertising a control the code had
//      deliberately removed both survived every gate run — until an external
//      reviewer read the files nothing was reading.
//
// A checker that reports OK over 60% of the artifact prints exactly the same
// words as one that reports OK over 100%. That indistinguishability is the
// defect. So: enumerate every source file that ships, and fail if any of it
// lives outside the scanned roots. New directories then have to be added
// deliberately, instead of being quietly exempt.
const COVERAGE_EXEMPT = [
  // Generated or vendored — not ours to hold to these invariants.
  'apps/web/.next', 'node_modules', 'dist', '.turbo', '.git',
  // Test code is exercised by running it, which is a stronger check than these.
  'apps/api/test',
  // Regenerated by `next build` on every run; not authored here.
  'apps/web/next-env.d.ts',
];
{
  const scannedRoots = [
    'apps/api/src',
    // seed.ts holds the "refuse to seed production" guard — squarely in scope.
    'apps/api/prisma/seed.ts',
    ...WEB_ROOTS,
    'packages/shared/src',
    'scripts',
  ];
  const shipped = [];
  const collect = (dir, depth = 0) => {
    if (depth > 6) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      const r = rel(full);
      if (COVERAGE_EXEMPT.some((x) => r === x || r.startsWith(`${x}/`) || e.name === x)) continue;
      if (e.isDirectory()) collect(full, depth + 1);
      else if (/\.(ts|tsx)$/.test(e.name)) shipped.push(r);
    }
  };
  collect(ROOT);

  const covered = (f) => scannedRoots.some((r) => f === r || f.startsWith(`${r}/`));
  const uncovered = shipped.filter((f) => !covered(f));
  const dirs = [...new Set(uncovered.map((f) => path.dirname(f)))].sort();

  if (dirs.length) {
    problems.push(
      `Source outside every scanned root — ${uncovered.length} file(s) in ${dirs.length} ` +
        `director${dirs.length === 1 ? 'y' : 'ies'}: ${dirs.slice(0, 6).join(', ')}` +
        `${dirs.length > 6 ? ', …' : ''}. Add them to the scanned roots or to COVERAGE_EXEMPT ` +
        'with a reason. A checker that reports OK over a subset is indistinguishable from ' +
        'one that reports OK over everything.',
    );
  }
  // Reported unconditionally, so "invariants hold" always carries its own scope.
  module.exports = module.exports || {};
  global.__coverage = { shipped: shipped.length, roots: scannedRoots.length };
}

if (problems.length) {
  console.error(`INVARIANTS VIOLATED — ${problems.length} issue(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
const cov = global.__coverage || { shipped: 0, roots: 0 };
console.log(
  `OK — source invariants hold. Scope: ${cov.shipped} TypeScript file(s) across ` +
    `${cov.roots} root(s), all covered; ${serverSrc.length} scanned for the fetch rule; ` +
    `${used.size} env vars documented; manifests, README and the Prisma schema checked.`,
);
