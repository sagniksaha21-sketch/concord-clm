import { AuditService } from '../../src/audit/audit.service';

/**
 * Finding C-D1 — "audit events are silently lost under autoscale".
 *
 * `seq` is UNIQUE in the database, but it used to be allocated from a
 * per-process cache. That is correct on exactly one replica and wrong on two:
 * both compute the same next `seq`, one INSERT wins, the other raises a unique
 * violation which was caught, logged, and swallowed — while the business action
 * carried on. Under the deployment's 1→5 autoscale profile that means an
 * evidentiary log that quietly stops recording some of what happened.
 *
 * This fake Postgres models the two things that make the bug visible: a UNIQUE
 * constraint on `seq`, and a transaction-scoped advisory lock. Two AuditService
 * instances share it, standing in for two replicas.
 */
function fakePostgres() {
  const rows: any[] = [];
  let locked = false;
  const waiters: Array<() => void> = [];

  const acquire = async () => {
    while (locked) await new Promise<void>((r) => waiters.push(r));
    locked = true;
  };
  const release = () => {
    locked = false;
    const next = waiters.shift();
    if (next) next();
  };

  let anchorRow: any = null;
  const anchorTable = {
    findUnique: async () => (anchorRow ? { ...anchorRow } : null),
    upsert: async ({ update, create }: any) => {
      anchorRow = anchorRow ? { ...anchorRow, ...update } : { ...create };
      return { ...anchorRow };
    },
  };

  const table = {
    findUnique: async ({ where }: any) => {
      const r = rows.find((x) => x.id === where.id);
      return r ? { ...r } : null;
    },
    findFirst: async ({ orderBy, where }: any = {}) => {
      let candidates = rows;
      if (where?.seq?.gte !== undefined) candidates = rows.filter((r) => r.seq >= where.seq.gte);
      if (typeof where?.seq === 'number') candidates = rows.filter((r) => r.seq === where.seq);
      if (!candidates.length) return null;
      const sorted = [...candidates].sort((a, b) =>
        orderBy?.seq === 'desc' ? b.seq - a.seq : a.seq - b.seq,
      );
      return { ...sorted[0] };
    },
    findMany: async ({ where, orderBy, take, skip }: any = {}) => {
      let out = [...rows];
      if (where?.seq?.gte !== undefined) out = out.filter((r) => r.seq >= where.seq.gte);
      if (where?.entity) out = out.filter((r) => r.entity === where.entity);
      out.sort((a, b) => (orderBy?.seq === 'desc' ? b.seq - a.seq : a.seq - b.seq));
      if (skip) out = out.slice(skip);
      if (take) out = out.slice(0, take);
      return out.map((r) => ({ ...r }));
    },
    count: async ({ where }: any = {}) => {
      if (where?.entity) return rows.filter((r) => r.entity === where.entity).length;
      return rows.length;
    },
    create: async ({ data }: any) => {
      // The real UNIQUE(seq) constraint — this is what used to fire.
      if (rows.some((r) => r.seq === data.seq)) {
        throw new Error(`duplicate key value violates unique constraint "AuditEvent_seq_key"`);
      }
      rows.push({ ...data });
      return { ...data };
    },
  };

  const client: any = {
    auditEvent: table,
    auditAnchor: anchorTable,
    $transaction: async (fn: (tx: any) => Promise<any>) => {
      let took = false;
      const tx = {
        auditEvent: table,
        auditAnchor: anchorTable,
        $executeRawUnsafe: async () => 0, // SET LOCAL lock_timeout
        $queryRawUnsafe: async (sql: string) => {
          // PostgreSQL returns void for a bare lock-function projection; Prisma
          // rejects that result before any event can be appended.
          if (/^SELECT\s+pg_advisory_xact_lock/i.test(sql)) throw new Error('Failed to deserialize column of type void');
          if (/pg_advisory_xact_lock/.test(sql)) {
            await acquire();
            took = true;
            return [{}];
          }
          return [];
        },
      };
      try {
        return await fn(tx);
      } finally {
        // transaction-scoped lock: released on commit OR rollback
        if (took) release();
      }
    },
  };

  return {
    enabled: true,
    client,
    _rows: rows,
    _anchor: () => anchorRow,
    _setAnchor: (v: any) => {
      anchorRow = v;
    },
  } as any;
}

