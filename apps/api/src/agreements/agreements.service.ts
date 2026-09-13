import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID, createHash } from 'crypto';
import { AuthUser, can, normalizeRole, PERMISSIONS, nextAction, WorkItem, AgreementWorkspace } from '@concord/shared';
import { PrismaService } from '../persistence/prisma.service';
import { ClientRequestsService } from '../client-requests/client-requests.service';
import { ContractsService } from '../contracts/contracts.service';
import { AuthoringService } from '../authoring/authoring.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { FileSecurityService } from '../security/file-security.service';
import { SaveDraftDto, StartDraftDto, CreateAgreementDto, AgreementTransitionDto, ReviseAgreementDto, AgreementObligationDto } from './agreement.dto';
import { isGraphConfigured } from '../notifications/graph.client';
import { canonicalJson } from '../common/canonical-json';
import { draftDocument } from './draft-document';

const REQUEST_META = { select: { id: true, requestedByDate: true, urgency: true, businessUnit: true, clientStatus: true, assignedLegalUserId: true, assignedLegal: { select: { name: true } }, requester: { select: { name: true } } } };

@Injectable()
export class AgreementsService {
  constructor(private readonly prisma: PrismaService, private readonly requests: ClientRequestsService, private readonly contracts: ContractsService, private readonly authoring: AuthoringService, private readonly audit: AuditService, private readonly storage: StorageService, private readonly security: FileSecurityService) {}
  private db() { if (!this.prisma.enabled) throw new ServiceUnavailableException('This action requires saved agreement records.'); return this.prisma.client; }
  private item(row: any): WorkItem {
    const r = row.intakeRequest;
    return { id: row.id, title: row.title, counterparty: row.counterparty, type: row.type, valueDisplay: row.valueDisplay, stage: row.stage, risk: row.risk, version: row.version, source: row.source,
      requestId: r?.id, ownerId: r?.assignedLegalUserId ?? row.ownerId ?? undefined, ownerName: r?.assignedLegal?.name ?? row.owner?.name, businessOwner: r?.requester?.name, businessUnit: r?.businessUnit, dueDate: r?.requestedByDate ?? undefined,
      priority: r?.urgency ?? 'standard', waitingOnClient: r?.clientStatus === 'waiting-on-client', nextAction: nextAction(row.stage, r?.clientStatus === 'waiting-on-client') };
  }
  async work(actor: AuthUser, view = 'all') {
    if (!['all', 'mine'].includes(view)) throw new BadRequestException('Choose all work or work assigned to you.');
    if (!this.prisma.enabled) { const items = (await this.contracts.listFresh()).map(c => this.item(c)); return { items: view === 'mine' ? [] : items, total: view === 'mine' ? 0 : items.length, limited: false }; }
    const where = { ...(view === 'mine' ? { OR: [{ intakeRequest: { assignedLegalUserId: actor.id } }, { intakeRequest: null, ownerId: actor.id }] } : {}), NOT: { intakeRequest: { clientStatus: 'closed' }, stage: 'intake' } };
    const [rows, total] = await Promise.all([this.db().contract.findMany({ where, include: { intakeRequest: REQUEST_META, owner: { select: { name: true } } }, take: 1000, orderBy: { updatedAt: 'desc' } }), this.db().contract.count({ where })]);
    return { items: rows.map((r: any) => this.item(r)), total, limited: total > rows.length };
  }
  async snapshot(id: string, actor: AuthUser): Promise<AgreementWorkspace> {
    const role = normalizeRole(actor.role);
    if (!this.prisma.enabled) { const c = await this.contracts.getByIdFresh(id); return { contract: this.item(c), request: null, permissions: PERMISSIONS[role], revision: 0, documents: [], draft: null, approval: null, archive: null, obligations: [], activity: [] }; }
    const row = await this.db().contract.findUnique({ where: { id }, include: { intakeRequest: REQUEST_META, owner: { select: { name: true } }, approvalHistory: { orderBy: { createdAt: 'desc' } }, draft: true, documents: { orderBy: { createdAt: 'desc' }, select: { id: true, filename: true, status: true, sha256: true, createdAt: true, blobPath: true } }, obligations: { orderBy: { dueDate: 'asc' } } } });
    if (!row) throw new NotFoundException('Agreement not found.');
    let request = null;
    if (row.intakeRequest && can(role, 'request:read')) { try { request = await this.requests.get(row.intakeRequest.id, actor); } catch (e) { if (!(e instanceof NotFoundException)) throw e; } }
    const [routing, decision, archive, events] = await Promise.all([
      this.db().approvalRouting.findUnique({ where: { contractId: id } }), this.db().approvalDecision.findUnique({ where: { contractId: id } }),
      row.authoritativeArchiveId ? this.db().archivedDocument.findUnique({ where: { id: row.authoritativeArchiveId } }) : null,
      can(role, 'audit:read') ? this.db().auditEvent.findMany({ where: { OR: [{ entity: 'contract', entityId: id }, ...(request ? [{ entity: 'intake', entityId: request.id }] : [])] }, orderBy: { seq: 'desc' }, take: 80, select: { id: true, at: true, summary: true, action: true } }) : [],
    ]);
    return { contract: this.item(row), request, permissions: PERMISSIONS[role], revision: row.lifecycleRevision, documents: row.documents.map((d: any) => ({ id: d.id, filename: d.filename, status: d.status, sha256: d.sha256 ?? undefined, createdAt: d.createdAt.toISOString(), hasFile: !!d.blobPath && d.status !== 'quarantined' })),
      draft: row.draft ? { templateId: row.draft.templateId, sections: row.draft.sections, model: row.draft.model, revision: row.draft.revision, documentId: row.draft.documentId } : null,
      approval: routing ? { approvers: routing.approvers, expiresAt: routing.expiresAt.toISOString(), documentId: routing.documentId, decision: decision?.decision, decidedBy: decision?.decidedBy } : null,
      archive: archive ? { id: archive.id, filename: archive.filename ?? 'Executed agreement', checksum: archive.checksum, completedAt: archive.completedAt.toISOString() } : null,
      obligations: row.obligations.map((o: any) => ({ id: o.id, title: o.title, type: o.type, dueDate: o.dueDate, ownerEmail: o.ownerEmail ?? undefined, evidence: o.evidence, confirmed: o.confirmed, completedAt: o.completedAt?.toISOString() })),
      activity: events.map((e: any) => ({ ...e, at: e.at.toISOString() })), approvalHistory: row.approvalHistory.map((r: any) => ({ id: r.id, version: r.contractVersion, decision: r.evidence.decision.decision, archivedAt: r.createdAt.toISOString(), evidenceSha256: r.evidenceSha256, steps: r.evidence.steps.map((s: any) => ({ approverName: s.approverName, decision: s.decision, comment: s.comment })) })) };
  }
  private async editable(tx: any, id: string, revision: number) {
    await tx.$queryRawUnsafe('SELECT id FROM "Contract" WHERE id = $1 FOR UPDATE', id);
    const contract = await tx.contract.findUnique({ where: { id }, include: { intakeRequest: true } });
    if (!contract) throw new NotFoundException('Agreement not found.');
    if (contract.lifecycleRevision !== revision) throw new ConflictException('This agreement changed. Refresh before saving.');
    if (['active', 'renewal', 'signature'].includes(contract.stage) || contract.executedAt) throw new ConflictException('This agreement is locked for execution or ongoing management.');
    const [route, decision, signature] = await Promise.all([tx.approvalRouting.findUnique({ where: { contractId: id } }), tx.approvalDecision.findUnique({ where: { contractId: id } }), tx.signatureRequest.findFirst({ where: { contractId: id } })]);
    if (route || decision || signature) throw new ConflictException('The approved or routed version is locked. Its document cannot be replaced.');
    return contract;
  }
  private requireAssigned(contract: any, actor: AuthUser) {
    const owner = contract.intakeRequest?.assignedLegalUserId ?? contract.ownerId;
    if (owner && !['admin', 'lead'].includes(normalizeRole(actor.role)) && owner !== actor.id) throw new ForbiddenException('This agreement is assigned to another lawyer.');
  }
  async create(dto: CreateAgreementDto, actor: AuthUser) {
    const id = randomUUID();
    await this.db().$transaction(async (tx: any) => {
      await tx.contract.create({ data: { id, title: dto.title.trim(), counterparty: dto.counterparty.trim(), type: dto.type, valueDisplay: 'Not specified', stage: 'drafting', risk: 'medium', version: 'v1', source: 'Legal draft', ownerId: actor.id } });
      await this.audit.recordInTransaction(tx, { actor, action: 'contract.created', entity: 'contract', entityId: id, summary: 'Agreement workspace created for drafting' });
    });
    return { id };
  }
  async startDraft(id: string, dto: StartDraftDto, actor: AuthUser) {
    const before = await this.snapshot(id, actor);
    if (before.request && !before.request.canManage) throw new ForbiddenException('Only the assigned legal team can draft this agreement.');
    if (before.contract.stage === 'intake') throw new ConflictException('Accept the request before starting a draft.');
    const draft = await this.authoring.generateDraft({ templateId: dto.templateId, counterparty: before.contract.counterparty, title: before.contract.title });
    // Business instructions stay alongside the editor. Do not silently turn a
    // requested liability or payment position into operative contract language.
    return this.saveDraft(id, { ...dto, sections: draft.sections }, actor, draft.model);
  }
  async saveDraft(id: string, dto: SaveDraftDto, actor: AuthUser, model = 'counsel-edited') {
    if (!dto.sections.length || dto.sections.every(s => !s.body.trim())) throw new BadRequestException('Add draft language before saving.');
    const before = await this.contracts.getByIdFresh(id);
    const bytes = draftDocument(before.title, dto.sections);
    const filename = `agreement-${id}-${dto.revision + 1}.docx`;
    const verdict = await this.security.check({ originalname: filename, buffer: bytes });
    if (!verdict.ok || (verdict.scan !== 'clean' && (process.env.UPLOAD_REQUIRE_SCAN === 'true' || verdict.scanEngine === 'error'))) throw new ServiceUnavailableException('The draft could not be cleared for storage by the file scanner.');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    await this.db().$transaction(async (tx: any) => {
      const contract = await this.editable(tx, id, dto.revision); this.requireAssigned(contract, actor);
      if (contract.stage === 'intake') throw new ConflictException('Accept the request before drafting.');
      const blobPath = await this.storage.put(bytes, filename, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      const doc = await tx.document.create({ data: { contractId: id, filename, documentType: contract.type, confidence: 100, status: 'validated', extraction: {}, validations: [], notes: ['Counsel-controlled draft; commercial instructions require review.'], model, blobPath, sha256, extractedText: dto.sections.map(s => `${s.heading}\n${s.body}`).join('\n\n') } });
      const data = { templateId: dto.templateId, sections: dto.sections, model, documentId: doc.id, updatedBy: actor.id };
      await tx.agreementDraft.upsert({ where: { contractId: id }, create: { contractId: id, ...data }, update: { ...data, revision: { increment: 1 } } });
      await tx.contract.update({ where: { id }, data: { lifecycleRevision: { increment: 1 }, version: `v${dto.revision + 2}`, stage: 'drafting' } });
      await this.audit.recordInTransaction(tx, { actor, action: 'contract.draft_saved', entity: 'contract', entityId: id, summary: 'Draft version saved with an editable source document', metadata: { documentId: doc.id, sha256, templateId: dto.templateId, model } });
    }, { timeout: 30_000, maxWait: 10_000 });
    return this.snapshot(id, actor);
  }
  async transition(id: string, dto: AgreementTransitionDto, actor: AuthUser) {
    await this.db().$transaction(async (tx: any) => {
      const contract = await this.editable(tx, id, dto.revision); this.requireAssigned(contract, actor);
      if (!['drafting', 'review'].includes(contract.stage)) throw new ConflictException('Only drafting and review can be changed here.');
      if (dto.stage === 'review' && !await tx.document.findFirst({ where: { contractId: id, status: { not: 'quarantined' }, blobPath: { not: null } } })) throw new BadRequestException('Save or upload an agreement before review.');
      await tx.contract.update({ where: { id }, data: { stage: dto.stage, lifecycleRevision: { increment: 1 } } });
      await this.audit.recordInTransaction(tx, { actor, action: 'contract.stage_changed', entity: 'contract', entityId: id, summary: `Agreement moved to ${dto.stage}`, metadata: { from: contract.stage, to: dto.stage } });
    });
    return this.snapshot(id, actor);
  }
  async obligation(id: string, dto: AgreementObligationDto, actor: AuthUser) {
    if (!Number.isFinite(Date.parse(dto.dueDate)) || new Date(dto.dueDate).toISOString().slice(0,10) !== dto.dueDate) throw new BadRequestException('Enter a valid calendar date.');
    await this.db().$transaction(async (tx: any) => {
      await tx.$queryRawUnsafe('SELECT id FROM "Contract" WHERE id = $1 FOR UPDATE', id);
      const contract = await tx.contract.findUnique({ where: { id }, include: { intakeRequest: true } });
      if (!contract) throw new NotFoundException('Agreement not found.');
      this.requireAssigned(contract, actor);
      if (!contract.authoritativeArchiveId) throw new ConflictException('Confirm ongoing obligations after the executed agreement is filed.');
      if (contract.lifecycleRevision !== dto.revision) throw new ConflictException('This agreement changed. Refresh before saving the obligation.');
      const owner = await tx.user.findUnique({ where: { email: dto.ownerEmail.trim().toLowerCase() } });
      if (!owner || !(can(normalizeRole(owner.role), 'contract:read') || owner.id === contract.intakeRequest?.requesterId)) throw new BadRequestException('Choose an existing legal account or this agreement’s business requestor as the owner.');
      const previous = await tx.agreementObligation.findUnique({ where: { id: dto.id } });
      if (previous && previous.contractId !== id) throw new NotFoundException('Obligation not found.');
      const values = { title: dto.title.trim(), type: dto.type, dueDate: dto.dueDate, ownerEmail: owner.email, evidence: dto.evidence.trim(), confirmed: true, completedAt: dto.completed ? previous?.completedAt ?? new Date() : null };
      await tx.agreementObligation.upsert({ where: { id: dto.id }, create: { id: dto.id, contractId: id, sourceArchiveId: contract.authoritativeArchiveId, ...values }, update: values });
      await tx.contract.update({ where: { id }, data: { lifecycleRevision: { increment: 1 } } });
      if (!dto.completed && (!previous?.confirmed || previous.ownerEmail !== owner.email || previous.dueDate !== dto.dueDate)) await tx.requestNotification.create({ data: { id: randomUUID(), contractId: id, requestId: contract.intakeRequest?.id ?? null, recipientId: owner.id, kind: `obligation:${dto.id}:${dto.revision}`, title: `Commitment assigned: ${dto.title.trim()}`, body: `${contract.title} · Due ${dto.dueDate}. ${dto.evidence.trim()}`, emailStatus: isGraphConfigured() ? 'queued' : 'awaiting-configuration' } });
      await this.audit.recordInTransaction(tx, { actor, action: dto.completed ? 'obligation.completed' : 'obligation.confirmed', entity: 'contract', entityId: id, summary: `${dto.completed ? 'Completed' : 'Confirmed'}: ${dto.title.trim()}`, metadata: { obligationId: dto.id, sourceArchiveId: contract.authoritativeArchiveId, previous, ...values } });
    });
    return this.snapshot(id, actor);
  }
  async revise(id: string, dto: ReviseAgreementDto, actor: AuthUser) {
    await this.db().$transaction(async (tx: any) => {
      await tx.$queryRawUnsafe('SELECT id FROM "Contract" WHERE id = $1 FOR UPDATE', id);
      const contract = await tx.contract.findUnique({ where: { id }, include: { intakeRequest: true } });
      if (!contract) throw new NotFoundException('Agreement not found.');
      this.requireAssigned(contract, actor);
      if (contract.lifecycleRevision !== dto.revision) throw new ConflictException('This agreement changed. Refresh before revising.');
      const [routing, decision, steps, signature] = await Promise.all([
        tx.approvalRouting.findUnique({ where: { contractId: id } }), tx.approvalDecision.findUnique({ where: { contractId: id } }),
        tx.approvalStep.findMany({ where: { contractId: id }, orderBy: { approverEmail: 'asc' } }), tx.signatureRequest.findFirst({ where: { contractId: id } }),
      ]);
      if (!routing || !decision || !['rejected', 'changes-requested'].includes(decision.decision) || signature || contract.executedAt) throw new ConflictException('Only a rejected version or a version requiring changes can be reopened here.');
      const evidence = JSON.parse(JSON.stringify({ routing, decision, steps, revisionReason: dto.reason.trim() }));
      const evidenceSha256 = createHash('sha256').update(canonicalJson(evidence)).digest('hex');
      const round = await tx.approvalRound.create({ data: { id: randomUUID(), contractId: id, contractVersion: contract.version, evidence, evidenceSha256 } });
      // The full previous round is retained before clearing the compatible
      // current-version indexes. Old callback document/version pins then fail.
      await tx.approvalStep.deleteMany({ where: { contractId: id } });
      await tx.approvalDecision.delete({ where: { contractId: id } });
      await tx.approvalRouting.delete({ where: { contractId: id } });
      await tx.requestNotification.updateMany({ where: { contractId: id, kind: { startsWith: 'approval-request' }, emailStatus: { in: ['queued', 'awaiting-configuration', 'retry'] } }, data: { emailStatus: 'cancelled' } });
      await tx.contract.update({ where: { id }, data: { stage: 'drafting', lifecycleRevision: { increment: 1 }, version: `v${dto.revision + 2}` } });
      await this.audit.recordInTransaction(tx, { actor, action: 'contract.revision_started', entity: 'contract', entityId: id, summary: 'A new draft revision was opened; the previous approval round remains preserved', metadata: { approvalRoundId: round.id, evidenceSha256, previousVersion: contract.version, reason: dto.reason.trim() } });
    }, { timeout: 20_000, maxWait: 10_000 });
    return this.snapshot(id, actor);
  }
}
