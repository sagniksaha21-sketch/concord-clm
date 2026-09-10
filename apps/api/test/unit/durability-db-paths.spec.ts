import { JobsService } from '../../src/jobs/jobs.service';
import { WorkflowService } from '../../src/workflow/workflow.service';

/**
 * The DATABASE paths for the durability fixes.
 *
 * An adversarial review of the first cut of these fixes found that the new specs
 * all ran with `{ enabled: false, client: null }` — so they exercised the
 * in-process Maps and Sets that the fixes exist to REPLACE, and would have
 * passed unchanged against the pre-fix code. A test that cannot fail against the
 * bug it names is worse than no test: it reports safety that was never checked.
 *
 * These drive the `prisma.enabled === true` branches.
 */

/** Minimal Postgres stand-in: enforces the constraints the real fix relies on. */
function fakeDb() {
  const routing = new Map<string, any>();
  const decisions = new Map<string, any>();
  const claims = new Set<string>();
  const stats = { claimInserts: 0, claimDeletes: 0 };

  const client: any = {
    document: { findFirst: async () => ({ id: 'DOC-1', sha256: 'approved-document-hash' }) },
    approvalRouting: {
      findUnique: async ({ where }: any) =>
        routing.has(where.contractId) ? { ...routing.get(where.contractId) } : null,
      upsert: async ({ where, update, create }: any) => {
        const next = routing.has(where.contractId)
          ? { ...routing.get(where.contractId), ...update }
          : { ...create };
        routing.set(where.contractId, next);
        return { ...next };
      },
      delete: async ({ where }: any) => {
        if (!routing.delete(where.contractId)) throw new Error('not found');
        return {};
      },
    },
    approvalDecision: {
      // PRIMARY KEY (contractId): a second insert must fail, not overwrite.
      create: async ({ data }: any) => {
        if (decisions.has(data.contractId)) {
          const err: any = new Error(
            'duplicate key value violates unique constraint "ApprovalDecision_pkey"',
          );
          err.code = 'P2002';
          throw err;
        }
        decisions.set(data.contractId, { ...data });
        return { ...data };
      },
      findUnique: async ({ where }: any) =>
        decisions.has(where.contractId) ? { ...decisions.get(where.contractId) } : null,
    },
    $executeRawUnsafe: async (sql: string, key: string) => {
      if (/INSERT INTO job_claim/i.test(sql)) {
        stats.claimInserts += 1;
        if (claims.has(key)) return 0; // ON CONFLICT DO NOTHING
        claims.add(key);
        return 1;
      }
      if (/DELETE FROM job_claim/i.test(sql)) {
        stats.claimDeletes += 1;
        return claims.delete(key) ? 1 : 0;
      }
      return 0;
    },
  };
  return { enabled: true, client, _routing: routing, _decisions: decisions, _claims: claims, _stats: stats } as any;
}

const contract = { id: 'CTR-1', title: 'Zenoti MSA', counterparty: 'Zenoti', valueDisplay: '₹1.2 Cr', version: 'v1' } as any;

function makeWorkflow(prisma: any, sendStatus: 'sent' | 'failed' | 'dry-run' = 'sent') {
  const audited: any[] = [];
  return {
    audited,
    svc: new WorkflowService(
      { getByIdFresh: async () => contract } as any,
      {
        getReview: async () => ({
          riskLevel: 'medium', riskScore: 40, model: 'local',
          deviations: [], summary: 'stub', clauses: [],
          documentId: 'DOC-1', documentSha256: 'approved-document-hash', contractVersion: 'v1',
        }),
      } as any,
      {
        sendEmail: async () => ({
          status: sendStatus, to: [], subject: '', channel: 'outlook-email',
          dryRun: sendStatus === 'dry-run', sentAt: '',
        }),
      } as any,
      { record: async (e: any) => { audited.push(e); return e; }, aiProvenance: () => ({}) } as any,
      { findRole: async () => 'approver' } as any,
      prisma,
    ),
  };
}