describe('Audit chain allocation under autoscale (C-D1)', () => {
  it('gives every event a distinct seq across two replicas writing at once', async () => {
    const db = fakePostgres();
    const replicaA = new AuditService(db);
    const replicaB = new AuditService(db);
    await Promise.all([replicaA.onModuleInit(), replicaB.onModuleInit()]);

    // 20 concurrent appends split across both replicas.
    const writes: Promise<unknown>[] = [];
    for (let i = 0; i < 10; i++) {
      writes.push(replicaA.record({ action: 'a.write', entity: 'x', summary: `A${i}` }));
      writes.push(replicaB.record({ action: 'b.write', entity: 'x', summary: `B${i}` }));
    }
    const results = await Promise.all(writes);

    // Nothing was dropped...
    expect(results.every((r) => r !== null)).toBe(true);
    expect(db._rows).toHaveLength(20);
    // ...every seq is unique and contiguous...
    const seqs = db._rows.map((r: any) => r.seq).sort((a: number, b: number) => a - b);
    expect(seqs).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    // ...and neither replica is reporting a degraded trail.
    expect(replicaA.degraded).toBe(false);
    expect(replicaB.degraded).toBe(false);
  });

  it('produces a chain that verifies end to end after concurrent writes', async () => {
    const db = fakePostgres();
    const a = new AuditService(db);
    const b = new AuditService(db);
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        (i % 2 ? b : a).record({ action: 'x.y', entity: 'e', summary: `s${i}` }),
      ),
    );
    const v = await a.verify();
    expect(v.ok).toBe(true);
    expect(v.count).toBe(12);
  });

  it('continues the chain after a restart instead of restarting at seq 1', async () => {
    const db = fakePostgres();
    const before = new AuditService(db);
    await before.onModuleInit();
    await before.record({ action: 'a', entity: 'e', summary: 'first' });
    await before.record({ action: 'b', entity: 'e', summary: 'second' });

    // A brand-new process against the same database.
    const after = new AuditService(db);
    await after.onModuleInit();
    const next = await after.record({ action: 'c', entity: 'e', summary: 'third' });
    expect(next!.seq).toBe(3);
    expect((await after.verify()).ok).toBe(true);
  });

  it('marks itself degraded when a durable write fails, and says why', async () => {
    const db = fakePostgres();
    const audit = new AuditService(db);
    db.client.auditEvent.create = async () => {
      throw new Error('connection terminated');
    };
    process.env.AUDIT_WRITE_RETRIES = '0';
    process.env.AUDIT_STRICT = 'false';
    const res = await audit.record({ action: 'a', entity: 'e', summary: 's' });
    delete process.env.AUDIT_WRITE_RETRIES;
    delete process.env.AUDIT_STRICT;

    expect(res).toBeNull();
    expect(audit.degraded).toBe(true);
    expect(audit.degradedReason).toMatch(/connection terminated/);
    // And verification refuses to attest a trail known to be incomplete.
    const v = await audit.verify();
    expect(v.ok).toBe(false);
    expect(v.message).toMatch(/cannot be attested/i);
  });

  it('throws to the caller in strict mode rather than losing the event quietly', async () => {
    const db = fakePostgres();
    const audit = new AuditService(db);
    db.client.auditEvent.create = async () => {
      throw new Error('disk full');
    };
    process.env.AUDIT_WRITE_RETRIES = '0';
    process.env.AUDIT_STRICT = 'true';
    await expect(audit.record({ action: 'a', entity: 'e', summary: 's' })).rejects.toThrow(/disk full/);
    delete process.env.AUDIT_WRITE_RETRIES;
    delete process.env.AUDIT_STRICT;
  });

  it('detects DELETED events instead of attesting an intact chain', async () => {
    // The hash chain proves the events that REMAIN are unaltered; on its own it
    // cannot see deletion. Truncate the table and a naive chain walk finds
    // nothing wrong — it would report "Chain intact — 0 events verified".
    const db = fakePostgres();
    const audit = new AuditService(db);
    for (let i = 0; i < 6; i++) {
      await audit.record({ action: 'x', entity: 'e', summary: `s${i}` });
    }
    expect((await audit.verify()).ok).toBe(true);

    // Someone deletes the last two events (say, the approval).
    db._rows.splice(4, 2);
    const afterTailDelete = await audit.verify();
    expect(afterTailDelete.ok).toBe(false);
    expect(afterTailDelete.message).toMatch(/MISSING|deleted/i);

    // And a full wipe is not "intact" either.
    db._rows.length = 0;
    const afterWipe = await audit.verify();
    expect(afterWipe.ok).toBe(false);
  });

  it('does not double-record when a commit succeeds but the client then fails', async () => {
    // A transaction can COMMIT and the client still see an error (dropped
    // connection, a timeout firing after COMMIT). Retrying with a fresh id
    // would write the same business event twice — and the chain would verify
    // happily over a trail claiming the contract was approved twice.
    const db = fakePostgres();
    const audit = new AuditService(db);
    const realTx = db.client.$transaction;
    let calls = 0;
    db.client.$transaction = async (fn: any) => {
      calls += 1;
      const result = await realTx(fn);
      if (calls === 1) throw new Error('connection reset after COMMIT');
      return result;
    };
    const e = await audit.record({ action: 'approval.approved', entity: 'contract', summary: 'once' });
    expect(e).toBeTruthy();
    expect(db._rows.filter((r: any) => r.action === 'approval.approved')).toHaveLength(1);
    expect((await audit.verify()).ok).toBe(true);
  });

  it('does not brick the replica because a READ failed', async () => {
    // A failed read loses no evidence. Marking degraded on it would let one slow
    // admin query fail readiness permanently.
    const db = fakePostgres();
    const audit = new AuditService(db);
    await audit.record({ action: 'a', entity: 'e', summary: 's' });
    const good = db.client.auditEvent.findMany;
    db.client.auditEvent.findMany = async () => {
      throw new Error('statement timeout');
    };
    await audit.list({ limit: 10 });
    db.client.auditEvent.findMany = good;
    expect(audit.degraded).toBe(false);
    expect((await audit.verify()).ok).toBe(true);
  });

  it('stops fetching once the export cap is reached', async () => {
    const db = fakePostgres();
    const audit = new AuditService(db);
    for (let i = 0; i < 1200; i++) {
      await audit.record({ action: 'x', entity: 'e', summary: `s${i}` });
    }
    let queries = 0;
    const good = db.client.auditEvent.findMany;
    db.client.auditEvent.findMany = async (args: any) => {
      queries += 1;
      return good(args);
    };
    process.env.AUDIT_EXPORT_MAX_EVENTS = '10';
    const out = await audit.all();
    delete process.env.AUDIT_EXPORT_MAX_EVENTS;
    db.client.auditEvent.findMany = good;
    expect(out).toHaveLength(10);
    // One page, not the whole table (1200 rows / 500 per page = 3 pages).
    expect(queries).toBe(1);
  });

  it('pages reads instead of loading the whole table (C-D5)', async () => {
    const db = fakePostgres();
    const audit = new AuditService(db);
    for (let i = 0; i < 25; i++) {
      await audit.record({ action: 'x', entity: i % 2 ? 'odd' : 'even', summary: `s${i}` });
    }
    const page = await audit.list({ limit: 10 });
    expect(page).toHaveLength(10);
    expect(page[0].seq).toBe(25); // most recent first
    const second = await audit.list({ limit: 10, offset: 10 });
    expect(second[0].seq).toBe(15);
    expect(await audit.count()).toBe(25);
    expect(await audit.count({ entity: 'odd' })).toBe(12);
    // The cap holds even when a caller asks for everything.
    expect(await audit.list({ limit: 10_000 })).toHaveLength(25);
  });
});
