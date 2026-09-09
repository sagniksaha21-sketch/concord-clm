import { AuditService } from '../../src/audit/audit.service';

const fakePrisma = { enabled: false, client: null } as any;

describe('Immutable, hash-chained audit trail (C2)', () => {
  it('chains events and verifies intact', async () => {
    const audit = new AuditService(fakePrisma);
    const e1 = await audit.record({ action: 'a.one', entity: 'x', summary: 's1' });
    const e2 = await audit.record({ action: 'a.two', entity: 'x', summary: 's2' });
    expect(e1 && e2).toBeTruthy();
    expect(e2!.prevHash).toBe(e1!.hash); // chain links
    expect(e1!.seq).toBe(1);
    expect(e2!.seq).toBe(2);
    const v = await audit.verify();
    expect(v.ok).toBe(true);
    expect(v.count).toBe(2);
  });

  it('detects tampering anywhere in the chain', async () => {
    const audit = new AuditService(fakePrisma);
    await audit.record({ action: 'a.one', entity: 'x', summary: 's1' });
    await audit.record({ action: 'a.two', entity: 'x', summary: 's2' });
    await audit.record({ action: 'a.three', entity: 'x', summary: 's3' });
    // Tamper: mutate the middle event's content directly.
    (audit as any).events[1].summary = 'ALTERED';
    const v = await audit.verify();
    expect(v.ok).toBe(false);
    expect(v.brokenAt).toBe(2);
  });

  it('marks AI provenance as advisory only', () => {
    const audit = new AuditService(fakePrisma);
    const prov = audit.aiProvenance('review');
    expect(prov.advisory).toBe(true);
    expect(prov.capability).toBe('review');
  });

  it('filters and limits the log for readers', async () => {
    const audit = new AuditService(fakePrisma);
    await audit.record({ action: 'esign.sent', entity: 'signature', entityId: 'SIG-1', summary: 's' });
    await audit.record({ action: 'approval.approved', entity: 'contract', entityId: 'C-1', summary: 's' });
    const onlySig = await audit.list({ entity: 'signature' });
    expect(onlySig).toHaveLength(1);
    expect(onlySig[0].entityId).toBe('SIG-1');
  });
});
