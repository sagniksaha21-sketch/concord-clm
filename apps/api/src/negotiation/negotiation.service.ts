import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID, createHash } from 'crypto';
import { AuthUser, DraftSection, compareSections, normalizeRole } from '@concord/shared';
import { PrismaService } from '../persistence/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { FileSecurityService } from '../security/file-security.service';
import { AiReviewService } from '../ai-review/ai-review.service';
import { isGraphConfigured } from '../notifications/graph.client';
import { draftDocument } from '../agreements/draft-document';
import { readEditableDocument } from '../agreements/read-document';
import { recordVersion } from '../agreements/version-record';
import { GuestAuthService } from './guest-auth.service';
import { canonicalJson } from '../common/canonical-json';
import { InviteGuestDto, NegotiationVersionDto, GuestResponseDto, GuestCommentDto } from './negotiation.dto';

const latestDocument = { where: { status: { not: 'quarantined' }, blobPath: { not: null } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] };
@Injectable()
export class NegotiationService {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService, private readonly audit: AuditService, private readonly security: FileSecurityService, private readonly review: AiReviewService, private readonly auth: GuestAuthService) {}
  private db() { if (!this.prisma.enabled) throw new ServiceUnavailableException('Secure negotiation requires saved agreement records.'); return this.prisma.client; }
  private async legal(tx: any, id: string, actor: AuthUser, revision?: number) {
    await tx.$queryRawUnsafe('SELECT id FROM "Contract" WHERE id = $1 FOR UPDATE',id);
    const c = await tx.contract.findUnique({ where: { id }, include: { intakeRequest: true, draft: true } });
    if (!c) throw new NotFoundException('Agreement not found.');
    const owner = c.intakeRequest?.assignedLegalUserId ?? c.ownerId;
    if (owner && owner !== actor.id && !['admin','lead'].includes(normalizeRole(actor.role))) throw new ForbiddenException('This agreement is assigned to another lawyer.');
    if (revision !== undefined && c.lifecycleRevision !== revision) throw new ConflictException('The agreement changed. Refresh before continuing.');
    return c;
  }
  private async verifiedDocument(tx: any, c: any, documentId: string) {
    const doc = await tx.document.findFirst({ ...latestDocument, where: { ...latestDocument.where, contractId: c.id } });
    if (!doc || doc.id !== documentId || !doc.sha256) throw new ConflictException('Use the current saved agreement version.');
    const file = await this.storage.get(doc.blobPath);
    if (createHash('sha256').update(file.buffer).digest('hex') !== doc.sha256) throw new ConflictException('The document failed its integrity check.');
    return { doc, file };
  }
  async workspace(id: string, actor: AuthUser) {
    return this.db().$transaction(async (tx: any) => {
      await this.legal(tx,id,actor);
      const [invitations,responses,rounds] = await Promise.all([
        tx.guestInvitation.findMany({ where: { contractId: id }, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, email: true, organisation: true, expiresAt: true, responseDueAt: true, revokedAt: true, viewedAt: true, acceptedDocumentId: true, roundId: true, allowDownload: true, allowRedline: true, allowUpload: true, deliveries: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true } } } }),
        tx.negotiationResponse.findMany({ where: { round: { contractId: id } }, orderBy: { createdAt: 'desc' }, include: { invitation: { select: { name: true, organisation: true } }, round: { select: { number: true } } } }),
        tx.negotiationRound.findMany({ where: { contractId: id }, orderBy: { number: 'desc' }, select: { id: true, number: true, documentId: true, sha256: true, createdAt: true } }),
      ]);
      return { invitations, responses, rounds, emailConfigured: isGraphConfigured() };
    });
  }
  private async currentRound(tx: any, c: any, dto: NegotiationVersionDto, actor: AuthUser, review: any) {
    if (!['review','negotiation'].includes(c.stage) || c.needsNewVersion || c.executedAt || await tx.approvalRouting.findUnique({ where: { contractId: c.id } }) || await tx.signatureRequest.findFirst({ where: { contractId: c.id } })) throw new ConflictException('Complete internal review before sharing a draft. Approved and signing versions are locked.');
    const { doc } = await this.verifiedDocument(tx,c,dto.documentId);
    if (review.documentId !== doc.id || review.documentSha256 !== doc.sha256 || review.contractVersion !== c.version) throw new ConflictException('Finish a review of the exact current document before sharing.');
    if (!c.draft || c.draft.documentId !== doc.id || createHash('sha256').update(draftDocument(c.title,c.draft.sections)).digest('hex') !== doc.sha256) throw new ConflictException('Save a reviewed editing copy before sharing. This removes embedded Word comments and metadata from the external copy. The original stays in Versions.');
    if (await tx.negotiationResponse.count({ where: { round: { contractId: c.id }, state: 'received' } })) throw new ConflictException('Finish reviewing the received counterparty response before sharing another version.');
    let round = await tx.negotiationRound.findUnique({ where: { contractId_documentId: { contractId: c.id, documentId: doc.id } } });
    if (!round) {
      const previous = await tx.negotiationRound.findFirst({ where: { contractId: c.id }, orderBy: { number: 'desc' } });
      round = await tx.negotiationRound.create({ data: { id: randomUUID(), contractId: c.id, documentId: doc.id, sha256: doc.sha256, sections: c.draft.sections, number: (previous?.number ?? 0)+1, createdBy: actor.id } });
    }
    await tx.agreementVersion.updateMany({ where: { documentId: doc.id }, data: { sharedAt: new Date(), round: round.number } });
    return round;
  }
  async invite(id: string, dto: InviteGuestDto, actor: AuthUser) {
    const expiry = Date.parse(dto.expiresAt), deadline = dto.responseDueAt ? Date.parse(dto.responseDueAt) : undefined;
    if (!Number.isFinite(expiry) || expiry <= Date.now() || expiry > Date.now()+30*86400000 || deadline !== undefined && (!Number.isFinite(deadline) || deadline <= Date.now() || deadline > expiry)) throw new BadRequestException('Use a future expiry within 30 days and a response deadline before expiry.');
    const { revision: _revision, ...payload } = dto;
    const requestHash = createHash('sha256').update(canonicalJson({ ...payload, contractId: id, invitedBy: actor.id })).digest('hex');
    const existingInvite = async (tx: any) => {
      const existing = await tx.guestInvitation.findUnique({ where: { id: dto.id } });
      if (existing && (existing.contractId !== id || existing.invitedBy !== actor.id || existing.requestHash !== requestHash)) throw new ConflictException('Invitation identifier already used.');
      return !!existing;
    };
    // Authorize before a paid AI call. Identical retries return the saved result
    // even if the first request's successful commit was not received by the browser.
    const repeated = await this.db().$transaction(async (tx: any) => {
      const c = await this.legal(tx,id,actor);
      if (await existingInvite(tx)) return true;
      if (c.lifecycleRevision !== dto.revision) throw new ConflictException('The agreement changed. Refresh before continuing.');
      return false;
    });
    if (repeated) return this.workspace(id,actor);
    const review = await this.review.getReview(id);
    await this.db().$transaction(async (tx: any) => {
      const c = await this.legal(tx,id,actor);
      if (await existingInvite(tx)) return;
      if (c.lifecycleRevision !== dto.revision) throw new ConflictException('The agreement changed. Refresh before continuing.');
      if (await tx.guestInvitation.count({ where: { contractId: id, revokedAt: null, expiresAt: { gt: new Date() } } }) >= 25) throw new BadRequestException('Review existing guest access before inviting more people.');
      const round = await this.currentRound(tx,c,dto,actor,review);
      await tx.guestInvitation.create({ data: { id: dto.id, requestHash, contractId: id, roundId: round.id, name: dto.name.trim(), email: dto.email.trim().toLowerCase(), organisation: dto.organisation.trim(), invitedBy: actor.id, expiresAt: new Date(expiry), responseDueAt: deadline ? new Date(deadline) : null, allowDownload: dto.allowDownload, allowRedline: dto.allowRedline, allowUpload: dto.allowUpload } });
      await tx.guestDelivery.create({ data: { id: randomUUID(), invitationId: dto.id, roundId: round.id, kind: 'invitation', status: isGraphConfigured() ? 'queued' : 'awaiting-configuration' } });
      await tx.contract.update({ where: { id }, data: { stage: 'negotiation', negotiationState: 'with-counterparty', lifecycleRevision: { increment: 1 } } });
      await this.audit.recordInTransaction(tx,{ actor, action: 'negotiation.invited', entity: 'contract', entityId: id, summary: 'Secure counterparty invitation prepared', metadata: { invitationId: dto.id, email: dto.email.toLowerCase(), documentId: round.documentId, sha256: round.sha256, expiresAt: dto.expiresAt, permissions: { download: dto.allowDownload, redline: dto.allowRedline, upload: dto.allowUpload } } });
    },{ timeout: 30000 });
    return this.workspace(id,actor);
  }
  async share(id: string, dto: NegotiationVersionDto, actor: AuthUser) {
    await this.db().$transaction((tx: any) => this.legal(tx,id,actor,dto.revision));
    const review = await this.review.getReview(id);
    await this.db().$transaction(async (tx: any) => {
      const c = await this.legal(tx,id,actor,dto.revision), round = await this.currentRound(tx,c,dto,actor,review);
      const guests = await tx.guestInvitation.findMany({ where: { contractId: id, revokedAt: null, expiresAt: { gt: new Date() } } });
      if (!guests.length) throw new BadRequestException('Invite a participant before sharing a new version.');
      for (const guest of guests) {
        if (guest.roundId === round.id) continue;
        await tx.guestInvitation.update({ where: { id: guest.id }, data: { roundId: round.id, viewedAt: null, acceptedDocumentId: null } });
        await tx.guestDelivery.create({ data: { id: randomUUID(), invitationId: guest.id, roundId: round.id, kind: 'new-version', status: isGraphConfigured() ? 'queued' : 'awaiting-configuration' } });
      }
      await tx.contract.update({ where: { id }, data: { stage: 'negotiation', negotiationState: 'with-counterparty', lifecycleRevision: { increment: 1 } } });
      await this.audit.recordInTransaction(tx,{ actor, action: 'negotiation.version_shared', entity: 'contract', entityId: id, summary: `Legal shared negotiation round ${round.number}`, metadata: { documentId: round.documentId, sha256: round.sha256, invitationIds: guests.map((g: any) => g.id) } });
    },{ timeout: 30000 });
    return this.workspace(id,actor);
  }
  async revoke(id: string, invitationId: string, actor: AuthUser) {
    await this.db().$transaction(async (tx: any) => {
      await this.legal(tx,id,actor);
      const invite = await tx.guestInvitation.findFirst({ where: { id: invitationId, contractId: id } });
      if (!invite) throw new NotFoundException('Invitation not found.');
      await tx.guestInvitation.update({ where: { id: invitationId }, data: { revokedAt: new Date(), otpHash: null, challengeId: null } });
      await tx.guestSession.deleteMany({ where: { invitationId } });
      await tx.guestDelivery.updateMany({ where: { invitationId, status: { in: ['queued','retry','awaiting-configuration'] } }, data: { status: 'cancelled' } });
      await this.audit.recordInTransaction(tx,{ actor, action: 'negotiation.access_revoked', entity: 'contract', entityId: id, summary: 'External participant access revoked', metadata: { invitationId } });
    });
    return this.workspace(id,actor);
  }
  private async notify(tx: any, c: any, kind: string, title: string, body: string) {
    const owner = c.intakeRequest?.assignedLegalUserId ?? c.ownerId;
    if (owner) await tx.requestNotification.create({ data: { id: randomUUID(), recipientId: owner, requestId: c.intakeRequest?.id ?? null, contractId: c.id, kind: `negotiation:${kind}:${randomUUID()}`, title, body, emailStatus: isGraphConfigured() ? 'queued' : 'awaiting-configuration' } });
  }
  async room(invitationId: string, token: string) {
    const invite = await this.auth.authenticate(invitationId,token);
    return this.db().$transaction(async (tx: any) => {
      await tx.$queryRawUnsafe('SELECT id FROM "Contract" WHERE id = $1 FOR UPDATE',invite.contractId);
      const current = await this.auth.authenticate(invitationId,token,tx);
      const c = await tx.contract.findUnique({ where: { id: current.contractId }, include: { intakeRequest: true } });
      if (!current.viewedAt) {
        await tx.guestInvitation.update({ where: { id: invitationId }, data: { viewedAt: new Date() } });
        await this.notify(tx,c,'opened',`${current.name} opened the agreement`,'The invited counterparty opened the shared version.');
        await this.audit.recordInTransaction(tx,{ action: 'negotiation.document_viewed', entity: 'contract', entityId: c.id, summary: 'Invited participant opened the shared agreement', metadata: { invitationId, documentId: current.round.documentId } });
      }
      const [comments,response] = await Promise.all([
        tx.agreementComment.findMany({ where: { contractId: c.id, documentId: current.round.documentId, visibility: 'external' }, select: { id: true, body: true, authorName: true, createdAt: true, resolvedAt: true }, orderBy: { createdAt: 'asc' }, take: 300 }),
        tx.negotiationResponse.findUnique({ where: { invitationId_roundId: { invitationId, roundId: current.roundId } }, select: { id: true, createdAt: true, state: true, changes: true } }),
      ]);
      // Explicit projection: no internal AI, playbook, owner, risk, approvals or audit data.
      return { title: c.title, sharedBy: 'Lakmē Legal', participant: current.name, organisation: current.organisation, documentId: current.round.documentId, round: current.round.number, sections: current.round.sections, sharedAt: current.round.createdAt, dueAt: current.responseDueAt, expiresAt: current.expiresAt, canDownload: current.allowDownload, canRedline: current.allowRedline && c.stage === 'negotiation' && !response, canUpload: current.allowUpload && c.stage === 'negotiation' && !response, canComment: c.stage === 'negotiation', canAccept: c.stage === 'negotiation' && !response, accepted: current.acceptedDocumentId === current.round.documentId, comments, response };
    });
  }
  async guestFile(invitationId: string, token: string) {
    const invite = await this.auth.authenticate(invitationId,token);
    if (!invite.allowDownload) throw new ForbiddenException('Download is not permitted for this invitation.');
    const doc = await this.db().document.findFirst({ where: { id: invite.round.documentId, contractId: invite.contractId, status: { not: 'quarantined' } } });
    if (!doc?.blobPath || doc.sha256 !== invite.round.sha256) throw new ConflictException('The shared document is unavailable. Contact Legal.');
    const file = await this.storage.get(doc.blobPath);
    if (createHash('sha256').update(file.buffer).digest('hex') !== invite.round.sha256) throw new ConflictException('The document failed its integrity check.');
    const still = await this.auth.authenticate(invitationId,token);
    if (still.roundId !== invite.roundId) throw new ConflictException('A newer shared version is available. Refresh the room.');
    await this.audit.record({ action: 'negotiation.document_downloaded', entity: 'contract', entityId: invite.contractId, summary: 'Invited participant downloaded the shared document', metadata: { invitationId, documentId: doc.id, sha256: invite.round.sha256 } });
    return { ...file, filename: doc.filename };
  }
  private async guestWrite(tx: any, invitationId: string, token: string, documentId: string) {
    const initial = await this.auth.authenticate(invitationId,token,tx);
    await tx.$queryRawUnsafe('SELECT id FROM "Contract" WHERE id = $1 FOR UPDATE',initial.contractId);
    const invite = await this.auth.authenticate(invitationId,token,tx);
    const contract = await tx.contract.findUnique({ where: { id: invite.contractId }, include: { intakeRequest: true } });
    if (contract.stage !== 'negotiation' || contract.executedAt || invite.round.documentId !== documentId) throw new ConflictException('This shared version is closed for changes. Refresh the review room.');
    return { invite,contract };
  }
  async legalComment(id: string, dto: GuestCommentDto, actor: AuthUser) {
    await this.db().$transaction(async (tx: any) => {
      const contract = await this.legal(tx,id,actor);
      if (contract.stage !== 'negotiation') throw new ConflictException('External comments are closed at this stage.');
      const round = await tx.negotiationRound.findUnique({ where: { contractId_documentId: { contractId: id, documentId: dto.documentId } } });
      if (!round) throw new NotFoundException('Shared version not found.');
      const old = await tx.agreementComment.findUnique({ where: { id: dto.id } });
      if (old) { if (old.authorUserId !== actor.id || old.contractId !== id || old.body !== dto.body.trim()) throw new ConflictException('Comment identifier already used.'); return; }
      await tx.agreementComment.create({ data: { id: dto.id, contractId: id, documentId: dto.documentId, authorUserId: actor.id, authorName: actor.name, visibility: 'external', body: dto.body.trim() } });
      const guests = await tx.guestInvitation.findMany({ where: { contractId: id, roundId: round.id, revokedAt: null, expiresAt: { gt: new Date() } } });
      // One digest per shared round avoids an email for every reply. Comments
      // remain available immediately inside the authenticated review room.
      for (const guest of guests) await tx.guestDelivery.upsert({
        where: { invitationId_roundId_kind: { invitationId: guest.id, roundId: round.id, kind: 'legal-response' } },
        create: { id: randomUUID(), invitationId: guest.id, roundId: round.id, kind: 'legal-response', status: isGraphConfigured() ? 'queued' : 'awaiting-configuration' }, update: {},
      });
      await this.audit.recordInTransaction(tx,{ actor, action: 'negotiation.legal_response', entity: 'contract', entityId: id, summary: 'Legal deliberately shared an external comment', metadata: { commentId: dto.id, documentId: dto.documentId } });
    });
    return this.workspace(id,actor);
  }
  async guestComment(invitationId: string, token: string, dto: GuestCommentDto) {
    await this.db().$transaction(async (tx: any) => {
      const { invite,contract } = await this.guestWrite(tx,invitationId,token,dto.documentId);
      const existing = await tx.agreementComment.findUnique({ where: { id: dto.id } });
      if (existing) { if (existing.authorGuestId !== invitationId || existing.documentId !== dto.documentId || existing.body !== dto.body.trim()) throw new ConflictException('Comment identifier already used.'); return; }
      await tx.agreementComment.create({ data: { id: dto.id, contractId: contract.id, documentId: dto.documentId, authorGuestId: invitationId, authorName: invite.name, visibility: 'external', body: dto.body.trim() } });
      await this.notify(tx,contract,'comment',`${invite.name} commented on ${contract.title}`,dto.body.trim());
      await this.audit.recordInTransaction(tx,{ action: 'negotiation.external_comment', entity: 'contract', entityId: contract.id, summary: 'Counterparty added an external comment', metadata: { invitationId, commentId: dto.id, documentId: dto.documentId } });
    });
    return { ok: true };
  }
  async respond(invitationId: string, token: string, dto: GuestResponseDto, upload?: { originalname: string; buffer: Buffer }) {
    const initial = await this.auth.authenticate(invitationId,token);
    if (upload ? !initial.allowUpload : !initial.allowRedline) throw new ForbiddenException('This invitation does not allow that response method.');
    let sections: DraftSection[] = dto.sections, original: DraftSection[] = initial.round.sections as any;
    const c = await this.db().contract.findUnique({ where: { id: initial.contractId } });
    if (!c) throw new NotFoundException('The shared agreement is unavailable.');
    if (upload) {
      const verdict = await this.security.check(upload);
      if (!verdict.ok || verdict.scanEngine === 'error' || process.env.UPLOAD_REQUIRE_SCAN === 'true' && verdict.scan !== 'clean') throw new BadRequestException('The redline could not be cleared by the file scanner.');
      if (!upload.originalname.toLowerCase().endsWith('.docx')) throw new BadRequestException('Upload a Word .docx redline.');
      const parsed = readEditableDocument(upload.buffer,upload.originalname); sections = parsed.sections;
      original = readEditableDocument(draftDocument(c.title,initial.round.sections as any),'shared.docx').sections;
    }
    const ids = sections.map((s,i) => s.id ?? `section-${i}`);
    if (!sections.length || sections.length > 100 || new Set(ids).size !== ids.length || sections.every(s => !s.body.trim())) throw new BadRequestException('Provide a complete proposed document with distinct clauses.');
    sections = sections.map((s,i) => ({ ...s, id: ids[i] }));
    const bytes = upload?.buffer ?? draftDocument(c.title,sections), filename = upload?.originalname ?? `counterparty-${dto.id}.docx`;
    const requestHash = createHash('sha256').update(canonicalJson({ documentId: dto.documentId, sections, source: upload ? 'word' : 'browser', fileHash: createHash('sha256').update(bytes).digest('hex') })).digest('hex');
    const verdict = await this.security.check({ originalname: filename, buffer: bytes });
    if (!verdict.ok || verdict.scanEngine === 'error' || process.env.UPLOAD_REQUIRE_SCAN === 'true' && verdict.scan !== 'clean') throw new BadRequestException('The response could not be cleared for storage.');
    await this.db().$transaction(async (tx: any) => {
      const { invite,contract } = await this.guestWrite(tx,invitationId,token,dto.documentId);
      if (upload ? !invite.allowUpload : !invite.allowRedline) throw new ForbiddenException('Response permission changed.');
      const previous = await tx.negotiationResponse.findUnique({ where: { invitationId_roundId: { invitationId, roundId: invite.roundId } } });
      if (previous) { if (previous.id !== dto.id || previous.requestHash !== requestHash) throw new ConflictException('A different response has already been submitted for this round.'); return; }
      const latest = await tx.document.findFirst({ ...latestDocument, where: { ...latestDocument.where, contractId: contract.id } });
      if (latest?.id !== dto.documentId) throw new ConflictException('Legal is already reviewing a newer document. Your draft has not been submitted; retain it and ask Legal to share the latest version.');
      const sha256 = createHash('sha256').update(bytes).digest('hex'), blobPath = await this.storage.put(bytes,filename,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      const doc = await tx.document.create({ data: { contractId: contract.id, filename, documentType: contract.type, confidence: 100, status: 'validated', extraction: {}, validations: [], notes: ['Counterparty proposal; requires Legal review.'], model: 'counterparty', blobPath, sha256, extractedText: sections.map(s => `${s.heading}\n${s.body}`).join('\n\n') } });
      await recordVersion(tx,{ contract, documentId: doc.id, guest: { id: invitationId, name: invite.name, organisation: invite.organisation }, source: upload ? 'counterparty-word' : 'counterparty-redline', reason: `Counterparty response, round ${invite.round.number}`, sections, round: invite.round.number });
      await tx.negotiationResponse.create({ data: { id: dto.id, requestHash, invitationId, roundId: invite.roundId, documentId: doc.id, sections, originalSections: original, changes: compareSections(original,sections), source: upload ? 'word' : 'browser' } });
      await tx.agreementDraft.upsert({ where: { contractId: contract.id }, create: { contractId: contract.id, documentId: doc.id, sections, model: 'counterparty', updatedBy: invitationId }, update: { documentId: doc.id, sections, model: 'counterparty', updatedBy: invitationId, revision: { increment: 1 } } });
      await tx.contract.update({ where: { id: contract.id }, data: { negotiationState: 'changes-received', lifecycleRevision: { increment: 1 } } });
      await this.notify(tx,contract,'response',`${invite.name} submitted changes`,`${compareSections(original,sections).length} clause changes received in round ${invite.round.number}. Open the agreement to review them.`);
      await this.audit.recordInTransaction(tx,{ action: 'negotiation.response_received', entity: 'contract', entityId: contract.id, summary: 'Counterparty response saved as a separate negotiation version', metadata: { invitationId, responseId: dto.id, documentId: doc.id, sha256, round: invite.round.number } });
    },{ timeout: 30000 });
    return { ok: true };
  }
  async accept(invitationId: string, token: string, documentId: string) {
    await this.db().$transaction(async (tx: any) => {
      const { invite,contract } = await this.guestWrite(tx,invitationId,token,documentId);
      if (await tx.negotiationResponse.findUnique({ where: { invitationId_roundId: { invitationId, roundId: invite.roundId } } })) throw new ConflictException('Wait for Legal’s response to your proposed changes.');
      await this.verifiedDocument(tx,contract,documentId);
      if (invite.acceptedDocumentId === documentId) return;
      await tx.guestInvitation.update({ where: { id: invitationId }, data: { acceptedDocumentId: documentId } });
      const outstanding = await tx.guestInvitation.count({ where: { contractId: contract.id, revokedAt: null, expiresAt: { gt: new Date() }, OR: [{ acceptedDocumentId: null },{ acceptedDocumentId: { not: documentId } }] } });
      await tx.contract.update({ where: { id: contract.id }, data: { negotiationState: outstanding ? 'with-counterparty' : 'agreed-pending', lifecycleRevision: { increment: 1 } } });
      await this.notify(tx,contract,'accepted',`${invite.name} accepted the shared draft`,'The counterparty accepted the current shared document. Legal must still confirm agreed form and obtain approvals.');
      await this.audit.recordInTransaction(tx,{ action: 'negotiation.counterparty_accepted', entity: 'contract', entityId: contract.id, summary: 'Counterparty accepted the exact shared draft', metadata: { invitationId, documentId, sha256: invite.round.sha256 } });
    });
    return { ok: true };
  }
  async reviewed(id: string, responseId: string, dto: NegotiationVersionDto, actor: AuthUser) {
    await this.db().$transaction(async (tx: any) => {
      const c = await this.legal(tx,id,actor,dto.revision), { doc } = await this.verifiedDocument(tx,c,dto.documentId);
      const response = await tx.negotiationResponse.findFirst({ where: { id: responseId, round: { contractId: id } } });
      const version = await tx.agreementVersion.findUnique({ where: { documentId: doc.id } });
      if (!response) throw new NotFoundException('Counterparty response not found.');
      if (!version?.authorUserId || doc.id === response.documentId || doc.createdAt < response.createdAt) throw new ConflictException('Review the response in Edit Agreement and save your resolved Legal version first.');
      if (c.stage !== 'negotiation') throw new ConflictException('This negotiation round is closed.');
      await tx.negotiationResponse.update({ where: { id: responseId }, data: { state: 'reviewed', reviewedBy: actor.id, reviewedAt: new Date(), reviewedDocumentId: doc.id } });
      await tx.contract.update({ where: { id }, data: { negotiationState: 'ready-to-share', lifecycleRevision: { increment: 1 } } });
      await this.audit.recordInTransaction(tx,{ actor, action: 'negotiation.response_reviewed', entity: 'contract', entityId: id, summary: 'Legal completed review of the counterparty response', metadata: { responseId, resolvedDocumentId: doc.id, sha256: doc.sha256 } });
    });
    return this.workspace(id,actor);
  }
  async agreed(id: string, dto: NegotiationVersionDto, actor: AuthUser) {
    await this.db().$transaction((tx: any) => this.legal(tx,id,actor,dto.revision));
    const review = await this.review.getReview(id);
    await this.db().$transaction(async (tx: any) => {
      const c = await this.legal(tx,id,actor,dto.revision), { doc } = await this.verifiedDocument(tx,c,dto.documentId);
      if (c.stage !== 'negotiation' || c.needsNewVersion) throw new ConflictException('Complete negotiation before marking an agreed form.');
      if (review.documentId !== doc.id || review.documentSha256 !== doc.sha256 || review.contractVersion !== c.version) throw new ConflictException('The final review must match the exact document.');
      const guests = await tx.guestInvitation.findMany({ where: { contractId: id, revokedAt: null, expiresAt: { gt: new Date() } } });
      if (!guests.length || guests.some((g: any) => g.acceptedDocumentId !== doc.id)) throw new ConflictException('Every active invited participant must accept this exact shared version.');
      if (c.intakeRequest?.clientStatus === 'waiting-on-client' || await tx.agreementComment.count({ where: { contractId: id, resolvedAt: null } }) || await tx.negotiationResponse.count({ where: { round: { contractId: id }, state: 'received' } })) throw new ConflictException('Resolve outstanding comments, counterparty changes and business questions first.');
      await tx.contract.update({ where: { id }, data: { stage: 'agreed', agreedDocumentId: doc.id, agreedSha256: doc.sha256, agreedAt: new Date(), agreedBy: actor.id, negotiationState: 'complete', lifecycleRevision: { increment: 1 } } });
      await tx.agreementVersion.updateMany({ where: { documentId: doc.id }, data: { agreedAt: new Date() } });
      await this.audit.recordInTransaction(tx,{ actor, action: 'negotiation.agreed_form', entity: 'contract', entityId: id, summary: 'Exact agreed form frozen; external editing closed', metadata: { documentId: doc.id, sha256: doc.sha256, contractVersion: c.version, acceptedInvitations: guests.map((g: any) => g.id) } });
    },{ timeout: 30000 });
    return this.workspace(id,actor);
  }
}
