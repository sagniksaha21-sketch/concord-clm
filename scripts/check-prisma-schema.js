#!/usr/bin/env node
/**
 * Validates `schema.prisma` — WITHOUT downloading Prisma's engine binaries.
 *
 * ## Why this check exists
 *
 * `schema.prisma` had thirty-four validation errors and nobody knew. Every
 * model was documented with `/** … *\/` block comments, which Prisma's schema
 * language does not accept — it takes `//` and `///` only. `prisma generate`
 * and `prisma migrate` would both have failed on the first developer machine
 * that ran them.
 *
 * It went unseen because the only check that touches the schema
 * (`check-migration-drift.py`) needs a live `DATABASE_URL` and had been
 * SKIPPING on every run, and because the build sandbox cannot reach
 * `binaries.prisma.sh` at all — so every Prisma command died at the download
 * step, long before it ever parsed the file. A network error was standing in
 * front of a syntax error and hiding it completely.
 *
 * ## How it validates with no engine
 *
 * The Prisma CLI parses schemas with a WASM module bundled inside the npm
 * package; the multi-megabyte native binaries it tries to fetch are for the
 * QUERY and MIGRATION engines, which validation never uses. Pointing
 * `PRISMA_SCHEMA_ENGINE_BINARY` and `PRISMA_QUERY_ENGINE_LIBRARY` at any
 * existing path makes the CLI treat the engines as already present and skip the
 * download entirely, leaving the WASM parser to do its job.
 *
 * That makes this check runnable anywhere — an air-gapped runner, a
 * locked-down CI, an egress-allowlisted sandbox — with no database and no
 * network. It is a syntax and semantics check, not a drift check: comparing the
 * schema against actual database columns is still `check-migration-drift.py`,
 * which still needs a real database.
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA = path.join(ROOT, 'apps/api/prisma/schema.prisma');

// Resolve the CLI's entry point directly. `npx prisma` would try to install a
// different version from the network, which is the thing this check avoids.
const CLI = [
  'node_modules/prisma/build/index.js',
  ...fs
    .readdirSync(path.join(ROOT, 'node_modules/.pnpm'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^prisma@/.test(d.name))
    .map((d) => `node_modules/.pnpm/${d.name}/node_modules/prisma/build/index.js`),
]
  .map((p) => path.join(ROOT, p))
  .find((p) => fs.existsSync(p));

if (!CLI) {
  console.error('Prisma CLI not found in node_modules — cannot validate the schema.');
  process.exit(1);
}

// A path that exists is all the CLI checks before deciding not to download.
const stub = path.join(os.tmpdir(), 'concord-prisma-engine-stub');
fs.writeFileSync(stub, '');

const res = spawnSync(process.execPath, [CLI, 'validate', '--schema', SCHEMA], {
  cwd: ROOT,
  encoding: 'utf8',
  env: {
    ...process.env,
    // env("DATABASE_URL") must resolve for the datasource block to parse. The
    // value is never connected to — validation does not open a connection.
    DATABASE_URL:
      process.env.DATABASE_URL || 'postgresql://validate:validate@localhost:5432/validate',
    PRISMA_SCHEMA_ENGINE_BINARY: stub,
    PRISMA_QUERY_ENGINE_LIBRARY: stub,
    PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING: '1',
    CHECKPOINT_DISABLE: '1',
  },
});

const out = `${res.stdout || ''}${res.stderr || ''}`;

if (res.status !== 0) {
  console.error('schema.prisma is INVALID — `prisma generate` and `prisma migrate` would fail:\n');
  console.error(out.trim());
  process.exit(1);
}

// Belt and braces: block comments parse as errors, so a clean exit already
// proves they are gone. Saying so explicitly documents the regression this
// check was written for.
const src = fs.readFileSync(SCHEMA, 'utf8');
if (/\/\*/.test(src)) {
  console.error(
    'schema.prisma contains a /* … */ block comment. Prisma accepts only // and ///.',
  );
  process.exit(1);
}

console.log(`OK — ${path.relative(ROOT, SCHEMA)} is valid (parsed with no engine download).`);
