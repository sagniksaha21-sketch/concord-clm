#!/usr/bin/env node
// Run only in the controlled migration job, using its separate database identity.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const dim = Number(process.env.EMBEDDINGS_DIM || 768);
if (!Number.isInteger(dim) || dim < 1 || dim > 2000) throw new Error('Invalid EMBEDDINGS_DIM');
const result = spawnSync(process.execPath, ['apps/api/node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'apps/api/prisma/schema.prisma'], { cwd: root, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
const { PrismaClient } = require(path.join(root, 'apps/api/node_modules/@prisma/client'));
const db = new PrismaClient();
(async () => {
  try {
    await db.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector');
    const rows = await db.$queryRawUnsafe("SELECT atttypmod AS dim FROM pg_attribute WHERE attrelid = to_regclass('public.kb_chunk') AND attname = 'embedding' AND NOT attisdropped");
    if (rows.length && rows[0].dim !== dim) throw new Error('Existing vector dimension differs; plan a reviewed index migration. No table was dropped.');
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS kb_chunk (id text PRIMARY KEY, text text NOT NULL, citations jsonb NOT NULL, provider text NOT NULL, embedding vector(${dim}) NOT NULL)`);
    await db.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS kb_chunk_embedding_idx ON kb_chunk USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)');
    console.log('Prisma migrations and vector schema are ready. No demo data was seeded.');
  } catch (error) {
    console.error('Migration failed. Review the controlled job logs before activating traffic.'); process.exitCode = 1;
  } finally { await db.$disconnect(); }
})();
