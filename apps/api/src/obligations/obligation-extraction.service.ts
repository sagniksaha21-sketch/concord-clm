import { Controller, Get, Post, Param, Req, Injectable, Module, ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash, randomUUID } from 'crypto';
import { normalizeRole } from '@concord/shared';
import { PrismaService } from '../persistence/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { Roles } from '../auth/rbac';
import { extractCommitments } from './obligation-extraction';
import { selectedOcrProvider } from '../ingestion/textract';
import { ocrWithGcpDocumentAi } from '../ingestion/gcp-document-ai';
import { ocrDocument } from '../ingestion/doc-intelligence';
import { ocrWithTesseract } from '../ingestion/tesseract-ocr';
@Injectable()
export class ObligationExtractionService {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService, private readonly audit: AuditService) {}
  async request(id: string, actor: any, retry = false) {
    if (!this.prisma.enabled) throw new ServiceUnavailableException('Saved execution records are unavailable.');
    return this.prisma.client.$transaction(async (tx: any) => {
      await tx.$queryRawUnsafe('SELECT id FROM "Contract" WHERE id = $1 FOR UPDATE',id);
      const c = await tx.contract.findUnique({ where: { id }, include: { intakeRequest: true } });
      if (!c?.authoritativeArchiveId) throw new ConflictException('The signed agreement must be filed first.');
      if (retry) {
        const owner = c.intakeRequest?.assignedLegalUserId ?? c.ownerId;
        if (owner && owner !== actor.id && !['admin','lead'].includes(normalizeRole(actor.role))) throw new ForbiddenException('Ask the assigned Legal owner to retry extraction.');
      }
      const where = { archiveId: c.authoritativeArchiveId };
      let job = await tx.obligationExtraction.findUnique({ where });
      if (retry) {
        if (job?.leaseUntil && job.leaseUntil > new Date()) throw new ConflictException('Extraction is still running.');
        if (job?.updatedAt && Date.now() - job.updatedAt.getTime() < 60000) throw new ConflictException('Wait a minute before retrying extraction.');
        job = await tx.obligationExtraction.upsert({ where, create: { ...where, contractId: id }, update: { status: 'queued', detail: null } });
        await this.audit.recordInTransaction(tx,{ actor, action: 'obligation.extraction_requested', entity: 'contract', entityId: id, summary: 'Commitment extraction requested', metadata: where });
      }
      return job ? { status: job.status, detail: job.detail, model: job.model, source: job.source, updatedAt: job.updatedAt } : { status: 'available', detail: 'Extract commitments from the filed agreement.' };
    });
  }
  @Cron('*/1 * * * *', { name: 'executed-commitment-extraction' })
  async processNext() {
    if (!this.prisma.enabled) return;
    const db = this.prisma.client;
    const job = await db.obligationExtraction.findFirst({ where: { OR: [{ status: 'queued' }, { status: 'processing', leaseUntil: { lt: new Date() } }] }, orderBy: { updatedAt: 'asc' } });
    if (!job) return;
    const claim = randomUUID();
    if (!(await db.obligationExtraction.updateMany({ where: { archiveId: job.archiveId, status: job.status, claimToken: job.claimToken, updatedAt: job.updatedAt }, data: { status: 'processing', claimToken: claim, leaseUntil: new Date(Date.now()+300000) } })).count) return;
    try {
      const archive = await db.archivedDocument.findUnique({ where: { id: job.archiveId } });
      if (!archive || archive.contractId !== job.contractId || archive.format !== 'application/pdf') throw new Error('Authoritative PDF unavailable.');
      const file = await this.storage.get(archive.storageKey);
      if (createHash('sha256').update(file.buffer).digest('hex') !== archive.checksum) throw new Error('Signed document integrity failed.');
      let text = '', source = 'executed-pdf';
      const ocr = selectedOcrProvider();
      if (ocr === 'gcp') text = await ocrWithGcpDocumentAi(file.buffer,archive.filename);
      else if (ocr === 'azure') text = await ocrDocument(file.buffer,archive.filename);
      else if (ocr === 'tesseract') text = await ocrWithTesseract(file.buffer,archive.filename);
      else {
        source = 'approved-source';
        const signature = await db.signatureRequest.findUnique({ where: { id: archive.requestId } });
        const doc = signature?.documentId ? await db.document.findUnique({ where: { id: signature.documentId } }) : null;
        if (!doc?.blobPath || doc.contractId !== job.contractId || doc.sha256 !== signature?.documentSha256) throw new Error('Configure signed document OCR.');
        const original = await this.storage.get(doc.blobPath);
        if (createHash('sha256').update(original.buffer).digest('hex') !== doc.sha256) throw new Error('Approved source integrity failed.');
        text = doc.extractedText ?? '';
      }
      if (!text.trim()) throw new Error('Complete source text unavailable.');
      const result = await extractCommitments(text);
      await db.$transaction(async (tx: any) => {
        await tx.$queryRawUnsafe('SELECT id FROM "Contract" WHERE id = $1 FOR UPDATE',job.contractId);
        const c = await tx.contract.findUnique({ where: { id: job.contractId } });
        const current = await tx.obligationExtraction.findUnique({ where: { archiveId: job.archiveId } });
        if (c?.authoritativeArchiveId !== archive.id || current?.claimToken !== claim) throw new ConflictException('Extraction source or worker changed.');
        for (const candidate of result.candidates) {
          const key = createHash('sha256').update(`${archive.id}:${candidate.type}:${candidate.excerpt}`).digest('hex');
          await tx.agreementObligation.upsert({ where: { extractionKey: key }, update: {}, create: { id: randomUUID(), contractId: c.id, sourceArchiveId: archive.id, extractionKey: key, title: candidate.title, type: candidate.type, dueDate: candidate.dueDate, evidence: `${source === 'executed-pdf' ? 'Executed agreement' : 'Approved source — verify against signed PDF'}: ${candidate.excerpt}` } });
        }
        await tx.obligationExtraction.update({ where: { archiveId: archive.id }, data: { status: 'complete', source, model: result.model, detail: `${result.candidates.length} source-backed candidates. ${source === 'approved-source' ? 'Signed-PDF OCR is not selected; check every provision against the executed copy.' : 'Confirm before enabling reminders.'}`, leaseUntil: null, claimToken: null } });
        await tx.contract.update({ where: { id: c.id }, data: { lifecycleRevision: { increment: 1 } } });
        await this.audit.recordInTransaction(tx,{ action: 'obligation.extracted', entity: 'contract', entityId: c.id, summary: 'Source-backed commitments prepared for confirmation', metadata: { archiveId: archive.id, checksum: archive.checksum, source, sourceTextSha256: createHash('sha256').update(text).digest('hex'), model: result.model, count: result.candidates.length, confirmed: false } });
      });
    } catch {
      await db.obligationExtraction.updateMany({ where: { archiveId: job.archiveId, claimToken: claim }, data: { status: 'failed', detail: 'Extraction could not verify a complete source. Check OCR and legal AI configuration, then retry. You can still add confirmed commitments manually.', leaseUntil: null, claimToken: null } });
    }
  }
}
@Controller('agreements/:id/commitment-extraction') @Roles('contract:read')
export class ObligationExtractionController {
  constructor(private readonly extraction: ObligationExtractionService) {}
  @Get() status(@Param('id') id: string, @Req() req: any) { return this.extraction.request(id,req.user); }
  @Post() @Roles('contract:write') retry(@Param('id') id: string, @Req() req: any) { return this.extraction.request(id,req.user,true); }
}
@Module({ controllers: [ObligationExtractionController], providers: [ObligationExtractionService] })
export class ObligationExtractionModule {}
