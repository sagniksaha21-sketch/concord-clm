import { ApprovalPolicyController } from '../src/workflow/approval-policy.controller';
import { RoundAnalysisService } from '../src/negotiation/round-analysis.service';
import { ObligationExtractionService } from '../src/obligations/obligation-extraction.service';
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
import { ApproverService } from '../src/workflow/approver.service';
import { draftDocument } from '../src/agreements/draft-document';
import { IngestionService } from '../src/ingestion/ingestion.service';
import * as graph from '../src/notifications/graph.client';
import { GuestAuthService, guestHash } from '../src/negotiation/guest-auth.service';
import { NegotiationService } from '../src/negotiation/negotiation.service';
import { GuestDeliveryService } from '../src/negotiation/guest-delivery.service';
import type { InviteGuestDto } from '../src/negotiation/negotiation.dto';

const describeDb = process.env.REQUEST_TEST_DATABASE_URL ? describe : describe.skip;
describeDb('Department portal on PostgreSQL', () => {
  let db: any; let prisma: any; let audit: AuditService; let service: ClientRequestsService; let inbox: RequestInboxService;
  const mail = { sendEmail: jest.fn() }; let configured: jest.SpyInstance;
  const actors: Record<string, AuthUser> = Object.fromEntries(['requester', 'other-client', 'counsel', 'other-lawyer', 'lead', 'admin', 'viewer', 'approver'].map(key => [key, { id: key, name: `UAT ${key}`, email: `${key}@example.test`, role: key === 'other-client' ? 'requester' : key === 'other-lawyer' ? 'counsel' : key }]));
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
    await db.$executeRawUnsafe('TRUNCATE TABLE "ApprovalPolicy", "GuestAuthLimit", "RequestNotification", "IntakeRequest", "ApprovalRouting", "ApprovalDecision", "SignatureRequest", "ArchivedDocument", "Contract", "User", "AuditEvent", "AuditAnchor" CASCADE');
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
    const review = { getReview: jest.fn(async (id: string) => { const doc = await db.document.findFirst({ where: { contractId: id }, orderBy: { createdAt: 'desc' } }); const c = await db.contract.findUnique({ where: { id } }); return { documentId: doc?.id, documentSha256: doc?.sha256, contractVersion: c.version, riskLevel: 'low', riskScore: 10, clausesParsed: 1, summary: 'Test-only review response', model: 'test-fixture', deviations: [], clauses: [], extractedTerms: [] }; }) };
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

  it('opens the actual saved source and records separate document versions with actor, reason and differences', async () => {
    const { request, agreements, storage } = await readyForReview(); const id = request.contractId;
    const editor = await agreements.editor(id, actors.counsel);
    expect(editor.sections).toEqual((await agreements.snapshot(id,actors.counsel)).draft!.sections);
    const next = await agreements.saveDraft(id,{ revision: editor.revision, sourceDocumentId: editor.documentId!, reason: 'Negotiated payment terms', sections: [{ id: 'section-0', heading: 'Payment', body: 'Pay within 45 days.' }] },actors.counsel);
    expect(next.contract.stage).toBe('review'); expect(next.versionHistory).toHaveLength(2);
    expect(next.versionHistory![0]).toMatchObject({ authorName: actors.counsel.name, reason: 'Negotiated payment terms', source: 'legal-edit' });
    expect(next.versionHistory![0].changeSummary).toHaveLength(1);
    await expect(agreements.saveDraft(id,{ revision: next.revision, sourceDocumentId: editor.documentId!, sections: next.draft!.sections },actors.counsel)).rejects.toThrow('newer document');
    const document = await db.document.findUnique({ where: { id: next.draft!.documentId } });
    storage.get.mockResolvedValueOnce({ buffer: Buffer.from('corrupted'), filename: 'draft.docx', contentType: 'text/plain' });
    await expect(agreements.editor(id,actors.counsel)).rejects.toThrow('integrity');
    expect(document.sha256).toBe(next.versionHistory![0].sha256);
  });
  it('imports an uploaded Word source into the same editor without overwriting its bytes', async () => {
    const { agreements, storage } = lifecycleServices();
    const { id } = await agreements.create({ title: 'Word exchange', counterparty: 'Test supplier', type: 'MSA' },actors.counsel);
    const bytes = draftDocument('Word exchange',[{ heading: 'Scope', body: 'Services for the business.' }]);
    const key = await storage.put(bytes);
    const doc = await db.document.create({ data: { contractId: id, filename: 'counterparty.docx', status: 'validated', extraction: {}, validations: [], notes: [], confidence: 100, documentType: 'MSA', model: 'test', blobPath: key, sha256: createHash('sha256').update(bytes).digest('hex') } });
    const editor = await agreements.editor(id,actors.counsel);
    expect(editor.documentId).toBe(doc.id); expect(editor.sections.map((s: any) => s.body).join(' ')).toContain('Services for the business');
    const saved = await agreements.saveDraft(id,{ revision: editor.revision, sourceDocumentId: doc.id, sections: editor.sections },actors.counsel);
    expect(saved.documents).toHaveLength(2); expect((await storage.get(key)).buffer).toEqual(bytes);
  });
  it('preserves internal comments, rejects cross-agreement references and records resolution', async () => {
    const { request,agreements } = await readyForReview(); const id = request.contractId;
    const editor = await agreements.editor(id,actors.counsel);
    const body = { id: randomUUID(), documentId: editor.documentId!, body: 'Internal legal strategy', sectionId: 'section-0' };
    const added = await agreements.comment(id,body,actors.counsel); await agreements.comment(id,body,actors.counsel);
    expect(added.comments?.[0].visibility).toBe('internal'); expect(await db.agreementComment.count()).toBe(1);
    await expect(agreements.comment(id,{ ...body, id: randomUUID(), documentId: randomUUID() },actors.counsel)).rejects.toThrow('not found');
    await expect(agreements.resolveComment(id,body.id,{ resolved: true },actors['other-lawyer'])).rejects.toThrow('another lawyer');
    const resolved = await agreements.resolveComment(id,body.id,{ resolved: true },actors.counsel); expect(resolved.comments?.[0].resolvedAt).toBeTruthy();
    expect(await db.auditEvent.count({ where: { action: 'contract.comment_added' } })).toBe(1);
  });
  it('restricts focused approval cards and document bytes to the assigned approver', async () => {
    const { request,workflow,storage } = await readyForReview(); const id = request.contractId;
    await workflow.routeInApp(id,{ approvers: [actors.approver.email], note: 'Consider financial exposure' },actors.counsel);
    const approval = new ApproverService(prisma,workflow,storage as any,audit);
    expect((await approval.queue(actors.approver))[0].id).toBe(id);
    expect(await approval.queue(actors.viewer)).toHaveLength(0);
    await expect(approval.card(id,actors.viewer)).rejects.toThrow('not assigned');
    await expect(approval.file(id,actors['other-lawyer'])).rejects.toThrow('not assigned');
    const card = await approval.card(id,actors.approver); expect(card.approval.canDecide).toBe(true);
    expect(card).not.toHaveProperty('comments'); expect(card).not.toHaveProperty('request');
    expect((await approval.file(id,actors.approver)).buffer).toBeInstanceOf(Buffer);
    expect((await inbox.list(actors.approver)).items[0].href).toBe(`/approvals/${id}`);
    await workflow.decideInApp(id,{ decision: 'approved' },actors.approver);
    expect((await db.agreementVersion.findFirst({ where: { contractId: id } })).approvedAt).toBeTruthy();
  });
  it('creates an idempotent linked amendment while retaining the executed parent intact', async () => {
    const { agreements } = lifecycleServices();
    const { id } = await agreements.create({ title: 'Parent', counterparty: 'Supplier', type: 'MSA' },actors.counsel);
    const amendment = { id: randomUUID(), title: 'Payment amendment', reason: 'Extend payment terms' };
    await expect(agreements.amend(id,amendment,actors.counsel)).rejects.toThrow('executed agreement');
    await db.contract.update({ where: { id }, data: { stage: 'active', executedAt: new Date(), authoritativeArchiveId: 'test-preserved-archive' } });
    const parent = await db.contract.findUnique({ where: { id } });
    await Promise.all([agreements.amend(id,amendment,actors.counsel),agreements.amend(id,amendment,actors.counsel)]);
    expect(await db.contract.count()).toBe(2); expect(await db.contract.findUnique({ where: { id } })).toEqual(parent);
    const child = await agreements.snapshot(amendment.id,actors.counsel); expect(child.parentAgreement?.id).toBe(id); expect(child.contract.stage).toBe('drafting');
    expect((await agreements.snapshot(id,actors.counsel)).amendments).toHaveLength(1);
    await expect(agreements.saveDraft(id,{ revision: 0, sections: [{ heading: 'Illegal edit',body: 'Overwrite' }] },actors.counsel)).rejects.toThrow('locked');
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
    const reopened = await agreements.revise(id, { revision: approved.revision, reason: 'A material correction requires fresh approval' }, actors.counsel);
    expect(reopened.needsNewVersion).toBe(true); expect(reopened.contract.version).toBe(approved.contract.version);
    expect(reopened.approvalHistory).toHaveLength(2);
    await expect(agreements.transition(id, { revision: reopened.revision, stage: 'review' }, actors.counsel)).rejects.toThrow('Save the changed document');
    await expect(workflow.decideInApp(id, { decision: 'approved' }, actors.lead)).rejects.toThrow('not currently assigned');
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


  async function negotiationFixture(overrides: Partial<InviteGuestDto> = {}) {
    const base = await readyForReview(); const id = base.request.contractId;
    const auth = new GuestAuthService(prisma,mail as any,audit);
    const negotiation = new NegotiationService(prisma,base.storage as any,audit,new FileSecurityService(),base.review as any,auth);
    const snapshot = await base.agreements.snapshot(id,actors.counsel);
    const invite: InviteGuestDto = { id: randomUUID(), revision: snapshot.revision, documentId: snapshot.draft!.documentId!, name: 'External Reviewer', email: 'reviewer@example.test', organisation: 'Test Supplier', expiresAt: new Date(Date.now()+7*86400000).toISOString(), allowDownload: false, allowRedline: true, allowUpload: true, ...overrides };
    await negotiation.invite(id,invite,actors.counsel);
    const version = async () => { const s = await base.agreements.snapshot(id,actors.counsel); return { revision: s.revision, documentId: s.draft!.documentId! }; };
    return { ...base, id, auth, negotiation, invite, version };
  }
  async function guestChallenge(f: Awaited<ReturnType<typeof negotiationFixture>>) {
    configured.mockReturnValue(true); mail.sendEmail.mockResolvedValue({ status: 'sent', dryRun: false });
    const result = await f.auth.challenge(f.invite.id,f.invite.email,'test-participant-ip');
    const html = mail.sendEmail.mock.calls.at(-1)![0].html as string;
    const code = html.match(/<b>([0-9]{6})<\/b>/)![1];
    return { email: f.invite.email, challengeId: result.challengeId, code };
  }
  async function guestLogin(f: Awaited<ReturnType<typeof negotiationFixture>>) {
    const body = await guestChallenge(f); return (await f.auth.verify(f.invite.id,body,'test-participant-ip')).token;
  }
  it('creates one scoped invitation, notification and audit event on simultaneous retry',async () => {
    const f = await negotiationFixture();
    await Promise.all([f.negotiation.invite(f.id,f.invite,actors.counsel),f.negotiation.invite(f.id,f.invite,actors.counsel)]);
    expect(await db.guestInvitation.count()).toBe(1); expect(await db.guestDelivery.count()).toBe(1);
    expect(await db.auditEvent.count({ where: { action: 'negotiation.invited' } })).toBe(1);
    expect((await db.guestDelivery.findFirst()).status).toBe('awaiting-configuration');
    await expect(f.negotiation.invite(f.id,{ ...f.invite, allowDownload: true },actors.counsel)).rejects.toThrow('identifier already used');
    await expect(f.negotiation.workspace(f.id,actors['other-lawyer'])).rejects.toThrow('another lawyer');
    expect((await f.agreements.snapshot(f.id,actors.counsel)).contract.stage).toBe('negotiation');
  });
  it('fails closed when email is unavailable and discloses nothing for the wrong invited email',async () => {
    const f = await negotiationFixture();
    await expect(f.auth.challenge(f.invite.id,f.invite.email,'one')).rejects.toThrow('temporarily unavailable');
    configured.mockReturnValue(true);
    const result = await f.auth.challenge(f.invite.id,'stranger@example.test','one');
    expect(Object.keys(result).sort()).toEqual(['challengeId','message']); expect(mail.sendEmail).not.toHaveBeenCalled();
    expect((await db.guestInvitation.findUnique({ where: { id: f.invite.id } })).otpHash).toBeNull();
    await expect(f.auth.verify(f.invite.id,{ email: 'stranger@example.test', challengeId: result.challengeId, code: '000000' },'one')).rejects.toThrow('invalid');
  });
  it('requires confirmed real email delivery before a correct OTP can create a session',async () => {
    const f = await negotiationFixture(); configured.mockReturnValue(true);
    mail.sendEmail.mockResolvedValue({ status: 'dry-run', dryRun: true });
    const challenge = await f.auth.challenge(f.invite.id,f.invite.email,'one');
    const code = mail.sendEmail.mock.calls.at(-1)![0].html.match(/<b>([0-9]{6})<\/b>/)[1];
    await expect(f.auth.verify(f.invite.id,{ email: f.invite.email, challengeId: challenge.challengeId, code },'one')).rejects.toThrow('invalid');
    expect(await db.guestSession.count()).toBe(0);
  });
  it('consumes each OTP once under concurrent verification and stores only a hashed session',async () => {
    const f = await negotiationFixture(), body = await guestChallenge(f);
    const results = await Promise.allSettled([f.auth.verify(f.invite.id,body,'one'),f.auth.verify(f.invite.id,body,'one')]);
    expect(results.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    expect(await db.guestSession.count()).toBe(1);
    const success = results.find(x => x.status === 'fulfilled') as PromiseFulfilledResult<{ token: string; expiresAt: Date }>;
    expect(success.value.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const saved = await db.guestSession.findFirst(); expect(saved.hash).toBe(guestHash(success.value.token)); expect(saved.hash).not.toBe(success.value.token);
    const invitation = await db.guestInvitation.findUnique({ where: { id: f.invite.id } }); expect(invitation.otpHash).toBeNull(); expect(invitation.challengeId).toBeNull();
    await expect(f.auth.verify(f.invite.id,body,'one')).rejects.toThrow('invalid');
  });
  it('commits failed OTP attempts, enforces five guesses and expires old codes',async () => {
    const f = await negotiationFixture(), body = await guestChallenge(f);
    const wrong = body.code === '000000' ? '000001' : '000000';
    for (let n=0;n<5;n++) await expect(f.auth.verify(f.invite.id,{ ...body, code: wrong },'one')).rejects.toThrow('invalid');
    expect((await db.guestInvitation.findUnique({ where: { id: f.invite.id } })).otpAttempts).toBe(5);
    await expect(f.auth.verify(f.invite.id,body,'one')).rejects.toThrow('invalid');
    await db.guestInvitation.update({ where: { id: f.invite.id }, data: { otpAttempts: 0, otpExpiresAt: new Date(Date.now()-1000) } });
    await expect(f.auth.verify(f.invite.id,body,'one')).rejects.toThrow('invalid');
  });
  it('enforces a persistent challenge budget and invitation identity binding',async () => {
    const f = await negotiationFixture(), token = await guestLogin(f);
    const other = await negotiationFixture({ email: 'another@example.test' });
    await expect(f.negotiation.room(other.invite.id,token)).rejects.toThrow('expired or been revoked');
    for (let n=0;n<5;n++) await f.auth.challenge(f.invite.id,f.invite.email,'different-ip');
    await expect(f.auth.challenge(f.invite.id,f.invite.email,'third-ip')).rejects.toThrow('Too many');
  });
  it('rechecks revocation and expiry for every guest document and write request',async () => {
    const f = await negotiationFixture({ allowDownload: true }), token = await guestLogin(f);
    await f.negotiation.room(f.invite.id,token);
    await f.negotiation.revoke(f.id,f.invite.id,actors.counsel);
    await expect(f.negotiation.room(f.invite.id,token)).rejects.toThrow('revoked');
    await expect(f.negotiation.guestFile(f.invite.id,token)).rejects.toThrow('revoked');
    await expect(f.negotiation.guestComment(f.invite.id,token,{ id: randomUUID(), documentId: f.invite.documentId, body: 'Denied' })).rejects.toThrow('revoked');
    expect(await db.guestSession.count()).toBe(0);
    expect(await db.auditEvent.count({ where: { action: 'negotiation.access_revoked' } })).toBe(1);
    const other = await negotiationFixture(), second = await guestLogin(other);
    await db.guestInvitation.update({ where: { id: other.invite.id }, data: { expiresAt: new Date(Date.now()-1000) } });
    await expect(other.negotiation.room(other.invite.id,second)).rejects.toThrow('expired');
  });
  it('keeps internal comments, business context, AI and approval data out of the external response',async () => {
    const f = await negotiationFixture(), token = await guestLogin(f);
    const privateBody = 'PRIVILEGED NEGOTIATION STRATEGY';
    await f.agreements.comment(f.id,{ id: randomUUID(), documentId: f.invite.documentId, body: privateBody },actors.counsel);
    await f.negotiation.legalComment(f.id,{ id: randomUUID(), documentId: f.invite.documentId, body: 'Please confirm the draft.' },actors.counsel);
    const room = await f.negotiation.room(f.invite.id,token);
    expect(room.comments.map((x: any) => x.body)).toEqual(['Please confirm the draft.']);
    for (const key of ['risk','request','approval','audit','playbook','email','otpHash','requestHash','ownerId','contractId']) expect(room).not.toHaveProperty(key);
    expect(JSON.stringify(room)).not.toContain(privateBody); expect(JSON.stringify(room)).not.toContain('25000');
    await f.negotiation.room(f.invite.id,token);
    expect(await db.auditEvent.count({ where: { action: 'negotiation.document_viewed' } })).toBe(1);
    const delivery = await db.guestDelivery.findFirst({ where: { kind: 'legal-response' } }); expect(delivery.invitationId).toBe(f.invite.id);
  });
  it('enforces download permission and detects corrupt shared bytes',async () => {
    const f = await negotiationFixture(), token = await guestLogin(f);
    await expect(f.negotiation.guestFile(f.invite.id,token)).rejects.toThrow('not permitted');
    await db.guestInvitation.update({ where: { id: f.invite.id }, data: { allowDownload: true } });
    const file = await f.negotiation.guestFile(f.invite.id,token); expect(file.buffer).toBeInstanceOf(Buffer);
    f.storage.get.mockResolvedValueOnce({ buffer: Buffer.from('altered'), filename: 'draft.docx', contentType: 'application/octet-stream' });
    await expect(f.negotiation.guestFile(f.invite.id,token)).rejects.toThrow('integrity');
    expect(await db.auditEvent.count({ where: { action: 'negotiation.document_downloaded' } })).toBe(1);
  });
  it('preserves separate guest versions and rejects changed retries without replacing the shared source',async () => {
    const f = await negotiationFixture(), token = await guestLogin(f), room = await f.negotiation.room(f.invite.id,token);
    const doc = await db.document.findUnique({ where: { id: room.documentId } }); const source = await f.storage.get(doc.blobPath);
    const body = { id: randomUUID(), documentId: room.documentId, sections: room.sections.map((s: any) => ({ ...s, body: s.body+' Liability limited to twice the annual fees.' })) };
    await Promise.all([f.negotiation.respond(f.invite.id,token,body),f.negotiation.respond(f.invite.id,token,body)]);
    const versions = await db.agreementVersion.findMany({ where: { contractId: f.id }, orderBy: { number: 'asc' } });
    expect(versions).toHaveLength(2); expect(versions[1]).toMatchObject({ authorName: f.invite.name, source: 'counterparty-redline', round: 1 });
    expect(versions[1].documentId).not.toBe(room.documentId); expect((await f.storage.get(doc.blobPath)).buffer).toEqual(source.buffer);
    expect(await db.negotiationResponse.count()).toBe(1);
    await expect(f.negotiation.respond(f.invite.id,token,{ ...body, sections: [{ heading: 'Changed retry',body: 'Different terms' }] })).rejects.toThrow('different response');
    const response = await f.negotiation.room(f.invite.id,token); expect(response.canRedline).toBe(false); expect(response.sections).toEqual(room.sections);
    const editor = await f.agreements.editor(f.id,actors.counsel); expect(editor.documentId).toBe(versions[1].documentId); expect(editor.sections[0].body).toContain('twice');
    expect((await f.agreements.snapshot(f.id,actors.counsel)).contract.nextAction).toBe('Review counterparty changes');
  });
  it('rejects outdated submissions when another participant has already advanced the saved document',async () => {
    const f = await negotiationFixture(), token = await guestLogin(f), room = await f.negotiation.room(f.invite.id,token);
    await f.agreements.saveDraft(f.id,{ ...(await f.version()), sourceDocumentId: room.documentId, sections: [{ heading: 'Updated',body: 'Legal has revised the document.' }] },actors.counsel);
    await expect(f.negotiation.respond(f.invite.id,token,{ id: randomUUID(), documentId: room.documentId, sections: room.sections as any })).rejects.toThrow('newer document');
    expect(await db.negotiationResponse.count()).toBe(0);
  });
  it('retains Word redline bytes and captures comparison and provenance as a new version',async () => {
    const f = await negotiationFixture(), token = await guestLogin(f);
    const bytes = draftDocument('Counterparty proposal',[{ heading: 'Liability',body: 'Liability is capped at two times annual fees.' }]);
    await f.negotiation.respond(f.invite.id,token,{ id: randomUUID(), documentId: f.invite.documentId, sections: [] },{ originalname: 'supplier-redline.docx', buffer: bytes });
    const response = await db.negotiationResponse.findFirst(); const doc = await db.document.findUnique({ where: { id: response.documentId } });
    expect((await f.storage.get(doc.blobPath)).buffer).toEqual(bytes); expect(response.source).toBe('word'); expect(response.changes.length).toBeGreaterThan(0);
    expect((await db.agreementVersion.findUnique({ where: { documentId: doc.id } })).organisation).toBe(f.invite.organisation);
    expect(await db.document.count({ where: { contractId: f.id } })).toBe(2);
  });
  it('rejects unsupported redlines and disabled response methods without creating versions',async () => {
    const f = await negotiationFixture(), token = await guestLogin(f);
    await expect(f.negotiation.respond(f.invite.id,token,{ id: randomUUID(), documentId: f.invite.documentId, sections: [] },{ originalname: 'broken.docx', buffer: Buffer.from('malformed') })).rejects.toThrow();
    await db.guestInvitation.update({ where: { id: f.invite.id }, data: { allowUpload: false, allowRedline: false } });
    await expect(f.negotiation.respond(f.invite.id,token,{ id: randomUUID(), documentId: f.invite.documentId, sections: [{ heading: 'Denied',body: 'Terms' }] })).rejects.toThrow('does not allow');
    expect(await db.document.count({ where: { contractId: f.id } })).toBe(1);
  });
  it('freezes the exact agreed form only after resolved comments and business questions, then locks guest changes',async () => {
    const f = await negotiationFixture(), token = await guestLogin(f);
    const commentId = randomUUID();
    await f.agreements.comment(f.id,{ id: commentId, documentId: f.invite.documentId, body: 'Internal issue' },actors.counsel);
    await f.negotiation.accept(f.invite.id,token,f.invite.documentId);
    await expect(f.negotiation.agreed(f.id,await f.version(),actors.counsel)).rejects.toThrow('outstanding');
    await f.agreements.resolveComment(f.id,commentId,{ resolved: true },actors.counsel);
    await db.intakeRequest.update({ where: { id: f.request.id }, data: { clientStatus: 'waiting-on-client' } });
    await expect(f.negotiation.agreed(f.id,await f.version(),actors.counsel)).rejects.toThrow('outstanding');
    await db.intakeRequest.update({ where: { id: f.request.id }, data: { clientStatus: 'accepted' } });
    await f.negotiation.agreed(f.id,await f.version(),actors.counsel);
    const agreed = await db.contract.findUnique({ where: { id: f.id } }); expect(agreed.stage).toBe('agreed'); expect(agreed.agreedDocumentId).toBe(f.invite.documentId); expect(agreed.agreedSha256).toMatch(/^[a-f0-9]{64}$/);
    expect((await f.negotiation.room(f.invite.id,token)).canRedline).toBe(false);
    await expect(f.negotiation.guestComment(f.invite.id,token,{ id: randomUUID(), documentId: f.invite.documentId, body: 'Too late' })).rejects.toThrow('closed');
    await expect(f.agreements.saveDraft(f.id,{ revision: agreed.lifecycleRevision, sourceDocumentId: f.invite.documentId, sections: [{ heading: 'Change',body: 'Forbidden change' }] },actors.counsel)).rejects.toThrow('locked');
    await f.workflow.routeInApp(f.id,{ approvers: [actors.approver.email], note: 'Exact agreed form' },actors.counsel);
    const routing = await db.approvalRouting.findUnique({ where: { contractId: f.id } }); expect(routing.documentId).toBe(agreed.agreedDocumentId); expect(routing.documentSha256).toBe(agreed.agreedSha256);
  });
  it('requires current Legal review and all participants to accept the same exact version',async () => {
    const f = await negotiationFixture(), token = await guestLogin(f);
    await expect(f.negotiation.agreed(f.id,await f.version(),actors.counsel)).rejects.toThrow('Every active');
    await f.negotiation.accept(f.invite.id,token,f.invite.documentId);
    f.review.getReview.mockResolvedValueOnce({ documentId: 'different', documentSha256: 'different', contractVersion: 'different' });
    await expect(f.negotiation.agreed(f.id,await f.version(),actors.counsel)).rejects.toThrow('exact document');
    await expect(f.agreements.transition(f.id,{ revision: (await f.version()).revision, stage: 'review' },actors.counsel)).rejects.toThrow('Only drafting and review');
  });
  it('keeps one agreement through guest response, Legal edit, next round and agreed form',async () => {
    const f = await negotiationFixture(), token = await guestLogin(f), room = await f.negotiation.room(f.invite.id,token);
    const responseId = randomUUID();
    await f.negotiation.respond(f.invite.id,token,{ id: responseId, documentId: room.documentId, sections: [{ id: 'section-0',heading: 'Liability',body: 'Liability is two times annual fees.' }] });
    await expect(f.negotiation.share(f.id,await f.version(),actors.counsel)).rejects.toThrow('reviewing the received');
    await expect(f.negotiation.reviewed(f.id,responseId,await f.version(),actors.counsel)).rejects.toThrow('resolved Legal version');
    const editor = await f.agreements.editor(f.id,actors.counsel);
    await f.agreements.saveDraft(f.id,{ revision: editor.revision, sourceDocumentId: editor.documentId!, sections: [{ id: 'section-0',heading: 'Liability',body: 'Liability is one and a half times annual fees.' }], reason: 'Legal counterproposal' },actors.counsel);
    await f.negotiation.reviewed(f.id,responseId,await f.version(),actors.counsel);
    await f.negotiation.share(f.id,await f.version(),actors.counsel);
    const next = await f.negotiation.room(f.invite.id,token); expect(next.round).toBe(2); expect(next.documentId).not.toBe(room.documentId); expect(next.canRedline).toBe(true); expect(next.sections[0].body).toContain('one and a half');
    await expect(f.negotiation.guestComment(f.invite.id,token,{ id: randomUUID(), documentId: room.documentId, body: 'Old document' })).rejects.toThrow('closed');
    await f.negotiation.accept(f.invite.id,token,next.documentId);
    await f.negotiation.agreed(f.id,await f.version(),actors.counsel);
    expect(await db.contract.count()).toBe(1); expect(await db.document.count()).toBe(3); expect(await db.negotiationRound.count()).toBe(2); expect(await db.agreementVersion.count()).toBe(3);
  });
  it('sends each external invitation once under concurrent workers and audits delivery',async () => {
    const f = await negotiationFixture(); configured.mockReturnValue(true); mail.sendEmail.mockResolvedValue({ status: 'sent', dryRun: false });
    const worker = new GuestDeliveryService(prisma,mail as any,audit), delivery = await db.guestDelivery.findFirst();
    await Promise.all([worker.deliver(delivery.id),worker.deliver(delivery.id)]);
    expect(mail.sendEmail).toHaveBeenCalledTimes(1); expect(mail.sendEmail.mock.calls[0][0].to).toEqual([f.invite.email]);
    expect(mail.sendEmail.mock.calls[0][0].html).toContain(`/negotiate/${f.invite.id}`);
    expect((await db.guestDelivery.findUnique({ where: { id: delivery.id } })).status).toBe('sent');
    expect(await db.auditEvent.count({ where: { action: 'negotiation.email_delivery' } })).toBe(1);
  });
  it('never automatically retries uncertain email acceptance or sends revoked invitations',async () => {
    const f = await negotiationFixture(); configured.mockReturnValue(true); mail.sendEmail.mockRejectedValue(new Error('Provider timeout after acceptance unknown'));
    const worker = new GuestDeliveryService(prisma,mail as any,audit), delivery = await db.guestDelivery.findFirst();
    await worker.deliver(delivery.id); await worker.deliver(delivery.id);
    expect(mail.sendEmail).toHaveBeenCalledTimes(1); expect((await db.guestDelivery.findUnique({ where: { id: delivery.id } })).status).toBe('uncertain');
    const other = await negotiationFixture(); await other.negotiation.revoke(other.id,other.invite.id,actors.counsel);
    const cancelled = await db.guestDelivery.findFirst({ where: { invitationId: other.invite.id } });
    await worker.deliver(cancelled.id); expect(mail.sendEmail).toHaveBeenCalledTimes(1); expect(cancelled.status).toBe('cancelled');
  });

  it('prevents legacy metadata and email approval routes from bypassing negotiation controls',async () => {
    const f = await negotiationFixture();
    await expect(f.contracts.update(f.id,{ stage: 'review' },actors.counsel)).rejects.toThrow('current lifecycle');
    await expect(f.contracts.update(f.id,{ title: 'Silent replacement' },actors.counsel)).rejects.toThrow('current lifecycle');
    await expect(f.contracts.update(f.id,{ title: 'Other lawyer' },actors['other-lawyer'])).rejects.toThrow('another lawyer');
    await expect(f.workflow.requestApproval(f.id,{ approvers: [actors.approver.email] },actors.counsel.email)).rejects.toThrow('Agreement Workspace');
    expect(await db.approvalRouting.count()).toBe(0);
    const fresh = await readyForReview();
    await expect(fresh.contracts.update(fresh.request.contractId,{ stage: 'active' },actors.counsel)).rejects.toThrow('Metadata edits cannot');
    await expect(fresh.contracts.update(fresh.request.contractId,{ version: 'v999' },actors.counsel)).rejects.toThrow('Metadata edits cannot');
  });

  it('rechecks lifecycle state under the legacy approval write lock after a concurrent change',async () => {
    const f = await readyForReview(); const id = f.request.contractId;
    const review = await f.review.getReview(id);
    f.review.getReview.mockImplementationOnce(async () => { await db.contract.update({ where: { id }, data: { stage: 'negotiation' } }); return review; });
    await expect(f.workflow.requestApproval(id,{ approvers: [actors.approver.email] },actors.counsel.email)).rejects.toThrow('current lifecycle stage');
    expect(await db.approvalRouting.count()).toBe(0); expect(mail.sendEmail).not.toHaveBeenCalled();
  });

  it('shows who actually owns the next action across negotiation, approval and signing',async () => {
    const f = await negotiationFixture(), token = await guestLogin(f);
    expect((await f.agreements.work(actors.counsel)).items[0]).toMatchObject({ waitingFor: 'counterparty', waitingOn: f.request.counterparty });
    await f.negotiation.accept(f.invite.id,token,f.invite.documentId);
    expect((await f.agreements.snapshot(f.id,actors.counsel)).contract).toMatchObject({ waitingFor: 'legal', nextAction: 'Confirm the agreed form' });
    await f.negotiation.agreed(f.id,await f.version(),actors.counsel);
    await f.workflow.routeInApp(f.id,{ approvers: [actors.approver.email] },actors.counsel);
    expect((await f.agreements.snapshot(f.id,actors.counsel)).contract).toMatchObject({ waitingFor: 'approver', waitingOn: actors.approver.name });
    await f.workflow.decideInApp(f.id,{ decision: 'approved' },actors.approver);
    expect((await f.agreements.snapshot(f.id,actors.counsel)).contract).toMatchObject({ waitingFor: 'legal', nextAction: 'Prepare the approved document for signature' });
    await db.signatureRequest.create({ data: { id: randomUUID(), contractId: f.id, contractTitle: f.request.title, status: 'sent', provider: 'test-fixture', signatories: [], audit: [] } });
    expect((await f.agreements.work(actors.counsel)).items[0]).toMatchObject({ waitingFor: 'signatory', waitingOn: 'Signatories' });
  });

  it('enforces policy approvers, revision safety and policy evidence in a real approval round', async () => {
    const f = await readyForReview(); const id = f.request.contractId;
    const policy = new ApprovalPolicyController(prisma,audit);
    const input: any = { id: randomUUID(), revision: 0, name: 'Finance threshold', enabled: true, conditions: { minimumValue: 10000, currency: 'INR' }, approvers: [actors.approver.email] };
    await policy.save(input,{ user: actors.admin });
    await expect(policy.save(input,{ user: actors.admin })).rejects.toThrow('changed');
    await f.workflow.routeInApp(id,{ approvers: [], note: 'Legal recommendation' },actors.counsel);
    const route = await db.approvalRouting.findUnique({ where: { contractId: id } });
    expect(route.approvers).toEqual([actors.approver.email]);
    expect(route.policyEvidence[0]).toMatchObject({ policyId: input.id, revision: 1 });
    expect((await db.approvalStep.findFirst({ where: { contractId: id } })).reason).toContain('Finance threshold');
    await policy.save({ ...input, revision: 1, enabled: false },{ user: actors.admin });
    expect((await db.approvalRouting.findUnique({ where: { contractId: id } })).policyEvidence[0].revision).toBe(1);
  });
  it('blocks invalid mandatory approvers and the legacy routing bypass', async () => {
    const f = await readyForReview(); const id = f.request.contractId;
    await db.approvalPolicy.create({ data: { id: randomUUID(), name: 'Mandatory review', conditions: {}, approvers: [actors.viewer.email], updatedBy: actors.admin.id } });
    await expect(f.workflow.routeInApp(id,{ approvers: [actors.lead.email] },actors.counsel)).rejects.toThrow('approval authority');
    expect(await db.approvalRouting.count()).toBe(0);
    await expect(f.workflow.requestApproval(id,{ approvers: [actors.lead.email] },actors.counsel.email)).rejects.toThrow('mandatory policies');
  });
  it('changes guest permissions with a version check and invalidates existing sessions', async () => {
    const f = await negotiationFixture(); const token = await guestLogin(f);
    const access = { version: 1, expiresAt: new Date(Date.now()+5*86400000).toISOString(), allowDownload: true, allowRedline: false, allowUpload: false, shareExecuted: false };
    await expect(f.negotiation.access(f.id,f.invite.id,access,actors['other-lawyer'])).rejects.toThrow('another lawyer');
    await expect(f.negotiation.access(f.id,'other-invitation',access,actors.counsel)).rejects.toThrow();
    await f.negotiation.access(f.id,f.invite.id,access,actors.counsel);
    await expect(f.auth.authenticate(f.invite.id,token)).rejects.toThrow();
    await expect(f.negotiation.access(f.id,f.invite.id,access,actors.counsel)).rejects.toThrow('changed');
    const entry = (await f.negotiation.administration())[0];
    expect(entry).toMatchObject({ allowRedline: false, version: 2 });
    for (const secret of ['otpHash','challengeId','sessions','requestHash']) expect(entry).not.toHaveProperty(secret);
  });
  it('requires an explicit executed-copy grant and verifies its exact archive and bytes', async () => {
    const f = await negotiationFixture(); const token = await guestLogin(f);
    await expect(f.negotiation.executedFile(f.invite.id,token)).rejects.toThrow('not shared');
    const pdf = Buffer.from('%PDF-1.7\nExecuted test fixture'), key = await f.storage.put(pdf), archiveId = randomUUID();
    await db.archivedDocument.create({ data: { id: archiveId, requestId: randomUUID(), contractId: f.id, contractTitle: 'Test', signatories: [], completedAt: new Date(), storageKey: key, checksum: createHash('sha256').update(pdf).digest('hex'), format: 'application/pdf', size: pdf.length } });
    await db.contract.update({ where: { id: f.id }, data: { stage: 'active', executedAt: new Date(), authoritativeArchiveId: archiveId } });
    await f.negotiation.access(f.id,f.invite.id,{ version: 1, expiresAt: f.invite.expiresAt, allowDownload: false, allowRedline: false, allowUpload: false, shareExecuted: true },actors.counsel);
    await db.guestInvitation.update({ where: { id: f.invite.id }, data: { otpSentAt: null } });
    const fresh = await guestLogin(f);
    expect((await f.negotiation.room(f.invite.id,fresh)).executedAvailable).toBe(true);
    expect((await f.negotiation.executedFile(f.invite.id,fresh)).buffer).toEqual(pdf);
    await db.archivedDocument.update({ where: { id: archiveId }, data: { checksum: 'tampered' } });
    await expect(f.negotiation.executedFile(f.invite.id,fresh)).rejects.toThrow('integrity');
    await f.negotiation.revoke(f.id,f.invite.id,actors.counsel);
    await expect(f.negotiation.executedFile(f.invite.id,fresh)).rejects.toThrow();
  });
  it('queues one internal round analysis and never includes it in the guest projection', async () => {
    process.env.AI_REVIEW_PROVIDER = 'none';
    try {
      const f = await negotiationFixture(); const token = await guestLogin(f); const room = await f.negotiation.room(f.invite.id,token);
      const responseId = randomUUID();
      await f.negotiation.respond(f.invite.id,token,{ id: responseId, documentId: room.documentId, sections: room.sections.map((s: any) => ({ ...s, body: s.body+' Each party shall protect personal data.' })) });
      const worker = new RoundAnalysisService(prisma,f.storage as any,audit);
      await Promise.all([worker.processNext(),worker.processNext()]);
      expect(await db.negotiationAnalysis.count()).toBe(1);
      expect((await db.negotiationAnalysis.findUnique({ where: { responseId } })).status).toBe('unavailable');
      expect((await f.negotiation.workspace(f.id,actors.counsel)).responses[0].analysis.detail).toContain('Configure Legal AI');
      expect((await f.negotiation.room(f.invite.id,token)).response).not.toHaveProperty('analysis');
      expect(await db.auditEvent.count({ where: { action: 'negotiation.round_analyzed' } })).toBe(1);
    } finally { delete process.env.AI_REVIEW_PROVIDER; }
  });
  it('extracts source-backed commitments once, with no reminders until Legal confirms', async () => {
    process.env.AI_REVIEW_PROVIDER = 'none'; process.env.OCR_PROVIDER = 'none';
    try {
      const f = await readyForReview(); const id = f.request.contractId;
      const doc = await db.document.findFirst({ where: { contractId: id } });
      await db.document.update({ where: { id: doc.id }, data: { extractedText: 'Supplier shall maintain insurance and provide annual certificates. Customer shall pay invoices within 30 days.' } });
      const signatureId = randomUUID(), archiveId = randomUUID(), pdf = Buffer.from('%PDF-1.7\nExecuted test'), key = await f.storage.put(pdf);
      await db.signatureRequest.create({ data: { id: signatureId, contractId: id, contractTitle: 'Test', status: 'completed', provider: 'fixture', signatories: [], audit: [], documentId: doc.id, documentSha256: doc.sha256 } });
      await db.archivedDocument.create({ data: { id: archiveId, requestId: signatureId, contractId: id, contractTitle: 'Test', signatories: [], completedAt: new Date(), storageKey: key, checksum: createHash('sha256').update(pdf).digest('hex'), format: 'application/pdf', size: pdf.length } });
      await db.contract.update({ where: { id }, data: { authoritativeArchiveId: archiveId, executedAt: new Date(), stage: 'active' } });
      const worker = new ObligationExtractionService(prisma,f.storage as any,audit);
      await worker.request(id,actors.counsel,true);
      await Promise.all([worker.processNext(),worker.processNext()]);
      const rows = await db.agreementObligation.findMany({ where: { contractId: id } });
      expect(rows).toHaveLength(2); expect(rows.every((o: any) => !o.confirmed && o.dueDate === '' && o.evidence.includes('Approved source'))).toBe(true);
      expect((await worker.request(id,actors.counsel)).source).toBe('approved-source');
      await db.obligationExtraction.update({ where: { archiveId }, data: { status: 'queued' } }); await worker.processNext();
      expect(await db.agreementObligation.count({ where: { contractId: id } })).toBe(2);
    } finally { delete process.env.AI_REVIEW_PROVIDER; delete process.env.OCR_PROVIDER; }
  });

});
