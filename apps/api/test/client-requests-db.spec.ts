import { randomUUID } from 'crypto';
import type { AuthUser } from '@concord/shared';
import { AuditService } from '../src/audit/audit.service';
import { AuthService } from '../src/auth/auth.service';
import { IntakeService } from '../src/intake/intake.service';
import { ContractsService } from '../src/contracts/contracts.service';
import { ClientRequestsService } from '../src/client-requests/client-requests.service';
import { RequestInboxService } from '../src/client-requests/request-inbox.service';
import { CreateClientRequestDto } from '../src/client-requests/client-request.dto';
import * as graph from '../src/notifications/graph.client';

const describeDb = process.env.REQUEST_TEST_DATABASE_URL ? describe : describe.skip;
describeDb('Department portal on PostgreSQL', () => {
  let db: any; let prisma: any; let audit: AuditService; let service: ClientRequestsService; let inbox: RequestInboxService;
  const mail = { sendEmail: jest.fn() }; let configured: jest.SpyInstance;
  const actors: Record<string, AuthUser> = Object.fromEntries(['requester', 'other-client', 'counsel', 'other-lawyer', 'lead', 'admin', 'viewer'].map(key => [key, { id: key, name: `UAT ${key}`, email: `${key}@example.test`, role: key === 'other-client' ? 'requester' : key === 'other-lawyer' ? 'counsel' : key }]));
  const dto = (): CreateClientRequestDto => ({ submissionKey: randomUUID(), title: 'UAT <equipment> supply', counterparty: 'UAT Supplier', businessUnit: 'Procurement', contractType: 'Vendor Agreement', assignedLegalUserId: actors.counsel.id, requestedByDate: '2026-10-01', urgency: 'standard', terms: { scope: 'Supply equipment against milestones.', currency: 'INR', amount: '25000', paymentTerms: '30 days after acceptance', dataInvolved: 'none' } });
  beforeAll(async () => {
    const url = new URL(process.env.REQUEST_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/concord_requests_test') throw new Error('Refusing to run fixture mutations outside the local dedicated test database.');
    const { PrismaClient } = require('@prisma/client'); db = new PrismaClient({ datasources: { db: { url: url.toString() } } }); await db.$connect();
    prisma = { enabled: true, client: db }; audit = new AuditService(prisma);
    service = new ClientRequestsService(prisma, new IntakeService(prisma), audit); inbox = new RequestInboxService(prisma, mail as any, audit);
    configured = jest.spyOn(graph, 'isGraphConfigured');
  });
  beforeEach(async () => {
    // The hostname + database-name guard above is mandatory for this cleanup.
    await db.$executeRawUnsafe('TRUNCATE TABLE "RequestNotification", "IntakeRequest", "Contract", "User", "AuditEvent", "AuditAnchor" CASCADE');
    await db.user.createMany({ data: Object.values(actors).map(a => ({ ...a, password: '', roleSource: 'manual' })) });
    configured.mockReturnValue(false); mail.sendEmail.mockReset();
  });
  afterAll(async () => { configured?.mockRestore(); await db?.$disconnect(); });

  it('saves the request, linked agreement, selected lawyer, inbox and audit atomically', async () => {
    const result = await service.create(dto(), actors.requester);
    expect(result.assignedLegal.id).toBe('counsel'); expect(result.requester.id).toBe('requester'); expect(result.terms.paymentTerms).toContain('30 days');
    expect(result.emailStatus).toBe('awaiting-configuration'); expect(result.canOpenAgreement).toBe(false); expect(result.canManage).toBe(false);
    const contract = await new ContractsService(prisma).getByIdFresh(result.contractId); expect(contract.requestId).toBe(result.id); expect(contract.stage).toBe('intake');
    expect((await inbox.list(actors.counsel)).unreadCount).toBe(1); expect((await inbox.list(actors.requester)).unreadCount).toBe(0);
    expect(await db.auditEvent.count({ where: { entityId: result.id, action: 'request.submitted' } })).toBe(1);
    const reload = new ClientRequestsService(prisma, new IntakeService(prisma), new AuditService(prisma)); expect((await reload.get(result.id, actors.requester)).terms.scope).toBe(dto().terms.scope);
  });
  it('handles simultaneous retries without duplicate contracts, inbox items or audit entries', async () => {
    const body = dto(); const [a,b] = await Promise.all([service.create(body, actors.requester), service.create(body, actors.requester)]);
    expect(a.id).toBe(b.id); expect(await db.contract.count()).toBe(1); expect(await db.requestNotification.count()).toBe(1); expect(await db.auditEvent.count()).toBe(1);
    await expect(service.create({ ...body, title: 'Different payload' }, actors.requester)).rejects.toThrow('already used');
    await expect(service.create(body, actors['other-client'])).rejects.toThrow('already used');
  });
  it('rolls every new record back when the audit append fails', async () => {
    const fail = jest.spyOn(audit, 'recordInTransaction').mockRejectedValueOnce(new Error('Audit unavailable'));
    await expect(service.create(dto(), actors.requester)).rejects.toThrow('Audit unavailable'); fail.mockRestore();
    expect(await db.contract.count()).toBe(0); expect(await db.intakeRequest.count()).toBe(0); expect(await db.requestNotification.count()).toBe(0);
  });
  it('isolates clients and restricts term sheets to the selected lawyer or a legal lead', async () => {
    const item = await service.create(dto(), actors.requester);
    expect((await service.list(actors['other-client'])).total).toBe(0); await expect(service.get(item.id, actors['other-client'])).rejects.toThrow('not found');
    await expect(service.get(item.id, actors['other-lawyer'])).rejects.toThrow('not found'); expect((await service.get(item.id, actors.counsel)).canManage).toBe(true);
    expect((await service.get(item.id, actors.lead)).canManage).toBe(true); await expect(service.list(actors.requester, 'all')).rejects.toThrow('Only');
    const legacy = await new IntakeService(prisma).getById(item.id); expect(legacy).not.toHaveProperty('terms'); expect(legacy).not.toHaveProperty('payloadHash');
  });
  it('rejects nonexistent and nonlegal assignees and removes them from the dropdown', async () => {
    for (const id of ['missing', 'viewer', 'other-client']) await expect(service.create({ ...dto(), assignedLegalUserId: id }, actors.requester)).rejects.toThrow('legal team');
    const opts = await service.options(actors.requester); expect(opts.legalTeam.map(x => x.id).sort()).toEqual(['admin','counsel','lead','other-lawyer'].sort());
    expect(JSON.stringify(opts)).not.toContain('password'); await db.user.update({ where: { id: 'counsel' }, data: { role: 'viewer' } });
    await expect(service.create(dto(), actors.requester)).rejects.toThrow('legal team');
  });
  it('prevents client updates, stale overwrites, and unsaved requests for more information', async () => {
    const item = await service.create(dto(), actors.requester);
    await expect(service.update(item.id, { status: 'closed', version: 0 }, actors.requester)).rejects.toThrow('Only');
    await expect(service.update(item.id, { status: 'waiting-on-client', version: 0 }, actors.counsel)).rejects.toThrow('Explain');
    const update = await service.update(item.id, { status: 'in-progress', legalNote: 'Drafting has started.', version: 0 }, actors.counsel);
    expect(update.version).toBe(1); expect(update.contractStage).toBe('intake');
    await expect(service.update(item.id, { status: 'closed', version: 0 }, actors.counsel)).rejects.toThrow('changed');
    expect((await inbox.list(actors.requester)).items[0].body).toContain('Drafting has started.');
  });
  it('marks only the authenticated recipient’s notifications as read', async () => {
    await service.create(dto(), actors.requester); const notification = (await inbox.list(actors.counsel)).items[0];
    await expect(inbox.markRead(actors['other-lawyer'], notification.id)).rejects.toThrow('not found');
    await inbox.markRead(actors.requester); expect((await inbox.unread(actors.counsel)).unreadCount).toBe(1);
    await inbox.markRead(actors.counsel, notification.id); expect((await inbox.unread(actors.counsel)).unreadCount).toBe(0);
  });
  it('keeps unconfigured email pending, then claims one send across simultaneous workers', async () => {
    const item = await service.create(dto(), actors.requester); await inbox.deliverQueued(); expect(mail.sendEmail).not.toHaveBeenCalled();
    configured.mockReturnValue(true); mail.sendEmail.mockResolvedValue({ status: 'sent', dryRun: false });
    const id = (await inbox.list(actors.counsel)).items[0].id; await Promise.all([inbox.deliver(id), inbox.deliver(id)]);
    expect(mail.sendEmail).toHaveBeenCalledTimes(1); expect(mail.sendEmail.mock.calls[0][0].to).toEqual(['counsel@example.test']);
    expect(mail.sendEmail.mock.calls[0][0].html).toContain('&lt;equipment&gt;'); expect(mail.sendEmail.mock.calls[0][0].html).toContain(`/requests/${item.id}`);
    expect((await service.get(item.id, actors.requester)).emailStatus).toBe('sent');
  });
  it('leaves an unknown remote result unconfirmed instead of re-sending it', async () => {
    configured.mockReturnValue(true); await service.create(dto(), actors.requester); mail.sendEmail.mockRejectedValue(new Error('Connection reset after possible acceptance'));
    const id = (await inbox.list(actors.counsel)).items[0].id; await inbox.deliver(id); await inbox.deliver(id);
    expect((await db.requestNotification.findUnique({ where: { id } })).emailStatus).toBe('uncertain'); expect(mail.sendEmail).toHaveBeenCalledTimes(1);
  });
  it('retries explicit provider rejection and stops at the attempt limit', async () => {
    configured.mockReturnValue(true); await service.create(dto(), actors.requester); mail.sendEmail.mockResolvedValue({ status: 'failed', retrySafe: true });
    const id = (await inbox.list(actors.counsel)).items[0].id;
    for (let i = 0; i < 7; i++) { await db.requestNotification.update({ where: { id }, data: { nextAttemptAt: new Date(0) } }); await inbox.deliver(id); }
    expect(mail.sendEmail).toHaveBeenCalledTimes(5); expect((await db.requestNotification.findUnique({ where: { id } })).emailStatus).toBe('failed');
  });
  it('does not re-send after a worker crash with unknown provider acceptance', async () => {
    await service.create(dto(), actors.requester); const id = (await inbox.list(actors.counsel)).items[0].id;
    await db.requestNotification.update({ where: { id }, data: { emailStatus: 'sending', leaseUntil: new Date(0), claimToken: 'expired-claim' } });
    configured.mockReturnValue(true); await inbox.deliverQueued(); expect(mail.sendEmail).not.toHaveBeenCalled();
    expect((await db.requestNotification.findUnique({ where: { id } })).emailStatus).toBe('uncertain');
  });
  it('adds corporate identities without a password and applies role changes to existing sessions', async () => {
    const auth = new AuthService(prisma, audit);
    const created = await auth.createUser({ name: 'UAT Department', email: 'new-client@example.test', role: 'requester' }, actors.admin);
    expect(created.canonicalRole).toBe('requester'); expect(created).not.toHaveProperty('password'); expect((await db.user.findUnique({ where: { id: created.id } })).password).toBe('');
    await expect(auth.createUser({ name: 'Duplicate', email: created.email, role: 'counsel' }, actors.admin)).rejects.toThrow('already has');
    const token = auth.issueToken(actors.counsel); await auth.setRole(actors.counsel.email, 'requester', actors.admin); expect((await auth.authorizeToken(token)).role).toBe('requester');
    await expect(auth.setRole(actors.admin.email, 'viewer', actors.admin)).rejects.toThrow('another administrator');
  });
});
