import { preserveWord, wordLockedSections, cleanWordForSharing } from './preserve-word';
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
import { SaveDraftDto, StartDraftDto, CreateAgreementDto, AgreementTransitionDto, ReviseAgreementDto, AgreementObligationDto, AgreementCommentDto, ResolveCommentDto, RewriteSectionDto, CreateAmendmentDto } from './agreement.dto';
import { isGraphConfigured } from '../notifications/graph.client';
import { canonicalJson } from '../common/canonical-json';
import { draftDocument } from './draft-document';
import { recordVersion } from './version-record';
import { readEditableDocument } from './read-document';

const REQUEST_META = { select: { id: true, requestedByDate: true, urgency: true, businessUnit: true, clientStatus: true, assignedLegalUserId: true, assignedLegal: { select: { name: true } }, requester: { select: { name: true } } } };

const attentionRelations = () => ({
  approvalSteps: { where: { decision: 'pending' }, select: { approverName: true }, orderBy: { approverName: 'asc' as const } },
  guestInvitations: { where: { revokedAt: null, expiresAt: { gt: new Date() } }, select: { responseDueAt: true }, take: 25 },
});

@Injectable()
export class AgreementsService {
  constructor(private readonly prisma: PrismaService, private readonly requests: ClientRequestsService, private readonly contracts: ContractsService, private readonly authoring: AuthoringService, private readonly audit: AuditService, private readonly storage: StorageService, private readonly security: FileSecurityService) {}
  private db() { if (!this.prisma.enabled) throw new ServiceUnavailableException('This action requires saved agreement records.'); return this.prisma.client; }
  private item(row: any): WorkItem {
    const r = row.intakeRequest;
    const legalOwner = r?.assignedLegal?.name ?? row.owner?.name ?? 'Legal team';
    const ongoing = ['active','renewal'].includes(row.stage);
    const waitingFor: WorkItem['waitingFor'] = ongoing ? 'obligation-owner' : r?.clientStatus === 'waiting-on-client' ? 'business' : row.stage === 'approval' ? 'approver' : row.stage === 'signature' && ['sent','viewed','partially-signed'].includes(row.signingStatus) ? 'signatory' : row.stage === 'negotiation' && row.negotiationState === 'with-counterparty' ? 'counterparty' : 'legal';
    const waitingOn = waitingFor === 'business' ? r?.requester?.name ?? 'Business owner' : waitingFor === 'counterparty' ? row.counterparty : waitingFor === 'approver' ? row.approvalSteps?.map((s: any) => s.approverName).join(', ') || 'Assigned approvers' : waitingFor === 'signatory' ? 'Signatories' : waitingFor === 'obligation-owner' ? 'Commitment owners' : legalOwner;
    const action = waitingFor === 'business' ? 'Respond to Legal’s question' : row.negotiationState === 'changes-received' && row.stage === 'negotiation' ? 'Review counterparty changes' : waitingFor === 'counterparty' ? 'Await the counterparty’s response' : row.negotiationState === 'ready-to-share' && row.stage === 'negotiation' ? 'Share the resolved Legal response' : row.negotiationState === 'agreed-pending' && row.stage === 'negotiation' ? 'Confirm the agreed form' : row.stage === 'signature' && waitingFor === 'legal' ? row.signingStatus === 'completed' ? 'Confirm executed-copy filing' : 'Prepare the approved document for signature' : nextAction(row.stage,false);
    const responseDates = (row.guestInvitations ?? []).map((g: any) => g.responseDueAt?.toISOString().slice(0,10)).filter(Boolean).sort();
    return { id: row.id, title: row.title, counterparty: row.counterparty, type: row.type, valueDisplay: row.valueDisplay, stage: row.stage, risk: row.risk, version: row.version, source: row.source,
      requestId: r?.id, ownerId: r?.assignedLegalUserId ?? row.ownerId ?? undefined, ownerName: r?.assignedLegal?.name ?? row.owner?.name, businessOwner: r?.requester?.name, businessUnit: r?.businessUnit, dueDate: waitingFor === 'counterparty' ? responseDates[0] ?? r?.requestedByDate ?? undefined : r?.requestedByDate ?? undefined,
      parentAgreementId: row.parentAgreementId ?? undefined, negotiationState: row.negotiationState ?? undefined, waitingOn, waitingFor,
      priority: r?.urgency ?? 'standard', waitingOnClient: waitingFor === 'business', nextAction: action };

  }
  async work(actor: AuthUser, view = 'all') {
    if (!['all', 'mine'].includes(view)) throw new BadRequestException('Choose all work or work assigned to you.');
    if (!this.prisma.enabled) { const items = (await this.contracts.listFresh()).map(c => this.item(c)); return { items: view === 'mine' ? [] : items, total: view === 'mine' ? 0 : items.length, limited: false }; }
    const where = { ...(view === 'mine' ? { OR: [{ intakeRequest: { assignedLegalUserId: actor.id } }, { intakeRequest: null, ownerId: actor.id }] } : {}), NOT: { intakeRequest: { clientStatus: 'closed' }, stage: 'intake' } };
    const [rows, total] = await Promise.all([this.db().contract.findMany({ where, include: { ...attentionRelations(), intakeRequest: REQUEST_META, owner: { select: { name: true } } }, take: 1000, orderBy: { updatedAt: 'desc' } }), this.db().contract.count({ where })]);
    const signingIds = rows.filter((r: any) => r.stage === 'signature').map((r: any) => r.id);
    const signatures = signingIds.length ? await this.db().signatureRequest.findMany({ where: { contractId: { in: signingIds } }, select: { contractId: true, status: true }, orderBy: { createdAt: 'desc' } }) : [];
    const signingStatus = new Map<string,string>(); for (const s of signatures) if (!signingStatus.has(s.contractId)) signingStatus.set(s.contractId,s.status);
    return { items: rows.map((r: any) => this.item({ ...r, signingStatus: signingStatus.get(r.id) })), total, limited: total > rows.length };
  }
  async snapshot(id: string, actor: AuthUser): Promise<AgreementWorkspace> {
    const role = normalizeRole(actor.role);
    if (!this.prisma.enabled) { const c = await this.contracts.getByIdFresh(id); return { contract: this.item(c), request: null, permissions: PERMISSIONS[role], revision: 0, documents: [], draft: null, approval: null, archive: null, obligations: [], activity: [] }; }
    const row = await this.db().contract.findUnique({ where: { id }, include: { ...attentionRelations(), intakeRequest: REQUEST_META, owner: { select: { name: true } }, parentAgreement: { select: { id: true, title: true } }, amendments: { select: { id: true, title: true, stage: true }, orderBy: { createdAt: 'desc' } }, versions: { orderBy: { number: 'desc' }, include: { document: { select: { sha256: true } } } }, comments: { orderBy: { createdAt: 'asc' } }, approvalHistory: { orderBy: { createdAt: 'desc' } }, draft: true, documents: { orderBy: { createdAt: 'desc' }, select: { id: true, filename: true, status: true, sha256: true, createdAt: true, blobPath: true } }, obligations: { orderBy: { dueDate: 'asc' } } } });
    if (!row) throw new NotFoundException('Agreement not found.');
    let request = null;
    if (row.intakeRequest && can(role, 'request:read')) { try { request = await this.requests.get(row.intakeRequest.id, actor); } catch (e) { if (!(e instanceof NotFoundException)) throw e; } }
    const [routing, decision, archive, events, signing] = await Promise.all([
      this.db().approvalRouting.findUnique({ where: { contractId: id } }), this.db().approvalDecision.findUnique({ where: { contractId: id } }),
      row.authoritativeArchiveId ? this.db().archivedDocument.findUnique({ where: { id: row.authoritativeArchiveId } }) : null,
      can(role, 'audit:read') ? this.db().auditEvent.findMany({ where: { OR: [{ entity: 'contract', entityId: id }, ...(request ? [{ entity: 'intake', entityId: request.id }] : [])] }, orderBy: { seq: 'desc' }, take: 80, select: { id: true, at: true, summary: true, action: true } }) : [],
      row.stage === 'signature' ? this.db().signatureRequest.findFirst({ where: { contractId: id }, select: { status: true }, orderBy: { createdAt: 'desc' } }) : null,
    ]);
    return { contract: this.item({ ...row, signingStatus: signing?.status }), request, needsNewVersion: row.needsNewVersion, parentAgreement: row.parentAgreement, amendments: row.amendments,
      versionHistory: row.versions.map((v: any) => ({ documentId: v.documentId, number: v.number, label: v.label, authorName: v.authorName, organisation: v.organisation ?? undefined, source: v.source, reason: v.reason, stage: v.stage, round: v.round, createdAt: v.createdAt.toISOString(), sha256: v.document.sha256 ?? undefined, sharedAt: v.sharedAt?.toISOString(), agreedAt: v.agreedAt?.toISOString(), approvedAt: v.approvedAt?.toISOString(), executedAt: v.executedAt?.toISOString(), sections: v.sections ?? undefined, changeSummary: v.changeSummary ?? undefined })),
      comments: row.comments.map((v: any) => ({ id: v.id, documentId: v.documentId, sectionId: v.sectionId ?? undefined, body: v.body, visibility: v.visibility, authorName: v.authorName, createdAt: v.createdAt.toISOString(), resolvedAt: v.resolvedAt?.toISOString(), parentId: v.parentId ?? undefined })), permissions: PERMISSIONS[role], revision: row.lifecycleRevision, documents: row.documents.map((d: any) => ({ id: d.id, filename: d.filename, status: d.status, sha256: d.sha256 ?? undefined, createdAt: d.createdAt.toISOString(), hasFile: !!d.blobPath && d.status !== 'quarantined' })),
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
    if (['active', 'renewal', 'signature', 'agreed'].includes(contract.stage) || contract.executedAt) throw new ConflictException('This agreement is locked for execution or ongoing management.');
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
    const ids = dto.sections.map((s,i) => s.id ?? `section-${i}`);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Every clause must have a distinct identifier.');
    const sections = dto.sections.map((s,i) => ({ ...s, id: ids[i] }));
    await this.db().$transaction(async (tx: any) => { const c = await this.editable(tx,id,dto.revision); this.requireAssigned(c,actor); });
    let bytes = draftDocument(before.title, sections);
    if (dto.sourceDocumentId) {
      const source = await this.db().document.findFirst({ where: { id: dto.sourceDocumentId, contractId: id, status: { not: 'quarantined' } }, include: { versionRecord: true } });
      if (!source?.blobPath) throw new ConflictException('The editing source is no longer available.');
      if (source.filename.toLowerCase().endsWith('.docx') && (!source.versionRecord?.sections || createHash('sha256').update(draftDocument(before.title,source.versionRecord.sections as any)).digest('hex') !== source.sha256 || (source.versionRecord.sections as any[]).some(s => s.kind === 'paragraph'))) {
        const original = await this.storage.get(source.blobPath);
        if (createHash('sha256').update(original.buffer).digest('hex') !== source.sha256) throw new ConflictException('Source document integrity failed.');
        if (readEditableDocument(original.buffer,source.filename).trackedChanges && !dto.confirmTrackedChanges) throw new BadRequestException('Review and confirm the tracked Word changes before saving.');
        bytes = preserveWord(original.buffer,sections, dto.confirmTrackedChanges); model = 'word-preserved';
      }
    }
    if (dto.prepareExternalCopy) { bytes = cleanWordForSharing(bytes); model = 'word-external'; }
    const filename = `agreement-${id}-${dto.revision + 1}.docx`;
    const verdict = await this.security.check({ originalname: filename, buffer: bytes });
    if (!verdict.ok || (verdict.scan !== 'clean' && (process.env.UPLOAD_REQUIRE_SCAN === 'true' || verdict.scanEngine === 'error'))) throw new ServiceUnavailableException('The draft could not be cleared for storage by the file scanner.');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    await this.db().$transaction(async (tx: any) => {
      const contract = await this.editable(tx, id, dto.revision); this.requireAssigned(contract, actor);
      if (contract.stage === 'intake') throw new ConflictException('Accept the request before drafting.');
      const latest = await tx.document.findFirst({ where: { contractId: id, status: { not: 'quarantined' }, blobPath: { not: null } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
      if (dto.sourceDocumentId && dto.sourceDocumentId !== latest?.id) throw new ConflictException('A newer document is available. Compare your changes with the current version before saving.');
      const blobPath = await this.storage.put(bytes, filename, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      const doc = await tx.document.create({ data: { contractId: id, filename, documentType: contract.type, confidence: 100, status: 'validated', extraction: {}, validations: [], notes: ['Counsel-controlled draft; commercial instructions require review.'], model, blobPath, sha256, extractedText: sections.map(s => `${s.heading}\n${s.body}`).join('\n\n') } });
      const data = { templateId: dto.templateId, sections, model, documentId: doc.id, updatedBy: actor.id };
      await tx.agreementDraft.upsert({ where: { contractId: id }, create: { contractId: id, ...data }, update: { ...data, revision: { increment: 1 } } });
      const version = await recordVersion(tx, { documentId: doc.id, contract, actor, sections, source: ['counsel-edited','word-preserved','word-external'].includes(model) ? 'legal-edit' : model === 'template-assembly' ? 'template' : 'ai-assisted', reason: dto.reason?.trim() || 'Draft saved by Legal' });
      await tx.contract.update({ where: { id }, data: { lifecycleRevision: { increment: 1 }, stage: contract.stage === 'review' ? 'review' : contract.stage === 'negotiation' ? 'negotiation' : 'drafting', ...(contract.stage === 'negotiation' ? { negotiationState: 'legal-review' } : {}) } });
      await this.audit.recordInTransaction(tx, { actor, action: 'contract.draft_saved', entity: 'contract', entityId: id, summary: 'Draft version saved with an editable source document', metadata: { documentId: doc.id, version: version.label, reason: version.reason, sha256, templateId: dto.templateId, model } });
    }, { timeout: 30_000, maxWait: 10_000 });
    return this.snapshot(id, actor);
  }
  async editor(id: string, actor: AuthUser) {
    const db = this.db();
    const contract = await db.contract.findUnique({ where: { id }, include: { intakeRequest: true, draft: true } });
    if (!contract) throw new NotFoundException('Agreement not found.');
    this.requireAssigned(contract, actor);
    const doc = await db.document.findFirst({ where: { contractId: id, status: { not: 'quarantined' }, blobPath: { not: null } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    if (!doc) return { documentId: null, revision: contract.lifecycleRevision, sections: [], original: [], trackedChanges: false, notice: '' };
    const file = await this.storage.get(doc.blobPath!);
    if (!doc.sha256 || createHash('sha256').update(file.buffer).digest('hex') !== doc.sha256) throw new ConflictException('The saved document failed its integrity check. Editing is blocked.');
    const current = contract.draft?.documentId === doc.id ? contract.draft : null;
    const response = await db.negotiationResponse.findFirst({ where: { documentId: doc.id } });
    const content = current ? { sections: current.sections, original: response?.originalSections ?? current.sections, trackedChanges: !!response, notice: response ? 'Counterparty language is a proposal. Compare it with the shared draft, resolve changes and save a new Legal version.' : '' } : readEditableDocument(file.buffer, doc.filename);
    const preserveFormatting = doc.filename.toLowerCase().endsWith('.docx') && (!current || (current.sections as any[]).some(s => s.kind === 'paragraph'));
    return { documentId: doc.id, revision: contract.lifecycleRevision, filename: doc.filename, ...content, ...(preserveFormatting ? { preserveFormatting: true, lockedSections: wordLockedSections(file.buffer), notice: 'Word structure, tables, drawings and supporting parts are preserved. Changed paragraphs use their original paragraph and first-run style. Use Word for insertion, reordering and anchored content. Prepare a clean copy before external sharing.' } : {}) };
  }
  async comment(id: string, dto: AgreementCommentDto, actor: AuthUser) {
    await this.db().$transaction(async (tx: any) => {
      await tx.$queryRawUnsafe('SELECT id FROM "Contract" WHERE id = $1 FOR UPDATE', id);
      const c = await tx.contract.findUnique({ where: { id }, include: { intakeRequest: true } });
      if (!c) throw new NotFoundException('Agreement not found.');
      this.requireAssigned(c, actor);
      const doc = await tx.document.findFirst({ where: { id: dto.documentId, contractId: id, status: { not: 'quarantined' } } });
      if (!doc) throw new NotFoundException('Document not found in this agreement.');
      const prior = await tx.agreementComment.findUnique({ where: { id: dto.id } });
      if (prior) { if (prior.contractId !== id || prior.authorUserId !== actor.id || prior.body !== dto.body.trim() || prior.documentId !== dto.documentId) throw new ConflictException('This comment identifier is already in use.'); return; }
      if (dto.parentId && !await tx.agreementComment.findFirst({ where: { id: dto.parentId, contractId: id, documentId: dto.documentId, visibility: 'internal' } })) throw new NotFoundException('Internal discussion not found.');
      await tx.agreementComment.create({ data: { id: dto.id, contractId: id, documentId: doc.id, sectionId: dto.sectionId, body: dto.body.trim(), parentId: dto.parentId, authorUserId: actor.id, authorName: actor.name, visibility: 'internal' } });
      await this.audit.recordInTransaction(tx, { actor, action: 'contract.comment_added', entity: 'contract', entityId: id, summary: 'Internal document comment added', metadata: { commentId: dto.id, documentId: doc.id, visibility: 'internal' } });
    });
    return this.snapshot(id, actor);
  }
  async resolveComment(id: string, commentId: string, dto: ResolveCommentDto, actor: AuthUser) {
    await this.db().$transaction(async (tx: any) => {
      await tx.$queryRawUnsafe('SELECT id FROM "Contract" WHERE id = $1 FOR UPDATE', id);
      const c = await tx.contract.findUnique({ where: { id }, include: { intakeRequest: true } });
      if (!c) throw new NotFoundException('Agreement not found.'); this.requireAssigned(c, actor);
      const comment = await tx.agreementComment.findFirst({ where: { id: commentId, contractId: id } });
      if (!comment) throw new NotFoundException('Comment not found.');
      await tx.agreementComment.update({ where: { id: commentId }, data: { resolvedAt: dto.resolved ? new Date() : null, resolvedBy: dto.resolved ? actor.id : null } });
      await this.audit.recordInTransaction(tx, { actor, action: 'contract.comment_resolved', entity: 'contract', entityId: id, summary: dto.resolved ? 'Document comment resolved' : 'Document comment reopened', metadata: { commentId } });
    });
    return this.snapshot(id, actor);
  }
  async rewrite(id: string, dto: RewriteSectionDto, actor: AuthUser) {
    await this.db().$transaction(async (tx: any) => { const c = await this.editable(tx, id, dto.revision); this.requireAssigned(c, actor); });
    return this.authoring.rewriteSection(dto);
  }
  async amend(id: string, dto: CreateAmendmentDto, actor: AuthUser) {
    await this.db().$transaction(async (tx: any) => {
      await tx.$queryRawUnsafe('SELECT id FROM "Contract" WHERE id = $1 FOR UPDATE', id);
      const parent = await tx.contract.findUnique({ where: { id }, include: { intakeRequest: true } });
      if (!parent) throw new NotFoundException('Agreement not found.'); this.requireAssigned(parent, actor);
      if (!parent.executedAt || !parent.authoritativeArchiveId) throw new ConflictException('Create an amendment from an executed agreement.');
      const existing = await tx.contract.findUnique({ where: { id: dto.id } });
      if (existing) { if (existing.parentAgreementId !== id || existing.ownerId !== actor.id) throw new ConflictException('This amendment identifier is already in use.'); return; }
      await tx.contract.create({ data: { id: dto.id, title: dto.title.trim(), counterparty: parent.counterparty, type: 'Amendment', valueDisplay: 'Not specified', stage: 'drafting', risk: parent.risk, version: 'v1', source: 'Amendment', ownerId: actor.id, parentAgreementId: id } });
      await this.audit.recordInTransaction(tx, { actor, action: 'contract.amendment_created', entity: 'contract', entityId: dto.id, summary: `Amendment opened for ${parent.title}`, metadata: { parentAgreementId: id, reason: dto.reason.trim(), parentArchiveId: parent.authoritativeArchiveId } });
      await this.audit.recordInTransaction(tx, { actor, action: 'contract.amendment_linked', entity: 'contract', entityId: id, summary: 'A linked amendment lifecycle was opened', metadata: { amendmentId: dto.id } });
    });
    return { id: dto.id };
  }
  async transition(id: string, dto: AgreementTransitionDto, actor: AuthUser) {
    await this.db().$transaction(async (tx: any) => {
      const contract = await this.editable(tx, id, dto.revision); this.requireAssigned(contract, actor);
      if (!['drafting', 'review'].includes(contract.stage)) throw new ConflictException('Only drafting and review can be changed here.');
      if (dto.stage === 'review' && contract.needsNewVersion) throw new ConflictException('Save the changed document as a new version before returning to review.');
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
      if ((!routing || !decision || !['approved', 'rejected', 'changes-requested'].includes(decision.decision)) && contract.stage !== 'agreed' || signature || contract.executedAt) throw new ConflictException('A signing package or executed agreement cannot be edited. Revisions require an agreed form or a completed approval decision.');
      const evidence = JSON.parse(JSON.stringify({ routing, decision: decision ?? { decision: 'agreed' }, steps, agreedDocumentId: contract.agreedDocumentId, agreedSha256: contract.agreedSha256, revisionReason: dto.reason.trim() }));
      const evidenceSha256 = createHash('sha256').update(canonicalJson(evidence)).digest('hex');
      const round = await tx.approvalRound.create({ data: { id: randomUUID(), contractId: id, contractVersion: contract.version, evidence, evidenceSha256 } });
      // The full previous round is retained before clearing the compatible
      // current-version indexes. Old callback document/version pins then fail.
      await tx.approvalStep.deleteMany({ where: { contractId: id } });
      await tx.approvalDecision.deleteMany({ where: { contractId: id } });
      await tx.approvalRouting.deleteMany({ where: { contractId: id } });
      await tx.requestNotification.updateMany({ where: { contractId: id, kind: { startsWith: 'approval-request' }, emailStatus: { in: ['queued', 'awaiting-configuration', 'retry'] } }, data: { emailStatus: 'cancelled' } });
      await tx.contract.update({ where: { id }, data: { stage: 'drafting', lifecycleRevision: { increment: 1 }, needsNewVersion: true, agreedDocumentId: null, agreedSha256: null, agreedAt: null, agreedBy: null } });
      await this.audit.recordInTransaction(tx, { actor, action: 'contract.revision_started', entity: 'contract', entityId: id, summary: 'A new draft revision was opened; the previous approval round remains preserved', metadata: { approvalRoundId: round.id, evidenceSha256, previousVersion: contract.version, reason: dto.reason.trim() } });
    }, { timeout: 20_000, maxWait: 10_000 });
    return this.snapshot(id, actor);
  }
}
