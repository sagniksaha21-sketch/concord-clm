import { WorkspaceService } from '../../src/workspace/workspace.service';
import { PERMISSIONS } from '@concord/shared';

/**
 * The Command Center, pipeline board, global search and notification history.
 *
 * The security-relevant part is READ GATING. Step one of the execution-forgery
 * chain closed as S-C1 was a read-only viewer reading provider envelope ids out
 * of an unguarded listing. Any new read surface that returns every entity to
 * every signed-in role re-opens exactly that door under a new name.
 *
 * A round of adversarial review found the FIRST version of these tests to be
 * vacuous: they asserted `not.toContain('MEL-ENV')` against `/api/search`, which
 * never emits an envelope id for ANY role, so the assertion passed with the
 * gating deleted — and it was never applied to `/api/notifications`, which is
 * where the leak actually was. Every gating test below is therefore written to
 * FAIL if its gate is removed, and each one names the mutation it detects.
 */

const ENVELOPE = 'MEL-ENV-SECRET';
const SIGNATORY_EMAIL = 's@zenoti.com';
const APPROVER_EMAIL = 'a@x.com';

const contract = (over: Partial<any> = {}) => ({
  id: 'CLM-1', title: 'Master Services Agreement', counterparty: 'Zenoti Technologies',
  type: 'IT / SaaS', valueDisplay: '₹18.4 Cr', stage: 'review', risk: 'high', version: 'v3',
  source: 'counterparty', ...over,
});

const signature = {
  id: ENVELOPE, contractId: 'CLM-1', contractTitle: 'Zenoti MSA', status: 'sent',
  provider: 'stub', envelopeId: ENVELOPE, createdAt: new Date().toISOString(),
  sentAt: new Date().toISOString(),
  signatories: [{ name: 'Sudheer Koneru', email: SIGNATORY_EMAIL, role: 'Vendor', status: 'sent' }],
  audit: [],
} as any;

const obligation = {
  id: 'OBL-1', title: 'Renewal decision due', contractId: 'CLM-1', contractTitle: 'Zenoti MSA',
  ownerEmail: 'legal@lakmelever.com', ownerInitials: 'LL',
  dueDate: new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10),
  status: 'due-soon', type: 'renewal', risk: 'medium', outlookScheduled: true,
} as any;

const intakeRow = {
  id: 'INT-1', title: 'SAP AMS renewal', counterparty: 'SAP India', businessUnit: 'IT',
  requestor: 'it@lakmelever.com', contractType: 'IT / SaaS', description: 'renewal',
  status: 'triaged', createdAt: '2026-01-01',
} as any;

/**
 * Audit rows whose SUMMARIES carry exactly the data the audit endpoint gates:
 * a provider envelope id and a routed approver's address. If the notification
 * history echoes summaries instead of rebuilding them, these strings surface.
 */
const AUDIT_ROWS = [
  {
    id: 'a1', seq: 1, at: new Date().toISOString(), actor: {}, action: 'approval.requested',
    entity: 'contract', entityId: 'CLM-1',
    summary: `Routed for approval to ${APPROVER_EMAIL}`,
    metadata: { routedTo: [APPROVER_EMAIL], delivery: 'sent' }, prevHash: 'g', hash: 'h',
  },
  {
    id: 'a2', seq: 2, at: new Date().toISOString(), actor: {}, action: 'esign.sent',
    entity: 'signature', entityId: 'SIG-1',
    summary: `Envelope ${ENVELOPE} sent to ${SIGNATORY_EMAIL}`,
    metadata: { delivery: 'sent' }, prevHash: 'h', hash: 'i',
  },
  {
    id: 'a3', seq: 3, at: new Date().toISOString(), actor: {}, action: 'auth.login',
    entity: 'user', summary: 'signed in', prevHash: 'i', hash: 'j',
  },
];

