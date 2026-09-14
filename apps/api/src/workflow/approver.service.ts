import { Injectable, NotFoundException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'crypto';
import { AuthUser } from '@concord/shared';
import { PrismaService } from '../persistence/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { WorkflowService } from './workflow.service';

@Injectable()
export class ApproverService {
  constructor(private readonly prisma: PrismaService, private readonly workflow: WorkflowService, private readonly storage: StorageService, private readonly audit: AuditService) {}
  private db() { if (!this.prisma.enabled) throw new ServiceUnavailableException('Saved approval cards are unavailable.'); return this.prisma.client; }
  async queue(actor: AuthUser) {
    const steps = await this.db().approvalStep.findMany({ where: { approverEmail: actor.email.toLowerCase() }, orderBy: { contract: { updatedAt: 'desc' } }, take: 200, include: { contract: { select: { id: true, title: true, counterparty: true, risk: true, valueDisplay: true, stage: true } } } });
    const routes = await this.db().approvalRouting.findMany({ where: { contractId: { in: steps.map((s: any) => s.contractId) } } });
    return steps.filter((s: any) => routes.some((r: any) => r.contractId === s.contractId)).map((s: any) => ({ ...s.contract, decision: s.decision, reason: s.reason, requestedAt: routes.find((r: any) => r.contractId === s.contractId)!.routedAt.toISOString() }));
  }
  private async assigned(id: string, actor: AuthUser) {
    const db = this.db(), email = actor.email.toLowerCase();
    const [step,route] = await Promise.all([db.approvalStep.findUnique({ where: { contractId_approverEmail: { contractId: id, approverEmail: email } } }), db.approvalRouting.findUnique({ where: { contractId: id } })]);
    if (!step || !route || !route.approvers.includes(email)) throw new NotFoundException('This approval is not assigned to you.');
    return { step,route };
  }
  async card(id: string, actor: AuthUser) {
    const { step,route } = await this.assigned(id,actor);
    const contract = await this.db().contract.findUnique({ where: { id }, select: { id: true, title: true, counterparty: true, type: true, valueDisplay: true, risk: true, version: true } });
    if (!contract) throw new NotFoundException('Agreement not found.');
    return { contract, assignedReason: step.reason, approval: await this.workflow.approvalWorkspace(id,actor), expired: route.expiresAt.getTime() <= Date.now() };
  }
  async file(id: string, actor: AuthUser) {
    const { route } = await this.assigned(id,actor);
    if (route.expiresAt.getTime() <= Date.now()) throw new ConflictException('This approval card expired. Ask Legal to issue a current card.');
    const doc = await this.db().document.findFirst({ where: { id: route.documentId ?? '', contractId: id, status: { not: 'quarantined' }, blobPath: { not: null } } });
    const contract = await this.db().contract.findUnique({ where: { id } });
    if (!doc?.sha256 || doc.sha256 !== route.documentSha256 || contract?.version !== route.contractVersion) throw new ConflictException('The approval document has changed. A current approval is required.');
    const file = await this.storage.get(doc.blobPath!);
    if (createHash('sha256').update(file.buffer).digest('hex') !== route.documentSha256) throw new ConflictException('The document failed its integrity check.');
    // Recheck routing after I/O; a revision may have replaced the approval round.
    const current = await this.assigned(id,actor);
    if (current.route.documentId !== route.documentId || current.route.documentSha256 !== route.documentSha256) throw new ConflictException('The approval changed while loading. Open the current card.');
    await this.audit.record({ actor, action: 'approval.document_accessed', entity: 'contract', entityId: id, summary: 'Assigned approver downloaded the pinned approval document', metadata: { documentId: doc.id, sha256: route.documentSha256 } });
    return { ...file, filename: doc.filename };
  }
}
