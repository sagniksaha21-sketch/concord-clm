import { ConflictException } from '@nestjs/common';
import { ESignService } from '../../src/esign/esign.service';
import { createHash } from 'crypto';

/**
 * Findings C-D15 (lost updates) and C-D16 (writes that fail are reported as
 * successes).
 *
 * A signature request is stored as one row whose `signatories` and `audit` are
 * JSON blobs, so every state change is a read-modify-write of the whole row.
 * With two signers, both webhooks arrive at once: each reads the same row, each
 * writes its own copy back, and the second erases the first signer's signature
 * and audit entry. That is a signature disappearing from the evidentiary record
 * of an executed agreement.
 *
 * This fake Prisma enforces exactly the version predicate the real
 * `updateMany({ where: { id, version } })` enforces, so the interleaving can be
 * reproduced deterministically.
 */
function fakePrismaWithVersioning(seed: any) {
  // Deep-copy on every read and write. A real Prisma client deserialises JSON
  // columns into fresh objects; a shallow copy would hand callers the SAME
  // `signatories`/`audit` arrays the store holds, so a discarded write would
  // still mutate the row and the test would prove nothing.
  const clone = (v: any) => (v === null || v === undefined ? v : structuredClone(v));
  const rows = new Map<string, any>([[seed.id, clone({ ...seed, version: 0 })]]);
  return {
    enabled: true,
    client: {
      signatureRequest: {
        findUnique: async ({ where }: any) => {
          const r = rows.get(where.id);
          return r ? clone(r) : null;
        },
        findFirst: async ({ where }: any) => {
          for (const r of rows.values()) {
            if (!where?.envelopeId || r.envelopeId === where.envelopeId) return clone(r);
          }
          return null;
        },
        findMany: async () => [...rows.values()].map(clone),
        create: async ({ data }: any) => {
          rows.set(data.id, clone({ ...data, version: 0 }));
          return clone({ ...data, version: 0 });
        },
        updateMany: async ({ where, data }: any) => {
          const r = rows.get(where.id);
          if (!r || r.version !== where.version) return { count: 0 };
          rows.set(where.id, clone({ ...r, ...data }));
          return { count: 1 };
        },
      },
      approvalDecision: {
        findUnique: async ({ where }: any) => where.contractId
          ? { contractId: where.contractId, decision: 'approved', documentId: 'DOC-1', documentSha256: createHash('sha256').update(Buffer.from('x')).digest('hex'), contractVersion: 'v1' }
          : null,
      },
      document: {
        findFirst: async () => ({ id: 'DOC-1', filename: 'agreement.pdf', blobPath: 'key-doc', sha256: createHash('sha256').update(Buffer.from('x')).digest('hex') }),
      },
      archivedDocument: {
        findFirst: async () => null,
        create: async ({ data }: any) => data,
        findMany: async () => [],
      },
    },
    _rows: rows,
  } as any;
}

const seed = {
  id: 'SIG-TEST-1',
  contractId: 'CTR-1',
  contractTitle: 'HGS Payroll Outsourcing Agreement',
  status: 'viewed',
  provider: 'stub',
  envelopeId: 'MEL-ENV-TEST',
  signingUrl: null,
  message: null,
  signatories: [
    { name: 'A Signer', email: 'a@x.com', role: 'LLPL', order: 1, status: 'sent' },
    { name: 'B Signer', email: 'b@y.com', role: 'Vendor', order: 2, status: 'sent' },
  ],
  stampPaper: null,
  audit: [{ event: 'sent', at: new Date().toISOString() }],
  createdAt: new Date(),
  sentAt: new Date(),
  completedAt: null,
  lastNudgedAt: null,
};

function makeService(prisma: any) {
  return new ESignService(
    { provider: 'stub', procureStamp: async () => ({ certificateNo: 'X' }), createEnvelope: async () => ({ envelopeId: 'E', signingUrl: 'u' }) } as any,
    { sendEmail: async () => ({ status: 'dry-run' }) } as any,
    prisma,
    { put: async () => 'key/1', get: async () => ({ buffer: Buffer.from('x'), contentType: 'text/html' }) } as any,
    { record: async () => null, aiProvenance: () => ({}) } as any,
    { alreadyProcessed: async () => false, claimOnce: async () => true, releaseClaim: async () => undefined } as any,
    { getByIdFresh: async (id: string) => ({ id, title: 'Agreement', counterparty: 'Vendor', type: 'MSA', valueDisplay: 'N/A', stage: 'approved', risk: 'low', version: 'v1', source: 'test' }) } as any,
  );
}

describe('E-sign optimistic concurrency (C-D15)', () => {
  it('does not lose a signature when two signer webhooks interleave', async () => {
    const prisma = fakePrismaWithVersioning(seed);
    const svc = makeService(prisma);

    // Both webhooks read the row, then both write — the exact interleaving that
    // used to erase one signature.
    await Promise.all([
      svc.webhook({ envelopeId: 'MEL-ENV-TEST', event: 'signed', signerEmail: 'a@x.com', occurredAt: 't1' }),
      svc.webhook({ envelopeId: 'MEL-ENV-TEST', event: 'signed', signerEmail: 'b@y.com', occurredAt: 't2' }),
    ]);

    const row = prisma._rows.get('SIG-TEST-1');
    const signed = row.signatories.filter((s: any) => s.status === 'signed').map((s: any) => s.email).sort();
    expect(signed).toEqual(['a@x.com', 'b@y.com']);
    // Both signature events survive in the audit trail.
    const signedEvents = row.audit.filter((e: any) => e.event === 'signed');
    expect(signedEvents.length).toBe(2);
    // And completion is derived from the signatories, not from a separate callback.
    expect(row.status).toBe('completed');
  });

  it('surfaces a conflict rather than overwriting a newer row', async () => {
    const prisma = fakePrismaWithVersioning(seed);
    const svc = makeService(prisma);
    const stale = await svc.get('SIG-TEST-1'); // version 0
    // Someone else writes first.
    await (svc as any).mutate('SIG-TEST-1', (r: any) => {
      r.status = 'partially-signed';
      return true;
    });
    // The stale copy must not be allowed to clobber it.
    await expect((svc as any).update(stale)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('E-sign durability (C-D16)', () => {
  it('reports a failed write as a failure instead of silently using memory', async () => {
    const prisma = fakePrismaWithVersioning(seed);
    prisma.client.signatureRequest.create = async () => {
      throw new Error('database unavailable');
    };
    const svc = makeService(prisma);
    await expect(
      svc.create({
        contractId: 'CTR-9',
        contractTitle: 'New agreement',
        signatories: [{ name: 'S', email: 's@x.com', role: 'LLPL' }],
      } as any),
    ).rejects.toThrow(/database unavailable/);
    // Nothing was written anywhere, and the caller knows.
    expect(await svc.list()).toHaveLength(1);
  });

  it('does not record an archive when the executed copy could not be stored', async () => {
    const prisma = fakePrismaWithVersioning({ ...seed, status: 'completed', completedAt: new Date() });
    const svc = makeService(prisma);
    (svc as any).storage = { put: async () => { throw new Error('blob unavailable'); } };
    await expect((svc as any).archive(await svc.get('SIG-TEST-1'))).rejects.toThrow(/blob unavailable/);
  });
});
