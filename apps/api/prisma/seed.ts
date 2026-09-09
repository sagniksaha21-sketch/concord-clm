/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { CLAUSES, CONTRACTS, INTAKE_REQUESTS, TEMPLATES } from '@concord/shared';

const prisma = new PrismaClient();

async function main() {
  // Guard: never seed demo accounts / default passwords into production. Seeding
  // in production must be an explicit, reviewed decision with a real password.
  const isProd = (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
  if (isProd && process.env.SEED_ALLOW_PROD !== 'true') {
    throw new Error(
      'Refusing to seed in production. Production data is loaded by a separate, ' +
        'reviewed job. Set SEED_ALLOW_PROD=true with a real SEED_USER_PASSWORD only if intended.',
    );
  }
  if (isProd && !process.env.SEED_USER_PASSWORD) {
    throw new Error('SEED_USER_PASSWORD must be set explicitly when seeding in production.');
  }

  const seedEmail = (process.env.SEED_USER_EMAIL ?? (isProd ? '' : 'concord.admin@example.test')).trim().toLowerCase();
  const seedName = process.env.SEED_USER_NAME ?? 'Concord Test Administrator';
  const seedRole = process.env.SEED_USER_ROLE ?? (isProd ? 'viewer' : 'admin');
  if (!seedEmail) throw new Error('SEED_USER_EMAIL must be set explicitly when seeding production.');
  const password = bcrypt.hashSync(process.env.SEED_USER_PASSWORD ?? 'concord', 10);

  await prisma.user.upsert({
    where: { email: seedEmail },
    update: isProd ? {} : { name: seedName, role: seedRole, password },
    create: { email: seedEmail, name: seedName, role: seedRole, roleSource: isProd ? 'manual' : 'sso', password },
  });

  for (const c of CLAUSES) {
    await prisma.clause.upsert({ where: { id: c.id }, update: {}, create: c });
  }
  for (const t of TEMPLATES) {
    await prisma.template.upsert({ where: { id: t.id }, update: {}, create: t });
  }
  for (const i of INTAKE_REQUESTS) {
    await prisma.intakeRequest.upsert({ where: { id: i.id }, update: {}, create: i as any });
  }
  // Development/CI fixtures only: persisted through the same Contract table the
  // application uses in production, so browser E2E exercises the system-of-record
  // path instead of a mock-data import hidden behind an HTTP route.
  if (!isProd) {
    for (const c of CONTRACTS) {
      await prisma.contract.upsert({
        where: { id: c.id },
        update: {},
        create: {
          id: c.id, title: c.title, counterparty: c.counterparty, type: c.type,
          valueDisplay: c.valueDisplay, stage: c.stage, risk: c.risk,
          version: c.version, source: c.source,
        },
      });
    }
  }
  console.log('Seeded users, clauses, templates, intake requests and non-production contract fixtures.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
