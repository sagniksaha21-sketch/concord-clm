import { randomUUID, createHash } from 'crypto';
import type { AuthUser } from '@concord/shared';
import { AuditService } from '../src/audit/audit.service';
import { AuthService } from '../src/auth/auth.service';
import { IntakeService } from '../src/intake/intake.service';
import { ContractsService } from '../src/contracts/contracts.service';
import { ClientRequestsService } from '../src/client-requests/client-requests.service';
import { RequestInboxService } from '../src/client-requests/request-inbox.service';
import { CreateClientRequestDto } from '../src/client-requests/client-request.dto';
import { AgreementsService } from '../src/agreements/agreements.service';
import { WorkflowService } from '../src/workflow/workflow.service';
import { ESignService } from '../src/esign/esign.service';
import { FileSecurityService } from '../src/security/file-security.service';
import { ObligationsService } from '../src/obligations/obligations.service';
import { canonicalJson } from '../src/common/canonical-json';
import { IngestionService } from '../src/ingestion/ingestion.service';
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
    await db.$executeRawUnsafe('TRUNCATE TABLE "RequestNotification", "IntakeRequest", "ApprovalRouting", "ApprovalDecision", "SignatureRequest", "ArchivedDocument", "Contract", "User", "AuditEvent", "AuditAnchor" CASCADE');
    await db.user.createMany({ data: Object.values(actors).map(a => ({ ...a, password: '', roleSource: 'manual' })) });
    configured.mockReturnValue(false); mail.sendEmail.mockReset();
  });
  afterAll(async () => { configured?.mockRestore(); await db?.$disconnect(); });

  it('saves the request, linked agreement, selected lawyer, inbox and audit atomically', async () => {
    const result = await service.create(dto(), actors.requester);
    expect(result.assignedLegal.id).toBe('counsel'); expect(result.requester.id).toBe('requester'); expect(result.terms.paymentTerms).toContain('30 days');
    expect(result.emailStatus).toBe('awaiting-configuration'); expect(result.canOpenAgreement).toBe(false); expect(result.canManage).toBe(false);
    const contract = await new ContractsService(prisma).getByIdFresh(result.contractId); expect(contract.requestId).toBe(result.id); expect(contract.stage).toBe('intake');
    expect((await inbox.list(actors.counsel)).unreadCount).toBe(1); expect((await inbox.list(actors.counsel)).items[0].href).toBe(`/contracts/${result.contractId}`); expect((await inbox.list(actors.requester)).unreadCount).toBe(0);
    expect(await db.auditEvent.count({ where: { entityId: result.id, action: 'request.submitted' } })).toBe(1);
    const reload = new ClientRequestsService(prisma, new IntakeService(prisma), new AuditService(prisma)); expect((await reload.get(result.id, actors.requester)).terms.scope).toBe(dto().terms.scope);
  });
  it('handles simultaneous retries without duplicate contracts, inbox items or audit entries', async () => {
    const body = dto(); const [a,b] = await Promise.all([service.create(body, actors.requester), service.create(body, actors.requester)]);
    expect(a.id).toBe(b.id); expect(await db.contract.count()).toBe(1); expect(await db.requestNotification.count()).toBe(1); expect(await db.auditEvent.count()).toBe(1);
    await expect(service.create({ ...body, title: 'Different payload' }, actors.requester)).rejects.toThrow('already used');
    await expect(service.create(body, actors['other-client'])).rejects.toThrow('already used');
  });
  it('skips legacy IDs inserted after migration without overwriting them or colliding across requests', async () => {
    const year = new Date().getFullYear();
    const legacyIds = [1, 2].map(n => `INT-${year}-${String(n).padStart(3, '0')}`);
    await db.intakeRequest.createMany({ data: legacyIds.map(id => ({ id, title: 'Existing legacy intake', counterparty: 'Legacy counterparty', businessUnit: 'Legal', requestor: 'legacy@example.test', contractType: 'NDA', description: 'Preserve this record', status: 'triaged' })) });
    // Deliberately reproduce migrate-then-seed ordering, only in the guarded
    // dedicated test database; production allocation never resets a sequence.
    await db.$queryRawUnsafe("SELECT setval('intake_seq', 1, false)");
    const [a, b] = await Promise.all([service.create(dto(), actors.requester), service.create(dto(), actors.requester)]);
    expect(a.id).not.toBe(b.id); expect(legacyIds).not.toContain(a.id); expect(legacyIds).not.toContain(b.id);
    expect(await db.intakeRequest.count()).toBe(4); expect(await db.contract.count()).toBe(2);
    expect(await db.requestNotification.count()).toBe(2);
    expect((await db.intakeRequest.findUnique({ where: { id: legacyIds[0] } })).description).toBe('Preserve this record');
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
    expect(mail.sendEmail.mock.calls[0][0].html).toContain('&lt;equipment&gt;'); expect(mail.sendEmail.mock.calls[0][0].html).toContain(`/contracts/${item.contractId}`);
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
  it('allocates automatic requests using current workload across concurrent submissions', async () => {
    const a = { ...dto(), assignedLegalUserId: 'auto' };
    const [one, two] = await Promise.all([service.create(a, actors.requester), service.create({ ...a, submissionKey: randomUUID() }, actors.requester)]);
    expect(one.assignedLegal.id).not.toBe(two.assignedLegal.id);
    expect(one.assignmentPreference).toContain('workload');
  });

  it('atomically claims only the requestor’s unclaimed attachments', async () => {
    const id = randomUUID();
    await db.requestAttachment.create({ data: { id, uploaderId: actors['other-client'].id, filename: 'scope.txt', size: 5, category: 'Scope', contentType: 'text/plain', storageKey: 'private-test', sha256: 'test' } });
    await expect(service.create({ ...dto(), attachmentIds: [id] }, actors.requester)).rejects.toThrow('attachment');
    expect(await db.contract.count()).toBe(0);
    await db.requestAttachment.update({ where: { id }, data: { uploaderId: actors.requester.id } });
    const request = await service.create({ ...dto(), attachmentIds: [id] }, actors.requester);
    expect(request.attachments?.[0].filename).toBe('scope.txt');
    await expect(service.create({ ...dto(), attachmentIds: [id] }, actors.requester)).rejects.toThrow('attachment');
    expect(await db.contract.count()).toBe(1);
  });

  it('keeps business questions and replies scoped, durable and visible to the right recipient', async () => {
    const request = await service.create(dto(), actors.requester);
    const question = { id: randomUUID(), body: 'Confirm the proposed liability cap.', kind: 'question' as const, version: 0 };
    await expect(service.message(request.id, question, actors.requester)).rejects.toThrow('Only');
    const asked = await service.message(request.id, question, actors.counsel);
    expect(asked.status).toBe('waiting-on-client');
    expect((await inbox.list(actors.requester)).items[0].body).toContain('liability');
    expect((await inbox.list(actors.requester)).items[0].href).toBe(`/requests/${request.id}`);
    await expect(service.message(request.id, { id: randomUUID(), body: 'Agreed', kind: 'reply', version: 1 }, actors['other-client'])).rejects.toThrow('not found');
    const reply = { id: randomUUID(), body: 'The business confirms the negotiated cap.', kind: 'reply' as const, version: 1 };
    const replied = await service.message(request.id, reply, actors.requester);
    expect(replied.messages).toHaveLength(2); expect(replied.status).toBe('in-progress');
    await service.message(request.id, reply, actors.requester);
    expect(await db.requestMessage.count()).toBe(2);
    expect(await db.auditEvent.count({ where: { action: 'request.reply' } })).toBe(1);
    configured.mockReturnValue(true); mail.sendEmail.mockResolvedValue({ status: 'sent', dryRun: false });
    const message = (await inbox.list(actors.requester)).items[0]; await inbox.deliver(message.id);
    expect(mail.sendEmail.mock.calls[0][0].to).toEqual([actors.requester.email]);
    expect(mail.sendEmail.mock.calls[0][0].html).toContain(`/requests/${request.id}`);
  });

  function lifecycleServices() {
    const files = new Map<string, Buffer>();
    const storage = { put: jest.fn(async (bytes: Buffer) => { const key = randomUUID(); files.set(key, bytes); return key; }), get: jest.fn(async (key: string) => ({ buffer: files.get(key), filename: 'draft.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })) };
    const authoring = { generateDraft: jest.fn(async () => ({ sections: [{ heading: 'Parties', body: 'Lakmē Lever and the test counterparty.' }], model: 'template-assembly' })) };
    const contracts = new ContractsService(prisma);
    const agreements = new AgreementsService(prisma, service, contracts, authoring as any, audit, storage as any, new FileSecurityService());
    const review = { getReview: jest.fn(async (id: string) => { const doc = await db.document.findFirst({ where: { contractId: id }, orderBy: { createdAt: 'desc' } }); const c = await db.contract.findUnique({ where: { id } }); return { documentId: doc?.id, documentSha256: doc?.sha256, contractVersion: c.version }; }) };
    const workflow = new WorkflowService(contracts, review as any, mail as any, audit, new AuthService(prisma, audit), prisma);
    return { agreements, workflow, storage, contracts, review };
  }

  async function readyForReview() {
    const request = await service.create({ ...dto(), terms: { ...dto().terms, endDate: '2027-09-30', noticePeriodDays: 60 } }, actors.requester);
    const services = lifecycleServices();
    await service.action(request.id, { action: 'accept', version: 0 }, actors.counsel);
    const accepted = await services.agreements.snapshot(request.contractId, actors.counsel);
    const drafted = await services.agreements.startDraft(request.contractId, { templateId: 'test-template', revision: accepted.revision }, actors.counsel);
    await services.agreements.transition(request.contractId, { stage: 'review', revision: drafted.revision }, actors.counsel);
    return { request, ...services };
  }

  it('preserves the same agreement through acceptance, draft versions and review with stale-write protection', async () => {
    const { request, agreements } = await readyForReview();
    const snapshot = await agreements.snapshot(request.contractId, actors.counsel);
    expect(snapshot.contract.stage).toBe('review'); expect(snapshot.request?.id).toBe(request.id);
    expect(snapshot.documents).toHaveLength(1); expect(snapshot.documents[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.draft?.sections[0].body).toContain('Lakmē');
    const hidden = await agreements.snapshot(request.contractId, actors['other-lawyer']); expect(hidden.request).toBeNull();
    await expect(agreements.saveDraft(request.contractId, { revision: snapshot.revision, sections: snapshot.draft!.sections }, actors['other-lawyer'])).rejects.toThrow('another lawyer');
    await expect(agreements.saveDraft(request.contractId, { revision: 0, sections: snapshot.draft!.sections }, actors.counsel)).rejects.toThrow('changed');
    const saved = await agreements.saveDraft(request.contractId, { revision: snapshot.revision, sections: [{ heading: 'Revised clause', body: 'Counsel revised terms.' }] }, actors.counsel);
    expect(saved.documents).toHaveLength(2); expect(saved.contract.id).toBe(request.contractId);
    expect(await db.auditEvent.count({ where: { action: 'contract.draft_saved' } })).toBe(2);
  });

  it('requires every approver, prevents self-routing, and locks the exact document before signing', async () => {
    const { request, agreements, workflow } = await readyForReview(); const id = request.contractId;
    await expect(workflow.routeInApp(id, { approvers: [actors.counsel.email] }, actors.counsel)).rejects.toThrow('cannot approve');
    await expect(workflow.routeInApp(id, { approvers: [actors.viewer.email] }, actors.counsel)).rejects.toThrow('approval authority');
    expect(await db.approvalRouting.count()).toBe(0);
    await workflow.routeInApp(id, { approvers: [actors.lead.email, actors.admin.email], note: 'Review commercial exposure.' }, actors.counsel);
    expect(await db.approvalStep.count()).toBe(2);
    expect((await agreements.snapshot(id, actors.counsel)).contract.stage).toBe('approval');
    const draft = await agreements.snapshot(id, actors.counsel);
    await expect(agreements.saveDraft(id, { revision: draft.revision, sections: draft.draft!.sections }, actors.counsel)).rejects.toThrow('locked');
    await expect(workflow.decideInApp(id, { decision: 'approved' }, actors.counsel)).rejects.toThrow('authority');
    await workflow.decideInApp(id, { decision: 'approved' }, actors.lead);
    expect(await db.approvalDecision.findUnique({ where: { contractId: id } })).toBeNull();
    await workflow.decideInApp(id, { decision: 'approved' }, actors.admin);
    expect((await db.approvalDecision.findUnique({ where: { contractId: id } })).decision).toBe('approved');
    expect((await agreements.snapshot(id, actors.counsel)).contract.stage).toBe('signature');
    await workflow.decideInApp(id, { decision: 'approved' }, actors.admin);
    expect(await db.auditEvent.count({ where: { entityId: id, action: 'approval.approved' } })).toBe(2);
  });

  it('rejects changed document hashes and leaves no partial approval decision', async () => {
    const { request, workflow } = await readyForReview(); const id = request.contractId;
    await workflow.routeInApp(id, { approvers: [actors.lead.email] }, actors.counsel);
    await db.document.updateMany({ where: { contractId: id }, data: { sha256: 'tampered' } });
    await expect(workflow.decideInApp(id, { decision: 'approved' }, actors.lead)).rejects.toThrow('document changed');
    expect((await db.approvalStep.findFirst({ where: { contractId: id } })).decision).toBe('pending');
    expect(await db.approvalDecision.count()).toBe(0);
  });
  it('blocks an upload that finishes extraction after approval routing and prevents other counsel uploading', async () => {
    const { request, workflow, storage } = await readyForReview(); const id = request.contractId;
    const ingestion = new IngestionService(prisma, { ...storage, s3Location: () => null } as any, new FileSecurityService(), {} as any, audit);
    const file = { originalname: 'revision.txt', buffer: Buffer.from('Revised agreement language'), size: 26 };
    await expect(ingestion.ingestUploads([file], id, actors['other-lawyer'])).rejects.toThrow('another lawyer');
    let started!: () => void, release!: () => void;
    const extracting = new Promise<void>(resolve => { started = resolve; });
    const finish = new Promise<void>(resolve => { release = resolve; });
    jest.spyOn(ingestion as any, 'ocr').mockImplementation(async () => { started(); await finish; return { text: 'Revised agreement language', engine: 'test' }; });
    jest.spyOn(ingestion as any, 'processOne').mockResolvedValue({ filename: 'revision.txt', documentType: 'NDA', confidence: 0, status: 'needs-review', extraction: {}, validations: [], notes: [], model: 'test' });
    const upload = ingestion.ingestUploads([file], id, actors.counsel);
    await extracting;
    await workflow.routeInApp(id, { approvers: [actors.lead.email] }, actors.counsel);
    release();
    await expect(upload).rejects.toThrow('already routed');
    expect(await db.document.count({ where: { contractId: id } })).toBe(1);
  });

  it('keeps legal-created drafts in the owner’s queue and prevents another counsel changing them', async () => {
    const { agreements } = lifecycleServices();
    const created = await agreements.create({ title: 'Direct legal draft', type: 'NDA', counterparty: 'Test counterparty' }, actors.counsel);
    expect((await agreements.work(actors.counsel, 'mine')).items.map((r: any) => r.id)).toContain(created.id);
    expect((await agreements.work(actors['other-lawyer'], 'mine')).items).toHaveLength(0);
    await expect(agreements.saveDraft(created.id, { revision: 0, sections: [{ heading: 'Parties', body: 'Private drafting work' }] }, actors['other-lawyer'])).rejects.toThrow('another lawyer');
  });

  it('preserves a rejected approval round and requires fresh approvals for the revised document', async () => {
    const { request, agreements, workflow } = await readyForReview(); const id = request.contractId;
    await workflow.routeInApp(id, { approvers: [actors.lead.email] }, actors.counsel);
    await workflow.decideInApp(id, { decision: 'changes-requested', comment: 'Revise the liability cap.' }, actors.lead);
    const rejected = await agreements.snapshot(id, actors.counsel);
    const revised = await agreements.revise(id, { revision: rejected.revision, reason: 'Resolve liability feedback.' }, actors.counsel);
    expect(revised.approval).toBeNull(); expect(revised.contract.stage).toBe('drafting');
    expect(revised.approvalHistory?.[0].steps[0].comment).toBe('Revise the liability cap.');
    const evidence = await db.approvalRound.findFirst({ where: { contractId: id } });
    expect(evidence.evidence.decision.documentId).toBe(rejected.documents[0].id);
    expect(evidence.evidenceSha256).toBe(createHash('sha256').update(canonicalJson(evidence.evidence)).digest('hex'));
    await expect(agreements.revise(id, { revision: rejected.revision, reason: 'Retry' }, actors.counsel)).rejects.toThrow('changed');
    const saved = await agreements.saveDraft(id, { revision: revised.revision, sections: [{ heading: 'Liability', body: 'Revised limitation of liability.' }] }, actors.counsel);
    await agreements.transition(id, { stage: 'review', revision: saved.revision }, actors.counsel);
    await workflow.routeInApp(id, { approvers: [actors.lead.email] }, actors.counsel);
    expect((await db.approvalStep.findFirst({ where: { contractId: id } })).decision).toBe('pending');
    expect((await db.approvalRouting.findUnique({ where: { contractId: id } })).documentId).not.toBe(evidence.evidence.routing.documentId);
    await workflow.decideInApp(id, { decision: 'approved' }, actors.lead);
    expect(await db.approvalRound.count({ where: { contractId: id } })).toBe(1);
    const approved = await agreements.snapshot(id, actors.counsel);
    await expect(agreements.revise(id, { revision: approved.revision, reason: 'Cannot change approved evidence' }, actors.counsel)).rejects.toThrow('Only a rejected');
  });

  it('automatically preserves the authoritative executed record and deduplicates dates and notices', async () => {
    const { request, workflow, agreements, storage, contracts } = await readyForReview(); const id = request.contractId;
    await workflow.routeInApp(id, { approvers: [actors.lead.email] }, actors.counsel);
    await workflow.decideInApp(id, { decision: 'approved' }, actors.lead);
    const decision = await db.approvalDecision.findUnique({ where: { contractId: id } });
    const req: any = { id: randomUUID(), contractId: id, contractTitle: 'Test', status: 'completed', provider: 'test-provider', envelopeId: randomUUID(), signatories: [{ name: 'Test signer', email: 'signer@example.test', status: 'signed' }], ...{ documentId: decision.documentId, documentSha256: decision.documentSha256, contractVersion: decision.contractVersion } };
    const signedBytes = Buffer.from('%PDF-1.7\nTest-only signed fixture');
    const signedKey = await storage.put(signedBytes);
    await db.archivedDocument.create({ data: { id: `ARC-${req.id}`, requestId: req.id, contractId: id, contractTitle: 'Test', signatories: [], completedAt: new Date(), storageKey: signedKey, checksum: 'invalid', format: 'application/pdf', size: signedBytes.length } });
    const esign = new ESignService({} as any, mail as any, prisma, storage as any, audit, {} as any, contracts);
    await expect(esign.completeAgreement(req)).rejects.toThrow('could not be verified');
    expect((await db.contract.findUnique({ where: { id } })).stage).toBe('signature');
    await db.archivedDocument.update({ where: { id: `ARC-${req.id}` }, data: { checksum: createHash('sha256').update(signedBytes).digest('hex') } });
    await Promise.all([esign.completeAgreement(req), esign.completeAgreement(req)]);
    const result = await agreements.snapshot(id, actors.counsel);
    expect(result.contract.stage).toBe('active'); expect(result.archive?.id).toBe(`ARC-${req.id}`);
    expect(result.documents).toHaveLength(1); expect(result.request?.status).toBe('closed');
    expect(result.obligations).toHaveLength(2); expect(result.obligations.every(o => !o.confirmed)).toBe(true);
    expect(await db.auditEvent.count({ where: { entityId: id, action: 'contract.executed' } })).toBe(1);
    expect(await db.requestNotification.count({ where: { kind: `executed-ARC-${req.id}` } })).toBe(2);
    const obligations = new ObligationsService(mail as any, prisma, { list: async () => [] } as any, audit);
    const provisional = result.obligations[0];
    await expect(obligations.remind(provisional.id)).rejects.toThrow('Confirm this obligation');
    expect(mail.sendEmail).not.toHaveBeenCalled();
    const values = { id: provisional.id, revision: result.revision, title: 'Renewal notice', type: 'notice', dueDate: '2027-08-01', ownerEmail: actors.requester.email, evidence: 'Executed agreement, clause 12: give written notice by this date.', completed: false };
    await expect(agreements.obligation(id, values, actors['other-lawyer'])).rejects.toThrow('another lawyer');
    await expect(agreements.obligation(id, { ...values, dueDate: '2027-02-31' }, actors.counsel)).rejects.toThrow('valid calendar date');
    const confirmed = await agreements.obligation(id, values, actors.counsel);
    expect(confirmed.obligations.find(o => o.id === provisional.id)?.confirmed).toBe(true);
    await expect(agreements.obligation(id, values, actors.counsel)).rejects.toThrow('changed');
    expect((await inbox.list(actors.requester)).items.some(i => i.title.includes('Commitment assigned'))).toBe(true);
    const done = await agreements.obligation(id, { ...values, revision: confirmed.revision, completed: true }, actors.counsel);
    expect(done.obligations.find(o => o.id === provisional.id)?.completedAt).toBeTruthy();
    await expect(obligations.remind(provisional.id)).rejects.toThrow('Confirm this obligation');
  });

});
