import { WorkflowService } from '../../src/workflow/workflow.service';

/**
 * Findings C-D6 (approver lockout) and C-D8 (decision lost between claim and
 * record) and C-D26 (routing audited as successful when the email never went).
 *
 * These drive the service directly with stubbed collaborators so the behaviour
 * is pinned without a database or a tenant.
 */

const contract = {
  id: 'CTR-1',
  title: 'Zenoti MSA',
  counterparty: 'Zenoti',
  valueDisplay: '₹1.2 Cr',
} as any;

function makeService(overrides: Partial<Record<string, any>> = {}) {
  const audited: any[] = [];
  const audit = {
    record: async (e: any) => {
      audited.push(e);
      return e;
    },
    aiProvenance: () => ({ capability: 'review', provider: 'local', advisory: true }),
  } as any;

  const svc = new WorkflowService(
    { getById: () => contract } as any,
    {
      getReview: async () => ({
        riskLevel: 'medium',
        riskScore: 40,
        model: 'local',
        deviations: [],
        summary: 'stub',
        clauses: [],
      }),
    } as any,
    overrides.notifications ??
      ({ sendEmail: async () => ({ status: 'dry-run', to: [], subject: '', channel: 'outlook-email', dryRun: true, sentAt: '' }) } as any),
    audit,
    overrides.auth ?? ({ findRole: async () => 'approver' } as any),
    overrides.prisma ?? ({ enabled: false, client: null } as any),
  );
  return { svc, audited };
}

describe('Approval routing durability (C-D6)', () => {
  it('records routing so a later callback can authorise the approver', async () => {
    const { svc } = makeService();
    await svc.requestApproval('CTR-1', { approvers: ['Approver@Lakmelever.com'] } as any, 'sagnik@lakmelever.com');
    const routing = await (svc as any).loadRouting('CTR-1');
    expect(routing).toBeTruthy();
    // Stored lower-cased so the callback's identity comparison cannot miss on case.
    expect(routing.approvers).toContain('approver@lakmelever.com');
    expect(new Date(routing.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('blocks self-routing (segregation of duties)', async () => {
    const { svc } = makeService();
    await expect(
      svc.requestApproval('CTR-1', { approvers: ['sagnik@lakmelever.com'] } as any, 'sagnik@lakmelever.com'),
    ).rejects.toThrow(/segregation of duties/i);
  });
});

describe('Approval delivery failures are not silent successes (C-D26)', () => {
  it('refuses to record a routing whose email could not be delivered', async () => {
    const { svc, audited } = makeService({
      notifications: {
        sendEmail: async () => ({
          status: 'failed',
          detail: 'Graph 503',
          to: [],
          subject: '',
          channel: 'outlook-email',
          dryRun: false,
          sentAt: '',
        }),
      },
    });
    await expect(
      svc.requestApproval('CTR-1', { approvers: ['approver@lakmelever.com'] } as any, 'sagnik@lakmelever.com'),
    ).rejects.toThrow(/could not be emailed/i);
    // The failure is on the record, and no "approval.requested" claims success.
    expect(audited.some((e) => e.action === 'approval.route_failed')).toBe(true);
    expect(audited.some((e) => e.action === 'approval.requested')).toBe(false);
  });
});

describe('First approval decision is durable at the moment it wins (C-D8)', () => {
  it('stores the decision and reports the stored one on a replay', async () => {
    const { svc } = makeService();
    const first = await (svc as any).claimDecision({
      contractId: 'CTR-1',
      decision: 'approved',
      decidedBy: 'approver@lakmelever.com',
      decidedAt: new Date().toISOString(),
    });
    expect(first.first).toBe(true);

    // A second, conflicting decision does not overwrite — and the caller is told
    // what was actually decided, rather than being handed its own input back.
    const second = await (svc as any).claimDecision({
      contractId: 'CTR-1',
      decision: 'rejected',
      decidedBy: 'someone.else@lakmelever.com',
      decidedAt: new Date().toISOString(),
    });
    expect(second.first).toBe(false);
    expect(second.decision.decision).toBe('approved');
    expect(second.decision.decidedBy).toBe('approver@lakmelever.com');
  });
});