/**
 * The audit fake honours `actions` the way the Prisma `where.OR` does. A fake
 * that ignored the filter would let a service which had dropped its DB-side
 * filter still pass — the exact shape of vacuity this file exists to avoid.
 */
function auditFake(rows = AUDIT_ROWS) {
  const calls: any[] = [];
  return {
    calls,
    list: async (opts: any = {}) => {
      calls.push(opts);
      let out = rows.slice().sort((a, b) => b.seq - a.seq);
      if (opts.actions?.length) {
        out = out.filter((e: any) => opts.actions.some((a: string) => e.action.startsWith(a)));
      }
      return typeof opts.limit === 'number' ? out.slice(0, opts.limit) : out;
    },
  };
}

function make(over: { contracts?: any[]; prismaEnabled?: boolean; audit?: any } = {}) {
  return new WorkspaceService(
    { enabled: over.prismaEnabled ?? false, client: { document: { count: async () => 4 } } } as any,
    { list: () => over.contracts ?? [contract()] } as any,
    { list: async () => [obligation] } as any,
    { list: async () => [signature] } as any,
    { list: async () => [intakeRow] } as any,
    (over.audit ?? auditFake()) as any,
  );
}

describe('Global search respects the permission matrix', () => {
  /**
   * MUTATION DETECTED: delete the `gate('signature', 'esign:send')` check.
   *
   * The fixture's signature id IS the envelope id, so a viewer who receives a
   * signature hit necessarily receives `MEL-ENV-SECRET` in the payload. The
   * earlier version of this test asserted the string alone, which no role could
   * ever have triggered; asserting the KIND is what makes it bite.
   */
  it('does NOT leak signature envelopes to a read-only viewer', async () => {
    const res = await make().search('zenoti', 'viewer');
    const kinds = new Set(res.hits.map((h) => h.kind));
    expect(kinds.has('signature')).toBe(false);
    expect(JSON.stringify(res)).not.toContain(ENVELOPE);
    expect(JSON.stringify(res)).not.toContain(SIGNATORY_EMAIL);
    // The withholding is reported rather than passed off as "no results".
    expect(res.restricted).toContain('signature');
  });

  /**
   * The counter-proof: the SAME query, the SAME fixture, a role that holds
   * `esign:send`, and the envelope id IS present. Without this, a service that
   * had simply stopped returning signature hits at all would pass the test
   * above while providing no evidence the gate is what withheld them.
   */
  it('gives counsel — who holds esign:send — the signature results a viewer cannot see', async () => {
    const res = await make().search('zenoti', 'counsel');
    const kinds = new Set(res.hits.map((h) => h.kind));
    expect(kinds.has('signature')).toBe(true);
    expect(JSON.stringify(res)).toContain(ENVELOPE);
    expect(res.restricted).not.toContain('signature');
  });

  it('gives a viewer the contracts they ARE allowed to read', async () => {
    const res = await make().search('zenoti', 'viewer');
    expect(res.hits.some((h) => h.kind === 'contract')).toBe(true);
  });

  /**
   * Pins search's gate to the gate on the entity's OWN listing route. This is
   * the invariant that keeps search from becoming a bypass: if someone widens
   * `PERMISSIONS.viewer` to include `esign:send`, or narrows search to a
   * different permission, one of these fails.
   */
  it('gates each kind on the SAME permission its own listing requires', async () => {
    expect(PERMISSIONS.viewer).not.toContain('esign:send');
    expect(PERMISSIONS.counsel).toContain('esign:send');

    // …and the behaviour actually follows the matrix, per role, not just the
    // two roles spot-checked above.
    for (const role of ['viewer', 'approver', 'counsel', 'lead', 'admin'] as const) {
      const res = await make().search('zenoti', role);
      const gotSignature = res.hits.some((h) => h.kind === 'signature');
      expect(gotSignature).toBe((PERMISSIONS[role] as readonly string[]).includes('esign:send'));
    }
  });

  it('needs a real query rather than matching everything on an empty string', async () => {
    const svc = make();
    expect((await svc.search('', 'admin')).hits).toHaveLength(0);
    expect((await svc.search(' a ', 'admin')).hits).toHaveLength(0);
  });

  it('caps the number of results returned but reports the true total', async () => {
    const many = Array.from({ length: 60 }, (_, i) => contract({ id: `CLM-${i}` }));
    const res = await make({ contracts: many }).search('master', 'admin', 5);
    expect(res.hits).toHaveLength(5);
    // `count` is the number of matches, not the number returned — the template
    // library also contains a "Master Services Agreement", so this is >= 60.
    expect(res.count).toBeGreaterThanOrEqual(60);
    expect(res.count).toBeGreaterThan(res.hits.length);
  });
});

