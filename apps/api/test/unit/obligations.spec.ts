import { ObligationsService } from '../../src/obligations/obligations.service';

/**
 * Finding C-D21 — obligations were computed from static fixtures, `remind`
 * 404'd on every signature-derived row, and the daily digest to the legal
 * mailbox was a list of fictional commitments.
 */

const sentAt = new Date(Date.now() - 5 * 24 * 3600_000).toISOString();

const liveSignature = {
  id: 'SIG-2026-014',
  contractId: 'ARC-SIG-2026-014',
  contractTitle: 'HGS Payroll Outsourcing Agreement',
  status: 'sent',
  provider: 'stub',
  createdAt: sentAt,
  sentAt,
  signatories: [
    { name: 'Rahul Verma', email: 'rahul.verma@hgs.example', role: 'Vendor', status: 'sent' },
  ],
  audit: [],
} as any;

function makeService(opts: { prismaEnabled?: boolean; documents?: any[] } = {}) {
  const prisma = {
    enabled: opts.prismaEnabled ?? true,
    client: {
      document: { findMany: async () => opts.documents ?? [] },
    },
  } as any;
  const sent: any[] = [];
  const notifications = {
    sendEmail: async (p: any) => {
      sent.push(p);
      return { status: 'dry-run', to: p.to, subject: p.subject, channel: 'outlook-email', dryRun: true, sentAt: '' };
    },
  } as any;
  const esign = { list: async () => [liveSignature] } as any;
  const recorded: any[] = [];
  const audit = {
    record: async (e: any) => {
      recorded.push(e);
      return e;
    },
  } as any;
  return {
    svc: new ObligationsService(notifications, prisma, esign, audit),
    sent,
    recorded,
  };
}

describe('Obligations are derived from live data (C-D21)', () => {
  const ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...ENV };
  });

  it('derives signature obligations from the live e-sign store', async () => {
    const { svc } = makeService();
    const list = await svc.list();
    const sig = list.find((o) => o.type === 'signature');
    expect(sig).toBeTruthy();
    expect(sig!.contractTitle).toBe('HGS Payroll Outsourcing Agreement');
    expect(sig!.ownerEmail).toBe('rahul.verma@hgs.example');
  });

  it('resolves a signature-derived obligation by id, so remind does not 404', async () => {
    const { svc, sent } = makeService();
    const list = await svc.list();
    const sig = list.find((o) => o.type === 'signature')!;
    // Previously getById only searched the static array — this threw NotFound.
    await expect(svc.getById(sig.id)).resolves.toMatchObject({ id: sig.id });
    const res = await svc.remind(sig.id);
    expect(res.status).toBe('dry-run');
    expect(sent[0].to).toEqual(['rahul.verma@hgs.example']);
  });

  it('does NOT mix sample fixtures into a real portfolio', async () => {
    delete process.env.DEMO_SAMPLES;
    const { svc } = makeService({ prismaEnabled: true });
    const list = await svc.list();
    // With a database configured and DEMO_SAMPLES unset, every row must come
    // from a live store — nothing invented.
    expect(list.every((o) => o.id.startsWith('OBL-SIG') || o.id.startsWith('OBL-DOC'))).toBe(true);
  });

  it('shows sample fixtures only when demo mode is explicit', async () => {
    process.env.DEMO_SAMPLES = 'true';
    const { svc } = makeService({ prismaEnabled: true });
    const list = await svc.list();
    expect(list.some((o) => !o.id.startsWith('OBL-SIG') && !o.id.startsWith('OBL-DOC'))).toBe(true);
  });

  it('derives renewal obligations from extracted document expiry dates', async () => {
    const expiry = new Date(Date.now() + 30 * 24 * 3600_000).toISOString().slice(0, 10);
    const { svc } = makeService({
      documents: [{ id: 'doc-1', filename: 'zenoti-msa.pdf', extraction: { expiryDate: expiry } }],
    });
    const list = await svc.list();
    const renewal = list.find((o) => o.type === 'renewal');
    expect(renewal).toBeTruthy();
    expect(renewal!.dueDate).toBe(expiry);
    expect(renewal!.status).toBe('due-soon');
  });

  it('builds the digest from the same live rows it displays', async () => {
    const { svc } = makeService();
    const digest = await svc.buildDigest(365);
    const list = await svc.upcoming(365);
    expect(digest.count).toBe(list.length);
    expect(digest.count).toBeGreaterThan(0);
  });
});

/**
 * Every outbound email must leave a row in the immutable trail.
 *
 * Reminders and the digest were the only outbound mail in Concord that recorded
 * nothing: `auth`, `workflow` and `esign` all wrote theirs. The notification
 * history filters on `obligation.` and `digest.` prefixes, so those two branches
 * could never match — the page said "no notifications recorded" on a day the
 * digest had emailed seven obligations to the legal mailbox.
 *
 * The assertions below pair each send with its record, so deleting the audit
 * call fails the test rather than quietly restoring the gap.
 */
describe('Outbound notifications are recorded in the audit trail', () => {
  it('records a reminder, with the recipients and the delivery status', async () => {
    const { svc, sent, recorded } = makeService();
    const list = await svc.list();
    const target = list.find((o) => o.type === 'signature')!;

    await svc.remind(target.id);

    expect(sent).toHaveLength(1);
    expect(recorded).toHaveLength(1);
    const ev = recorded[0];
    expect(ev.action).toBe('obligation.reminded');
    expect(ev.entityId).toBe(target.id);
    expect(ev.metadata.routedTo).toEqual(['rahul.verma@hgs.example']);
    // The delivery outcome is recorded, not assumed: a dry-run is not a send.
    expect(ev.metadata.delivery).toBe('dry-run');
  });

  it('records the digest, with the window and the item count', async () => {
    const { svc, sent, recorded } = makeService();
    const digest = await svc.sendDigest(90, ['legal@lakmelever.com']);

    expect(sent).toHaveLength(1);
    expect(recorded).toHaveLength(1);
    const ev = recorded[0];
    expect(ev.action).toBe('digest.sent');
    expect(ev.metadata.routedTo).toEqual(['legal@lakmelever.com']);
    expect(ev.metadata.itemCount).toBe(digest.count);
    expect(ev.metadata.windowDays).toBe(90);
  });

  /**
   * The email is already gone by the time the trail is written. Throwing here
   * would report a failure for a delivery that actually happened, which is a
   * worse lie than the missing row.
   */
  it('still reports the send when the trail write fails', async () => {
    const { svc } = makeService();
    (svc as any).audit = {
      record: async () => {
        throw new Error('audit trail unavailable');
      },
    };
    await expect(svc.sendDigest(90, ['legal@lakmelever.com'])).resolves.toMatchObject({
      count: expect.any(Number),
    });
  });

  /**
   * Pins the action names to the prefixes the notification history filters on.
   * If either side is renamed alone, the events stop appearing on the page and
   * nothing else fails.
   */
  it('uses action names the notification history actually matches', async () => {
    const { svc, recorded } = makeService();
    const list = await svc.list();
    await svc.remind(list.find((o) => o.type === 'signature')!.id);
    await svc.sendDigest(90, ['legal@lakmelever.com']);

    // Mirrors NOTIFYING_ACTIONS in WorkspaceService.
    const NOTIFYING = ['approval.requested', 'approval.route_failed', 'esign.sent', 'esign.executed', 'obligation.', 'digest.'];
    for (const ev of recorded) {
      expect(NOTIFYING.some((p) => ev.action.startsWith(p))).toBe(true);
    }
  });
});
