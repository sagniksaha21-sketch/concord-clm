import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApprovalResult, AuthUser, can, normalizeRole } from '@concord/shared';
import { ContractsService } from '../contracts/contracts.service';
import { AiReviewService } from '../ai-review/ai-review.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../persistence/prisma.service';
import { NotificationsService, wasDelivered } from '../notifications/notifications.service';
import { approvalEmailHtml } from '../notifications/templates';
import {
  actionableEmailHtml,
  buildApprovalCard,
  buildResultCard,
  verifyActionableToken,
} from '../notifications/adaptive-card';
import { randomUUID } from 'crypto';
import { isGraphConfigured } from '../notifications/graph.client';
import { ApprovalDto } from './approval.dto';

interface Routing {
  approvers: string[];
  stage: string;
  routedAt: string;
  expiresAt: string;
  documentId?: string;
  documentSha256?: string;
  contractVersion?: string;
}

interface Decision {
  contractId: string;
  decision: string;
  decidedBy: string;
  comment?: string;
  decidedAt: string;
  /** Whether the Outlook actionable-message token verified — recorded, not assumed. */
  tokenVerified?: boolean;
  documentId?: string;
  documentSha256?: string;
  contractVersion?: string;
}

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  /**
   * Fallback store for approval routing when no database is configured.
   *
   * This used to be the ONLY store (finding C-D6). A per-process Map means the
   * routing disappears on every restart and deploy, and a callback that lands on
   * a different replica sees nothing — so the legitimate approver is told
   * "you were not routed as an approver for this contract" and there is no way
   * to recover except re-routing. With Postgres, routing is now a table.
   */
  private readonly routedApproversMem = new Map<string, Routing>();
  private readonly decisionsMem = new Map<string, Decision>();

  constructor(
    private readonly contracts: ContractsService,
    private readonly review: AiReviewService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  private get useDb(): boolean {
    return this.prisma.enabled && Boolean(this.prisma.client?.approvalRouting);
  }

  private get routingTtlMs(): number {
    return Number(process.env.APPROVAL_ROUTING_TTL_HOURS || 720) * 3600_000;
  }

  // ─── Durable routing ────────────────────────────────────────────────────────

  private async saveRouting(
    contractId: string,
    approvers: string[],
    routedBy?: string,
    pin?: { documentId?: string; documentSha256?: string; contractVersion?: string },
  ): Promise<void> {
    const routedAt = new Date();
    const expiresAt = new Date(routedAt.getTime() + this.routingTtlMs);
    const lower = approvers.map((a) => a.toLowerCase());
    if (this.useDb) {
      await this.prisma.client.approvalRouting.upsert({
        where: { contractId },
        update: { approvers: lower, stage: 'approval', routedBy: routedBy ?? null, routedAt, expiresAt, documentId: pin?.documentId ?? null, documentSha256: pin?.documentSha256 ?? null, contractVersion: pin?.contractVersion ?? null },
        create: { contractId, approvers: lower, stage: 'approval', routedBy: routedBy ?? null, routedAt, expiresAt, documentId: pin?.documentId ?? null, documentSha256: pin?.documentSha256 ?? null, contractVersion: pin?.contractVersion ?? null },
      });
      return;
    }
    this.routedApproversMem.set(contractId, {
      approvers: lower,
      stage: 'approval',
      routedAt: routedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      documentId: pin?.documentId, documentSha256: pin?.documentSha256, contractVersion: pin?.contractVersion,
    });
  }

  /** Puts a previous routing back verbatim (rollback after a failed send). */
  private async restoreRouting(contractId: string, r: Routing): Promise<void> {
    if (this.useDb) {
      await this.prisma.client.approvalRouting.upsert({
        where: { contractId },
        update: {
          approvers: r.approvers,
          stage: r.stage,
          routedAt: new Date(r.routedAt),
          expiresAt: new Date(r.expiresAt), documentId: r.documentId ?? null, documentSha256: r.documentSha256 ?? null, contractVersion: r.contractVersion ?? null,
        },
        create: {
          contractId,
          approvers: r.approvers,
          stage: r.stage,
          routedAt: new Date(r.routedAt),
          expiresAt: new Date(r.expiresAt), documentId: r.documentId ?? null, documentSha256: r.documentSha256 ?? null, contractVersion: r.contractVersion ?? null,
        },
      });
      return;
    }
    this.routedApproversMem.set(contractId, r);
  }

  private async clearRouting(contractId: string): Promise<void> {
    if (this.useDb) {
      await this.prisma.client.approvalRouting
        .delete({ where: { contractId } })
        .catch(() => undefined);
      return;
    }
    this.routedApproversMem.delete(contractId);
  }

  private async loadRouting(contractId: string): Promise<Routing | null> {
    if (this.useDb) {
      const r = await this.prisma.client.approvalRouting.findUnique({ where: { contractId } });
      if (!r) return null;
      return {
        approvers: r.approvers ?? [],
        stage: r.stage,
        routedAt: new Date(r.routedAt).toISOString(),
        expiresAt: new Date(r.expiresAt).toISOString(),
        documentId: r.documentId ?? undefined, documentSha256: r.documentSha256 ?? undefined, contractVersion: r.contractVersion ?? undefined,
      };
    }
    return this.routedApproversMem.get(contractId) ?? null;
  }

  // ─── Durable, atomic first decision (finding C-D8) ──────────────────────────

  /**
   * Records the decision and claims the one-shot slot in a SINGLE statement.
   *
   * The previous order was: claim a key, then write the audit event. A crash in
   * between consumed the claim while losing the decision — permanently, because
   * the approver's next attempt was rejected as a duplicate. Writing the decision
   * itself as the claim makes that window impossible: either the row exists (and
   * carries what was decided, by whom) or nothing happened at all.
   *
   * Returns the winning decision — this call's, or the one already stored.
   */
  private async claimDecision(d: Decision): Promise<{ decision: Decision; first: boolean }> {
    if (!this.useDb) {
      const existing = this.decisionsMem.get(d.contractId);
      if (existing) return { decision: existing, first: false };
      this.decisionsMem.set(d.contractId, d);
      return { decision: d, first: true };
    }
    try {
      await this.prisma.client.approvalDecision.create({
        data: {
          contractId: d.contractId,
          decision: d.decision,
          decidedBy: d.decidedBy,
          comment: d.comment ?? null,
          tokenVerified: d.tokenVerified ?? true,
          decidedAt: new Date(d.decidedAt), documentId: d.documentId ?? null, documentSha256: d.documentSha256 ?? null, contractVersion: d.contractVersion ?? null,
        },
      });
      return { decision: d, first: true };
    } catch (e: any) {
      // Only a UNIQUE violation on the primary key means "someone already
      // decided". Any other error (connection dropped, pool timeout) must NOT be
      // reinterpreted as a duplicate: the follow-up read could return this very
      // caller's own committed row and report `first: false`, telling the real
      // approver they were too late and skipping the audit event.
      const isConflict =
        e?.code === 'P2002' ||
        /unique constraint|duplicate key/i.test(String(e?.message ?? e));
      if (!isConflict) throw e;

      const existing = await this.prisma.client.approvalDecision.findUnique({
        where: { contractId: d.contractId },
      });
      if (!existing) throw e;
      // A conflict against a row this call itself wrote (a retry after a
      // post-commit failure) is not someone else's decision.
      const sameCaller =
        existing.decidedBy === d.decidedBy && existing.decision === d.decision;
      return {
        decision: {
          contractId: existing.contractId,
          decision: existing.decision,
          decidedBy: existing.decidedBy,
          comment: existing.comment ?? undefined,
          decidedAt: new Date(existing.decidedAt).toISOString(),
          documentId: existing.documentId ?? undefined, documentSha256: existing.documentSha256 ?? undefined, contractVersion: existing.contractVersion ?? undefined,
        },
        first: sameCaller,
      };
    }
  }

  /** Routes a reviewed contract for approval and fires the Outlook notice. */
  async requestApproval(
    contractId: string,
    dto: ApprovalDto,
    requestedBy?: string,
  ): Promise<ApprovalResult> {
    const contract = await this.contracts.getByIdFresh(contractId);

    // Validate recipients BEFORE sending contract/review content. An arbitrary
    // external email address must not receive a confidential approval packet and
    // only fail later when the callback checks its role.
    const approvers = [...new Set((dto.approvers ?? []).map((a) => a.trim().toLowerCase()).filter(Boolean))];
    for (const email of approvers) {
      const r = await this.auth.findRole(email);
      if (!r || !can(normalizeRole(r), 'approve')) {
        throw new ForbiddenException(`Approval routing blocked: ${email} is not an authorized Concord approver.`);
      }
    }

    // Segregation of duties: you cannot route a contract to yourself to approve.
    const requester = (requestedBy ?? '').toLowerCase();
    if (requester && approvers.includes(requester)) {
      await this.audit.record({
        actor: { email: requester },
        action: 'approval.denied',
        entity: 'contract',
        entityId: contractId,
        summary: `Self-routing blocked — ${requester} attempted to route "${contract.title}" to themselves`,
        metadata: { reason: 'segregation of duties' },
      }).catch(() => undefined);
      throw new ForbiddenException(
        'Segregation of duties: you cannot route a contract to yourself for approval.',
      );
    }
    if (!this.prisma.enabled) throw new ServiceUnavailableException('Approval requires durable document persistence');
    const priorDecision = await this.prisma.client.approvalDecision.findUnique({ where: { contractId } });
    if (priorDecision) {
      throw new ConflictException(`This contract version already has a recorded ${priorDecision.decision} decision. Create an explicit new version before routing again.`);
    }
    const approvalDoc = await this.prisma.client.document.findFirst({
      where: { contractId, status: { not: 'quarantined' }, blobPath: { not: null }, sha256: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, sha256: true },
    });
    if (!approvalDoc?.sha256) {
      throw new ServiceUnavailableException('Approval requires an uploaded, malware-checked document with a persisted SHA-256 digest.');
    }
    const review = await this.review.getReview(contractId);
    if (review.documentId !== approvalDoc.id || review.documentSha256 !== approvalDoc.sha256 || review.contractVersion !== contract.version) {
      throw new ConflictException('The AI review is not grounded on the exact document hash/version currently being routed for approval. Re-run review on the latest document.');
    }

    const webOrigin =
      process.env.WEB_ORIGIN?.split(',')[0] ?? 'http://localhost:3000';
    const reviewUrl = `${webOrigin}/review/${contractId}`;

    const subject = `⚑ Action needed: approve ${contract.title} — ${contract.counterparty} (${contract.valueDisplay})`;

    // In-Outlook Approve/Reject via an Adaptive Card; HTML is the fallback body.
    const apiBase =
      process.env.APPROVAL_CALLBACK_URL ??
      `http://localhost:${process.env.PORT ?? 4000}`;
    const actionUrl = `${apiBase}/api/contracts/${contractId}/approval/action`;
    const originator = process.env.ACTIONABLE_EMAIL_ORIGINATOR ?? 'concord-clm';

    const card = buildApprovalCard(contract, review, actionUrl, originator, reviewUrl);
    const fallbackHtml = approvalEmailHtml(contract, review, reviewUrl, dto.note);
    const html = actionableEmailHtml(card, fallbackHtml);

    // Persist the routing BEFORE notifying: if the write fails we must not send
    // an approval request that the callback will then refuse. But routing is an
    // UPSERT keyed on the contract, so a failed send after a re-route would
    // otherwise leave the previous approvers revoked and the new ones un-emailed
    // — the contract approvable by nobody, under an error message saying nothing
    // happened. Capture the previous routing and roll back on failure.
    const previousRouting = await this.loadRouting(contractId);
    await this.saveRouting(contractId, approvers, requester || undefined, { documentId: approvalDoc.id, documentSha256: approvalDoc.sha256, contractVersion: contract.version });

    const rollback = async () => {
      try {
        if (previousRouting) {
          await this.restoreRouting(contractId, previousRouting);
        } else {
          await this.clearRouting(contractId);
        }
      } catch (e) {
        this.logger.error(`Could not roll back approval routing for ${contractId}: ${String(e)}`);
      }
    };

    let notification;
    try {
      notification = await this.notifications.sendEmail({
        to: approvers,
        subject,
        html,
      });
    } catch (e) {
      await rollback();
      throw e;
    }

    // A failed send is not a routed approval (finding C-D26). `sendEmail` never
    // throws and returns `dry-run` when Graph is unconfigured, so testing for
    // `'failed'` alone would let production route approvals nobody was emailed.
    if (!wasDelivered(notification)) {
      await rollback();
      await this.audit.record({
        actor: { email: requester || undefined },
        action: 'approval.route_failed',
        entity: 'contract',
        entityId: contractId,
        summary: `Approval request for "${contract.title}" could NOT be delivered to ${approvers.join(', ')}`,
        metadata: { routedTo: approvers, status: notification.status, detail: notification.detail },
      }).catch(() => undefined);
      throw new ServiceUnavailableException(
        `The approval request could not be emailed to ${approvers.join(', ')} ` +
          `(delivery status: ${notification.status}). Routing was rolled back — ` +
          'retry once Outlook delivery is configured and restored.',
      );
    }

    await this.audit.record({
      action: 'approval.requested',
      entity: 'contract',
      entityId: contractId,
      summary: `Routed "${contract.title}" for approval to ${approvers.join(', ')}`,
      metadata: {
        routedTo: approvers,
        riskLevel: review.riskLevel,
        riskScore: review.riskScore,
        note: dto.note,
        delivery: notification.status,
      },
      // The AI review informed routing but never approves on its own.
      ai: this.audit.aiProvenance('review', { model: review.model, advisory: true }),
    });

    return {
      contractId,
      routedTo: approvers,
      notification,
    };
  }


  async approvalWorkspace(contractId: string, actor: AuthUser) {
    if (!this.prisma.enabled) throw new ServiceUnavailableException('Saved approval records are unavailable.');
    await this.contracts.getByIdFresh(contractId);
    const [routing, steps, decision, users] = await Promise.all([
      this.prisma.client.approvalRouting.findUnique({ where: { contractId } }),
      this.prisma.client.approvalStep.findMany({ where: { contractId }, orderBy: { approverName: 'asc' } }),
      this.prisma.client.approvalDecision.findUnique({ where: { contractId } }),
      can(normalizeRole(actor.role), 'approval:route') ? this.prisma.client.user.findMany({ select: { id: true, name: true, email: true, role: true }, orderBy: { name: 'asc' } }) : [],
    ]);
    return { steps, recommendation: routing?.recommendation ?? '', documentId: routing?.documentId, documentSha256: routing?.documentSha256, contractVersion: routing?.contractVersion,
      decision: decision?.decision, expiresAt: routing?.expiresAt, outlookConfigured: isGraphConfigured(),
      canDecide: !!routing && new Date(routing.expiresAt).getTime() > Date.now() && can(normalizeRole(actor.role), 'approve') && steps.some((s: any) => s.approverEmail === actor.email.toLowerCase() && s.decision === 'pending') && !decision,
      available: users.filter((u: any) => u.email.toLowerCase() !== actor.email.toLowerCase() && can(normalizeRole(u.role), 'approve')).map((u: any) => ({ id: u.id, name: u.name, email: u.email })) };
  }

  async routeInApp(contractId: string, dto: ApprovalDto, actor: AuthUser) {
    if (!this.prisma.enabled) throw new ServiceUnavailableException('Approvals require durable storage.');
    const contract = await this.contracts.getByIdFresh(contractId);
    if (contract.stage !== 'review') throw new ConflictException('Finish drafting and open Review before requesting approval.');
    const approvers = [...new Set(dto.approvers.map(e => e.trim().toLowerCase()))];
    if (!approvers.length || approvers.includes(actor.email.toLowerCase())) throw new ForbiddenException('Choose another authorised approver; you cannot approve your own routing.');
    const review = await this.review.getReview(contractId);
    const db = this.prisma.client;
    await db.$transaction(async (tx: any) => {
      await tx.$queryRawUnsafe('SELECT id FROM "Contract" WHERE id = $1 FOR UPDATE', contractId);
      const current = await tx.contract.findUnique({ where: { id: contractId }, include: { intakeRequest: true } });
      if (current.stage !== 'review' || current.version !== contract.version) throw new ConflictException('The agreement changed during review. Refresh before requesting approval.');
      const ownerId = current.intakeRequest?.assignedLegalUserId ?? current.ownerId;
      if (ownerId && !['admin', 'lead'].includes(normalizeRole(actor.role)) && ownerId !== actor.id) throw new ForbiddenException('This agreement is assigned to another lawyer.');
      if (await tx.approvalRouting.findUnique({ where: { contractId } }) || await tx.approvalDecision.findUnique({ where: { contractId } })) throw new ConflictException('This version has already been routed.');
      const document = await tx.document.findFirst({ where: { contractId, status: { not: 'quarantined' }, blobPath: { not: null }, sha256: { not: null } }, orderBy: { createdAt: 'desc' } });
      if (!document?.sha256 || review.documentId !== document.id || review.documentSha256 !== document.sha256 || review.contractVersion !== current.version) throw new ConflictException('Approval requires a review grounded to the exact current document and version.');
      const pin = { documentId: document.id, documentSha256: document.sha256, contractVersion: current.version };
      await tx.approvalRouting.create({ data: { contractId, approvers, routedBy: actor.email.toLowerCase(), expiresAt: new Date(Date.now() + this.routingTtlMs), recommendation: dto.note?.trim() || null, ...pin } });
      for (const email of approvers) {
        const user = await tx.user.findUnique({ where: { email } });
        if (!user || !can(normalizeRole(user.role), 'approve')) throw new ForbiddenException('Every approver must hold current approval authority in Concord.');
        await tx.approvalStep.create({ data: { id: randomUUID(), contractId, approverEmail: email, approverName: user.name, reason: dto.note?.trim() || 'Legal has requested your approval of this agreement and its recorded deviations.' } });
        await tx.requestNotification.create({ data: { id: randomUUID(), contractId, requestId: current.intakeRequest?.id ?? null, recipientId: user.id, kind: `approval-request:${current.version}`, title: `Approval required: ${current.title}`, body: `${actor.name} requests your decision. ${current.counterparty} · ${current.valueDisplay} · ${current.risk} risk. ${dto.note?.trim() || ''}`, emailStatus: isGraphConfigured() ? 'queued' : 'awaiting-configuration' } });
      }
      await tx.contract.update({ where: { id: contractId }, data: { stage: 'approval', lifecycleRevision: { increment: 1 } } });
      await this.audit.recordInTransaction(tx, { actor, action: 'approval.requested', entity: 'contract', entityId: contractId, summary: 'Approval cards created for every required approver', metadata: { approvers, ...pin, delivery: 'in-app', outlook: isGraphConfigured() ? 'queued' : 'awaiting-configuration', recommendation: dto.note } });
    }, { timeout: 20_000, maxWait: 10_000 });
    return this.approvalWorkspace(contractId, actor);
  }

  async decideInApp(contractId: string, body: { decision: string; comment?: string }, actor: AuthUser, tokenVerified = false) {
    if (!['approved', 'rejected', 'changes-requested'].includes(body.decision)) throw new BadRequestException('Choose approve, reject or request changes.');
    if (body.decision !== 'approved' && !body.comment?.trim()) throw new BadRequestException('Explain the rejection or changes requested.');
    if (!can(normalizeRole(actor.role), 'approve')) throw new ForbiddenException('Approval authority is required.');
    const db = this.prisma.client;
    await db.$transaction(async (tx: any) => {
      await tx.$queryRawUnsafe('SELECT id FROM "Contract" WHERE id = $1 FOR UPDATE', contractId);
      const contract = await tx.contract.findUnique({ where: { id: contractId }, include: { intakeRequest: true } });
      const route = await tx.approvalRouting.findUnique({ where: { contractId } });
      const email = actor.email.toLowerCase();
      if (!contract || !route || route.routedBy === email || !route.approvers.includes(email) || new Date(route.expiresAt).getTime() <= Date.now()) throw new ForbiddenException('This approval is not currently assigned to you.');
      // Recheck the persisted role as well as the signed-in claims.
      const user = await tx.user.findUnique({ where: { email } });
      if (!user || !can(normalizeRole(user.role), 'approve')) throw new ForbiddenException('Your approval authority has changed.');
      const doc = await tx.document.findFirst({ where: { contractId, status: { not: 'quarantined' }, blobPath: { not: null } }, orderBy: { createdAt: 'desc' } });
      if (!doc?.sha256 || doc.id !== route.documentId || doc.sha256 !== route.documentSha256 || contract.version !== route.contractVersion) throw new ConflictException('The document changed after routing. This approval is blocked.');
      const step = await tx.approvalStep.findUnique({ where: { contractId_approverEmail: { contractId, approverEmail: email } } });
      if (!step) throw new ForbiddenException('There is no approval card assigned to you.');
      if (step.decision !== 'pending') {
        if (step.decision === body.decision && (step.comment ?? '') === (body.comment?.trim() ?? '')) return;
        throw new ConflictException('Your decision has already been recorded.');
      }
      if (await tx.approvalDecision.findUnique({ where: { contractId } })) throw new ConflictException('This approval round has finished.');
      await tx.approvalStep.update({ where: { id: step.id }, data: { decision: body.decision, comment: body.comment?.trim() || null, decidedAt: new Date() } });
      const outstanding = await tx.approvalStep.count({ where: { contractId, decision: { not: 'approved' } } });
      const finished = body.decision !== 'approved' || outstanding === 0;
      if (finished) {
        await tx.approvalDecision.create({ data: { contractId, decision: body.decision, decidedBy: email, comment: body.comment?.trim() || null, tokenVerified, documentId: route.documentId, documentSha256: route.documentSha256, contractVersion: route.contractVersion } });
        await tx.contract.update({ where: { id: contractId }, data: { stage: body.decision === 'approved' ? 'signature' : 'review', lifecycleRevision: { increment: 1 } } });
        const owner = contract.intakeRequest?.assignedLegalUserId ?? contract.ownerId;
        if (owner) await tx.requestNotification.create({ data: { id: randomUUID(), contractId, requestId: contract.intakeRequest?.id ?? null, recipientId: owner, kind: `approval-complete:${contract.version}`, title: `Approval ${body.decision}: ${contract.title}`, body: body.comment?.trim() || (body.decision === 'approved' ? 'All required approvals are recorded. Prepare the approved document for signature.' : 'Open the agreement to review the decision.'), emailStatus: isGraphConfigured() ? 'queued' : 'awaiting-configuration' } });
      }
      await this.audit.recordInTransaction(tx, { actor, action: `approval.${body.decision}`, entity: 'contract', entityId: contractId, summary: `${actor.name} recorded ${body.decision}`, metadata: { stepId: step.id, finished, outstanding, comment: body.comment, documentId: route.documentId, documentSha256: route.documentSha256, contractVersion: route.contractVersion, channel: tokenVerified ? 'outlook' : 'concord' } });
    }, { timeout: 20_000, maxWait: 10_000 });
    return this.approvalWorkspace(contractId, actor);
  }

  /** Handles the Outlook Adaptive Card Approve/Reject callback (Action.Http). */
  async recordCardAction(
    contractId: string,
    body: { decision?: string; comment?: string },
    authHeader?: string,
  ) {
    const contract = await this.contracts.getByIdFresh(contractId);

    const apiBase =
      process.env.APPROVAL_CALLBACK_URL ??
      `http://localhost:${process.env.PORT ?? 4000}`;
    const audience = `${apiBase}/api/contracts/${contractId}/approval/action`;
    const check = await verifyActionableToken(authHeader, audience);

    // No bypass: this is a public endpoint that records a legally-significant
    // decision, so an invalid or absent token is always rejected. (The in-app
    // route POST /api/contracts/:id/approval is the authenticated alternative.)
    if (!check.valid) {
      await this.audit.record({
        action: 'approval.denied', entity: 'contract', entityId: contractId,
        summary: `Approval token rejected — ${check.reason}`,
        metadata: { reason: check.reason, tokenVerified: false },
      }).catch(() => undefined);
      throw new UnauthorizedException(`Actionable message token rejected: ${check.reason}`);
    }

    if (body?.decision !== 'approved' && body?.decision !== 'rejected') {
      throw new BadRequestException('Decision must be exactly "approved" or "rejected".');
    }
    const decision = body.decision;
    const performer = (check.actionPerformer ?? '').toLowerCase();

    // Approver authorization — always enforced. The verified identity must hold
    // the `approve` permission AND be one of the approvers this contract was
    // routed to, within the routing's validity window. The routing is read from
    // durable storage, so a restart or another replica does not lock them out.
    const routed = await this.loadRouting(contractId);
    const routingFresh = routed ? new Date(routed.expiresAt).getTime() > Date.now() : false;
    const role = performer ? await this.auth.findRole(performer) : null;
    const hasApprove = role ? can(normalizeRole(role), 'approve') : false;
    const inRoutedList = routed ? routed.approvers.includes(performer) : false;
    if (!performer || !hasApprove || !routed || !routingFresh || !inRoutedList) {
      const reason = !performer
        ? 'no verified approver identity'
        : !hasApprove
          ? 'identity lacks the approve permission'
          : !routed
            ? 'no approval routing on record for this contract'
            : !routingFresh
              ? 'the approval routing for this contract has expired'
              : 'identity was not routed as an approver for this contract';
      await this.audit.record({
        actor: { email: performer || undefined },
        action: 'approval.denied', entity: 'contract', entityId: contractId,
        summary: `Approval attempt denied — ${reason}`,
        metadata: { reason, tokenVerified: check.valid },
      }).catch(() => undefined);
      throw new ForbiddenException(`Approval not authorized — ${reason}`);
    }

    const currentDoc = this.prisma.enabled
      ? await this.prisma.client.document.findFirst({
          where: { contractId, status: { not: 'quarantined' }, blobPath: { not: null } },
          orderBy: { createdAt: 'desc' }, select: { id: true, sha256: true },
        })
      : null;
    if (!routed.documentId || !routed.documentSha256 || !currentDoc ||
        currentDoc.id !== routed.documentId || currentDoc.sha256 !== routed.documentSha256 ||
        contract.version !== routed.contractVersion) {
      await this.audit.record({ action: 'approval.denied', entity: 'contract', entityId: contractId,
        summary: 'Approval denied because the routed document/version no longer matches the current contract',
        metadata: { routedDocumentId: routed.documentId, currentDocumentId: currentDoc?.id, routedHash: routed.documentSha256, currentHash: currentDoc?.sha256, routedVersion: routed.contractVersion, currentVersion: contract.version },
      }).catch(() => undefined);
      throw new ConflictException('The contract/document changed after routing. Re-run review and route the new version for approval.');
    }

    if (this.prisma.enabled && this.prisma.client.approvalStep && await this.prisma.client.approvalStep.count({ where: { contractId } })) {
      const user = await this.prisma.client.user.findUnique({ where: { email: performer } });
      const result = await this.decideInApp(contractId, body as { decision: string; comment?: string }, { id: user.id, email: user.email, name: user.name, role: user.role }, true);
      return { ok: true, ...result, refreshCard: buildResultCard(contract, decision) };
    }

    this.logger.log(
      `Outlook card action · ${contractId} · ${decision} · token verified · by ${performer}` +
        `${body?.comment ? ` · note: "${body.comment}"` : ''}`,
    );

    // Idempotency + conflict prevention, with the decision itself as the claim:
    // the FIRST decision for a contract wins and is durable the moment it wins.
    const { decision: winning, first } = await this.claimDecision({
      contractId,
      decision,
      decidedBy: performer,
      comment: body?.comment,
      decidedAt: new Date().toISOString(),
      tokenVerified: check.valid, documentId: routed.documentId, documentSha256: routed.documentSha256, contractVersion: routed.contractVersion,
    });

    if (!first) {
      this.logger.warn(
        `Approval for ${contractId} already decided (${winning.decision} by ${winning.decidedBy}) — ignoring "${decision}"`,
      );
      return {
        ok: true,
        duplicate: true,
        decision: winning.decision,
        decidedBy: winning.decidedBy,
        decidedAt: winning.decidedAt,
        tokenVerified: check.valid,
        actor: check.actionPerformer,
        refreshCard: buildResultCard(contract, winning.decision as 'approved' | 'rejected'),
      };
    }

    // The human approval decision — the legally significant event. The decision
    // row above is already durable, so an audit failure here is recoverable
    // rather than a lost decision.
    await this.audit.record({
      actor: { email: check.actionPerformer },
      action: `approval.${decision}`,
      entity: 'contract',
      entityId: contractId,
      summary: `${contract.title} — ${decision} via Outlook by ${check.actionPerformer ?? 'unknown approver'}`,
      metadata: {
        decision,
        tokenVerified: check.valid,
        tokenReason: check.valid ? undefined : check.reason,
        comment: body?.comment,
      },
    });

    return {
      ok: true,
      tokenVerified: check.valid,
      actor: check.actionPerformer,
      decision,
      refreshCard: buildResultCard(contract, decision),
    };
  }
}