describe('Command Center reports the portfolio, not a plausible fiction', () => {
  it('computes every figure from the live stores', async () => {
    const d = await make().dashboard('lead', 'Sagnik Saha');
    const byKey = Object.fromEntries(d.stats.map((s) => [s.key, s.value]));
    expect(byKey.contracts).toBe('1');
    expect(byKey.obligations).toBe('1');   // one obligation inside 90 days
    expect(byKey.signature).toBe('1');     // one request out for signature
    expect(byKey.risk).toBe('1');          // one high-risk contract
    expect(d.risk).toEqual({ low: 0, medium: 0, high: 1 });
    expect(d.greetingName).toBe('Sagnik Saha');
  });

  /**
   * MUTATION DETECTED: drop the `maySeeEsign` guard in `dashboard()`.
   *
   * The landing page is the first thing every signed-in role sees. Publishing
   * "N out for signature" on it tells a read-only viewer how many executions
   * are in flight — the same class of disclosure as the search leak, on a page
   * nobody has to navigate to.
   */
  it('withholds e-signature volume from a role that cannot read the e-sign listing', async () => {
    const viewer = await make().dashboard('viewer');
    expect(viewer.stats.some((s) => s.key === 'signature')).toBe(false);
    expect(JSON.stringify(viewer)).not.toContain('signature request');

    const counsel = await make().dashboard('counsel');
    expect(counsel.stats.some((s) => s.key === 'signature')).toBe(true);
  });

  it('says so when the numbers include demo fixtures', async () => {
    // No database configured → the fixtures are in play, and the UI must be told.
    expect((await make({ prismaEnabled: false }).dashboard('lead')).sampleData).toBe(true);
  });

  it('does not claim sample data when a real database is behind it', async () => {
    const prev = process.env.DEMO_SAMPLES;
    delete process.env.DEMO_SAMPLES;
    expect((await make({ prismaEnabled: true }).dashboard('lead')).sampleData).toBe(false);
    if (prev !== undefined) process.env.DEMO_SAMPLES = prev;
  });

  it('derives insights deterministically — no model call on the landing page', async () => {
    const d = await make().dashboard('lead');
    expect(d.insights.length).toBeGreaterThan(0);
    for (const i of d.insights) expect(typeof i.body).toBe('string');
    // Two runs over the same data produce the same statements.
    const again = await make().dashboard('lead');
    expect(again.insights.map((i) => i.id)).toEqual(d.insights.map((i) => i.id));
  });

  it('survives a store that is down rather than failing the whole page', async () => {
    const svc = new WorkspaceService(
      { enabled: false, client: null } as any,
      { list: () => [contract()] } as any,
      { list: async () => { throw new Error('obligations unavailable'); } } as any,
      { list: async () => { throw new Error('esign unavailable'); } } as any,
      { list: async () => [] } as any,
      auditFake([]) as any,
    );
    const d = await svc.dashboard('lead');
    expect(d.stats.find((s) => s.key === 'contracts')?.value).toBe('1');
    expect(d.stats.find((s) => s.key === 'obligations')?.value).toBe('0');
  });
});

