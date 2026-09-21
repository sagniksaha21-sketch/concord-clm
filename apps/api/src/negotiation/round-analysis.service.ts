import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../persistence/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { analyzeNegotiation } from './round-analysis';
@Injectable()
export class RoundAnalysisService {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService, private readonly audit: AuditService) {}
  @Cron('*/1 * * * *', { name: 'negotiation-round-analysis' })
  async processNext() {
    if (!this.prisma.enabled) return;
    const db = this.prisma.client;
    const job = await db.negotiationAnalysis.findFirst({ where: { OR: [{ status: 'queued' }, { status: 'processing', leaseUntil: { lt: new Date() } }] }, orderBy: { updatedAt: 'asc' } });
    if (!job) return;
    const token = randomUUID();
    if (!(await db.negotiationAnalysis.updateMany({ where: { responseId: job.responseId, status: job.status, claimToken: job.claimToken, updatedAt: job.updatedAt }, data: { status: 'processing', claimToken: token, leaseUntil: new Date(Date.now()+300000) } })).count) return;
    try {
      const response = await db.negotiationResponse.findUnique({ where: { id: job.responseId }, include: { round: true } });
      if (!response) throw new Error('Response unavailable.');
      const doc = await db.document.findUnique({ where: { id: response.documentId } });
      if (!doc?.blobPath || doc.contractId !== response.round.contractId) throw new Error('Document unavailable.');
      const bytes = await this.storage.get(doc.blobPath);
      if (createHash('sha256').update(bytes.buffer).digest('hex') !== doc.sha256) throw new Error('Response integrity failed.');
      const clauses = await db.clause.findMany({ where: { playbookStandard: true }, select: { id: true, title: true, text: true }, orderBy: { id: 'asc' }, take: 101 });
      if (clauses.length > 100) throw new Error('Select a bounded playbook before analysis.');
      const result = await analyzeNegotiation(response.changes as any,clauses);
      await db.$transaction(async (tx: any) => {
        const updated = await tx.negotiationAnalysis.updateMany({ where: { responseId: response.id, claimToken: token }, data: { ...result, assessments: result.assessments as any, sourceSha256: doc.sha256, leaseUntil: null, claimToken: null } });
        if (updated.count) await this.audit.recordInTransaction(tx,{ action: 'negotiation.round_analyzed', entity: 'contract', entityId: response.round.contractId, summary: 'Internal negotiation round assessment prepared', metadata: { responseId: response.id, round: response.round.number, sourceSha256: doc.sha256, model: result.model, status: result.status, count: result.assessments.length, playbookHash: createHash('sha256').update(JSON.stringify(clauses)).digest('hex') } });
      });
    } catch {
      await db.negotiationAnalysis.updateMany({ where: { responseId: job.responseId, claimToken: token }, data: { status: 'failed', detail: 'AI analysis was unavailable or its evidence could not be verified. The original document and exact changes remain available for Legal review.', leaseUntil: null, claimToken: null } });
    }
  }
}