describe('Approval routing — the DATABASE path (C-D6)', () => {
  it('writes routing to the table, not to a per-process Map', async () => {
    const db = fakeDb();
    const { svc } = makeWorkflow(db);
    await svc.requestApproval('CTR-1', { approvers: ['Approver@X.com'] } as any, 'sagnik@x.com');

    // The row is in the store a second replica would read.
    expect(db._routing.get('CTR-1').approvers).toEqual(['approver@x.com']);

    // A DIFFERENT service instance — a restart, a deploy, another replica —
    // sees the same routing. This is the failure the finding describes: the
    // legitimate approver used to get a 403 after any restart.
    const { svc: otherReplica } = makeWorkflow(db);
    const seen = await (otherReplica as any).loadRouting('CTR-1');
    expect(seen.approvers).toContain('approver@x.com');
  });

  it('rolls the previous routing back when the email cannot be delivered', async () => {
    const db = fakeDb();
    const { svc: ok } = makeWorkflow(db, 'sent');
    await svc_route(ok, ['first@x.com']);
    expect(db._routing.get('CTR-1').approvers).toEqual(['first@x.com']);

    // Re-route to someone else, and the send fails. Routing is an upsert, so
    // without a rollback the first approver is revoked and the second was never
    // emailed — the contract becomes approvable by nobody, under an error
    // message that says nothing happened.
    const { svc: failing } = makeWorkflow(db, 'failed');
    await expect(svc_route(failing, ['second@x.com'])).rejects.toThrow(/could not be emailed/i);
    expect(db._routing.get('CTR-1').approvers).toEqual(['first@x.com']);
  });

  it('clears routing entirely when the FIRST routing attempt fails', async () => {
    const db = fakeDb();
    const { svc } = makeWorkflow(db, 'failed');
    await expect(svc_route(svc, ['nobody@x.com'])).rejects.toThrow();
    expect(db._routing.has('CTR-1')).toBe(false);
  });

  it('treats a dry-run as NOT delivered in production (C-D26)', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const db = fakeDb();
      const { svc, audited } = makeWorkflow(db, 'dry-run');
      await expect(svc_route(svc, ['approver@x.com'])).rejects.toThrow(/could not be emailed/i);
      expect(audited.some((e) => e.action === 'approval.route_failed')).toBe(true);
      expect(audited.some((e) => e.action === 'approval.requested')).toBe(false);
      expect(db._routing.has('CTR-1')).toBe(false);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});

function svc_route(svc: WorkflowService, approvers: string[]) {
  return svc.requestApproval('CTR-1', { approvers } as any, 'sagnik@x.com');
}

describe('Approval decision — the DATABASE path (C-D8)', () => {
  it('makes the first decision durable in the same statement that claims it', async () => {
    const db = fakeDb();
    const { svc } = makeWorkflow(db);
    const first = await (svc as any).claimDecision({
      contractId: 'CTR-1', decision: 'approved', decidedBy: 'a@x.com',
      decidedAt: new Date().toISOString(), tokenVerified: true,
    });
    expect(first.first).toBe(true);
    // The row exists — a crash here loses nothing.
    expect(db._decisions.get('CTR-1').decision).toBe('approved');
    expect(db._decisions.get('CTR-1').tokenVerified).toBe(true);
  });

  it('reports the STORED decision on a conflicting second attempt', async () => {
    const db = fakeDb();
    const { svc } = makeWorkflow(db);
    await (svc as any).claimDecision({
      contractId: 'CTR-1', decision: 'approved', decidedBy: 'a@x.com', decidedAt: new Date().toISOString(),
    });
    const second = await (svc as any).claimDecision({
      contractId: 'CTR-1', decision: 'rejected', decidedBy: 'b@x.com', decidedAt: new Date().toISOString(),
    });
    expect(second.first).toBe(false);
    expect(second.decision.decision).toBe('approved');
    expect(second.decision.decidedBy).toBe('a@x.com');
  });

  it('does NOT reinterpret a connection failure as "someone already decided"', async () => {
    // Catching every error and then reading the table would return this caller's
    // own row and report `first: false` — telling the real approver they were
    // too late, and skipping the audit event for a decision that DID happen.
    const db = fakeDb();
    const { svc } = makeWorkflow(db);
    db.client.approvalDecision.create = async () => {
      throw new Error('Connection terminated unexpectedly');
    };
    await expect(
      (svc as any).claimDecision({
        contractId: 'CTR-9', decision: 'approved', decidedBy: 'a@x.com', decidedAt: new Date().toISOString(),
      }),
    ).rejects.toThrow(/Connection terminated/);
  });
});

describe('JobsService — the DATABASE path (C-D33)', () => {
  it('claims through INSERT … ON CONFLICT, and only one caller wins', async () => {
    const db = fakeDb();
    const jobs = new JobsService(db);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => jobs.claimOnce('race-key')),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(db._stats.claimInserts).toBe(10); // every caller really hit the table
  });

  it('REFUSES a claim it cannot make durably, rather than falling back', async () => {
    // Falling back to an in-process Set here is exactly wrong under autoscale:
    // every replica would believe it won.
    const db = fakeDb();
    const jobs = new JobsService(db);
    db.client.$executeRawUnsafe = async () => {
      throw new Error('ECONNRESET');
    };
    await expect(jobs.claimOnce('k')).rejects.toThrow(/ECONNRESET/);
    await expect(jobs.alreadyProcessed('k')).rejects.toThrow(/ECONNRESET/);
  });

  it('gives the claim back when the work fails, so a retry can succeed', async () => {
    // A claim marks work DONE but is necessarily taken BEFORE the work runs.
    // Holding it over a failure turns a retryable error into a permanent one:
    // the provider redelivers and we answer "already processed".
    const db = fakeDb();
    const jobs = new JobsService(db);
    await expect(
      jobs.runOnce('webhook:1', async () => {
        throw new Error('storage unavailable');
      }),
    ).rejects.toThrow(/storage unavailable/);
    expect(db._claims.has('webhook:1')).toBe(false);

    // The provider's retry now actually re-runs the work.
    const retry = await jobs.runOnce('webhook:1', async () => 'archived');
    expect(retry).toEqual({ duplicate: false, result: 'archived' });
  });

  it('still dedupes a genuine duplicate', async () => {
    const db = fakeDb();
    const jobs = new JobsService(db);
    await jobs.runOnce('webhook:2', async () => 'done');
    expect(await jobs.runOnce('webhook:2', async () => 'done again')).toEqual({ duplicate: true });
  });

  it('prunes claim rows so the table cannot grow without bound', async () => {
    const db = fakeDb();
    const jobs = new JobsService(db);
    const res = await jobs.pruneClaims();
    expect(res).not.toBeNull();
    expect(db._stats.claimDeletes).toBeGreaterThan(0);
  });
});