describe('Pipeline board', () => {
  it('places every contract in exactly one lane', async () => {
    const contracts = [
      contract({ id: 'A', stage: 'review' }),
      contract({ id: 'B', stage: 'approval' }),
      contract({ id: 'C', stage: 'active' }),
    ];
    const board = await make({ contracts }).board();
    const placed = board.lanes.flatMap((l) => l.cards.map((c) => c.id)).sort();
    expect(placed).toEqual(['A', 'B', 'C']);
    expect(board.total).toBe(3);
  });
});

describe('Notification history', () => {
  it('reads from the audit trail and keeps only notifying events', async () => {
    const rows = await make().notifications();
    expect(rows.map((r) => r.kind)).toEqual(['esign.sent', 'approval.requested']);
    const approval = rows.find((r) => r.kind === 'approval.requested')!;
    expect(approval.recipients).toEqual([APPROVER_EMAIL]);
    expect(approval.status).toBe('sent');
  });

  /**
   * MUTATION DETECTED: restore the old `describeNotification` that echoed
   * `e.summary`.
   *
   * This is the assertion whose ABSENCE let the real CRITICAL through. The
   * previous round asserted `not.toContain('MEL-ENV')` against `/api/search`,
   * where no role ever receives an envelope id, and never against this method,
   * where every role did. The fixture summaries above are written to carry both
   * an envelope id and a routed approver's address precisely so this bites.
   */
  it('rebuilds each line from safe fields — never echoing the raw audit summary', async () => {
    const payload = JSON.stringify(await make().notifications());
    expect(payload).not.toContain(ENVELOPE);
    expect(payload).not.toContain(SIGNATORY_EMAIL);
    expect(payload).not.toContain('Envelope');
    // The description still has to be useful, not merely redacted.
    const rows = await make().notifications();
    expect(rows.find((r) => r.kind === 'esign.sent')!.summary).toBe(
      'Signature request dispatched to the signatories · SIG-1',
    );
  });

  /**
   * MUTATION DETECTED: move the action filter back out of the query and into a
   * post-fetch `.filter()`.
   *
   * "Newest N events of any kind, filtered afterwards" goes permanently empty
   * once N non-notifying events accumulate after the last notification — days,
   * not months, since every request writes one. The assertion is on the QUERY,
   * because the symptom only appears at a data volume a unit test will not
   * reach.
   */
  it('filters by action in the database rather than after the fetch', async () => {
    const audit = auditFake();
    await make({ audit }).notifications(50);
    expect(audit.calls).toHaveLength(1);
    expect(audit.calls[0].actions).toEqual(expect.arrayContaining(['approval.requested', 'esign.sent']));
    expect(audit.calls[0].limit).toBe(50);
  });

  it('clamps the caller-supplied limit', async () => {
    const audit = auditFake();
    await make({ audit }).notifications(9_999);
    expect(audit.calls[0].limit).toBe(200);
  });
});

describe('Sidebar counts', () => {
  /**
   * The badge must not be a side channel: a count the role could not obtain by
   * visiting the page it labels is a disclosure, however small the number.
   */
  it('does not count what the role cannot see', async () => {
    const viewer = await make().navCounts('viewer');
    expect(viewer.esign).toBe(0);
    const counsel = await make().navCounts('counsel');
    expect(counsel.esign).toBe(1);
    // Intake carries no stricter role than contract:read, so the badge matches
    // the page for every signed-in role — asserting 0 here would pin the badge
    // to a gate the intake route does not actually have.
    expect(viewer.intake).toBe(1);
    expect(counsel.intake).toBe(1);
  });

  it('caches per role rather than serving one role the other role\'s counts', async () => {
    const svc = make();
    const viewer = await svc.navCounts('viewer');
    const counsel = await svc.navCounts('counsel');
    expect(viewer.esign).toBe(0);
    expect(counsel.esign).toBe(1);
    // …and back again, within the TTL, still correct for the first role.
    expect((await svc.navCounts('viewer')).esign).toBe(0);
  });
});
