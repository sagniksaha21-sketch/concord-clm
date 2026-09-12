import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { AuthUser, can, ClientRequest, ClientRequestList, ClientRequestOptions, normalizeRole, REQUEST_STATUSES, ROLE_LABELS } from '@concord/shared';
import { PrismaService } from '../persistence/prisma.service';
import { AuditService } from '../audit/audit.service';
import { IntakeService } from '../intake/intake.service';
import { isGraphConfigured } from '../notifications/graph.client';
import { CreateClientRequestDto, UpdateClientRequestDto } from './client-request.dto';

const PERSON = { id: true, name: true, email: true, role: true };
const INCLUDE = { requester: { select: PERSON }, assignedLegal: { select: PERSON }, contract: { select: { id: true, stage: true } }, notifications: { where: { kind: 'assignment' }, select: { emailStatus: true }, take: 1 } };
const isLead = (user: AuthUser) => ['admin', 'lead'].includes(normalizeRole(user.role));

export function validateTermDates(dto: CreateClientRequestDto): void {
  for (const date of [dto.requestedByDate, dto.terms.startDate, dto.terms.endDate].filter(Boolean) as string[]) {
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      throw new BadRequestException('Enter valid calendar dates in the term sheet.');
    }
  }
  if (dto.terms.startDate && dto.terms.endDate && dto.terms.endDate < dto.terms.startDate) {
    throw new BadRequestException('The agreement end date must be on or after its start date.');
  }
  if (dto.terms.amount && Number(dto.terms.amount) > 0 && !dto.terms.paymentTerms?.trim()) {
    throw new BadRequestException('Add payment terms when an agreement value is provided.');
  }
}

function canonical(value: unknown): unknown {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  }
  return value;
}

@Injectable()
export class ClientRequestsService {
  constructor(private readonly prisma: PrismaService, private readonly intake: IntakeService, private readonly audit: AuditService) {}

  private database() {
    if (!this.prisma.enabled) throw new ServiceUnavailableException('Requests cannot be saved while the database is unavailable. Please try again later.');
    return this.prisma.client;
  }

  async options(actor: AuthUser): Promise<ClientRequestOptions> {
    const users = this.prisma.enabled ? await this.prisma.client.user.findMany({ select: PERSON, orderBy: { name: 'asc' } }) : [];
    return {
      legalTeam: users.filter((u: any) => can(normalizeRole(u.role), 'request:manage')).map((u: any) => ({ id: u.id, name: u.name, email: u.email, roleLabel: ROLE_LABELS[normalizeRole(u.role)] })),
      requester: { id: actor.id, name: actor.name, email: actor.email },
      canManage: can(normalizeRole(actor.role), 'request:manage'), canSeeAll: isLead(actor),
      outlookConfigured: isGraphConfigured(), persistenceAvailable: this.prisma.enabled,
    };
  }

  private scope(actor: AuthUser, view?: string): any {
    if (view && !['mine', 'assigned', 'all'].includes(view)) throw new BadRequestException('Choose a valid request view.');
    const base = { requesterId: { not: null }, contractId: { not: null } };
    if (view === 'all' && !isLead(actor)) throw new ForbiddenException('Only a legal lead or administrator can view every client request.');
    if (view === 'mine' || normalizeRole(actor.role) === 'requester') return { ...base, requesterId: actor.id };
    if (view === 'assigned') return { ...base, assignedLegalUserId: actor.id };
    if (isLead(actor)) return base;
    return { ...base, OR: [{ requesterId: actor.id }, { assignedLegalUserId: actor.id }] };
  }

  private canManage(row: any, actor: AuthUser) {
    return can(normalizeRole(actor.role), 'request:manage') && (isLead(actor) || row.assignedLegalUserId === actor.id);
  }

  private domain(row: any, actor: AuthUser): ClientRequest {
    return {
      id: row.id, title: row.title, counterparty: row.counterparty, businessUnit: row.businessUnit, contractType: row.contractType,
      requester: { id: row.requester.id, name: row.requester.name, email: row.requester.email },
      assignedLegal: { id: row.assignedLegal.id, name: row.assignedLegal.name, email: row.assignedLegal.email, roleLabel: ROLE_LABELS[normalizeRole(row.assignedLegal.role)] },
      requestedByDate: row.requestedByDate, urgency: row.urgency, terms: row.terms,
      status: row.clientStatus, legalNote: row.legalNote ?? undefined, contractId: row.contractId, contractStage: row.contract.stage,
      version: row.version, createdAt: new Date(row.createdAt).toISOString(), updatedAt: new Date(row.updatedAt).toISOString(),
      emailStatus: row.notifications[0]?.emailStatus ?? 'not-requested', canManage: this.canManage(row, actor), canOpenAgreement: can(normalizeRole(actor.role), 'contract:read'),
    };
  }

  async list(actor: AuthUser, view?: string): Promise<ClientRequestList> {
    const where = this.scope(actor, view);
    if (!this.prisma.enabled) return { items: [], total: 0 };
    const [rows, total] = await Promise.all([
      this.prisma.client.intakeRequest.findMany({ where, include: INCLUDE, take: 100, orderBy: { createdAt: 'desc' } }),
      this.prisma.client.intakeRequest.count({ where }),
    ]);
    return { items: rows.map((r: any) => this.domain(r, actor)), total };
  }

  async get(id: string, actor: AuthUser): Promise<ClientRequest> {
    if (!this.prisma.enabled) throw new NotFoundException('Request not found.');
    const row = await this.prisma.client.intakeRequest.findFirst({ where: { AND: [{ id }, this.scope(actor)] }, include: INCLUDE });
    if (!row) throw new NotFoundException('Request not found.');
    return this.domain(row, actor);
  }

  async create(input: CreateClientRequestDto, actor: AuthUser): Promise<ClientRequest> {
    const db = this.database();
    const dto = canonical(input) as CreateClientRequestDto;
    validateTermDates(dto);
    const { submissionKey, ...payload } = dto;
    const payloadHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const existing = await db.intakeRequest.findUnique({ where: { submissionKey } });
    if (existing) return this.replay(existing, actor, payloadHash);
    let id: string;
    try {
      id = await db.$transaction(async (tx: any) => {
        const lawyer = await tx.user.findUnique({ where: { id: dto.assignedLegalUserId }, select: PERSON });
        if (!lawyer || !can(normalizeRole(lawyer.role), 'request:manage')) throw new BadRequestException('Choose a current member of the legal team.');
        const requester = await tx.user.findUnique({ where: { id: actor.id }, select: PERSON });
        if (!requester) throw new ForbiddenException('Your account is no longer available.');
        const requestId = await this.intake.allocateId(tx);
        const triage = this.intake.triage({ title: dto.title, counterparty: dto.counterparty, businessUnit: dto.businessUnit, requestor: requester.email, contractType: dto.contractType, description: dto.terms.scope });
        const contractId = randomUUID();
        await tx.contract.create({ data: { id: contractId, title: dto.title, counterparty: dto.counterparty, type: dto.contractType,
          valueDisplay: dto.terms.amount ? `${dto.terms.currency} ${Number(dto.terms.amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : 'Not specified',
          stage: 'intake', risk: triage.risk, version: 'v1', source: 'Department term sheet' } });
        await tx.intakeRequest.create({ data: { id: requestId, title: dto.title, counterparty: dto.counterparty, businessUnit: dto.businessUnit,
          requestor: requester.email, requesterId: requester.id, assignedLegalUserId: lawyer.id, contractType: dto.contractType,
          description: dto.terms.scope, suggestedTemplateId: triage.templateId, triageRisk: triage.risk, status: 'converted',
          contractId, terms: dto.terms, requestedByDate: dto.requestedByDate, urgency: dto.urgency, submissionKey, payloadHash } });
        await tx.requestNotification.create({ data: { id: randomUUID(), requestId, recipientId: lawyer.id, kind: 'assignment',
          title: `New agreement request: ${dto.title}`, body: `${requester.name} from ${dto.businessUnit} selected you. Requested by ${dto.requestedByDate}.`,
          emailStatus: isGraphConfigured() ? 'queued' : 'awaiting-configuration' } });
        await this.audit.recordInTransaction(tx, { actor, action: 'request.submitted', entity: 'intake', entityId: requestId,
          summary: `Department agreement request assigned to ${lawyer.name}`, metadata: { contractId, assignedLegalUserId: lawyer.id, requesterId: requester.id, businessUnit: dto.businessUnit } });
        return requestId;
      }, { timeout: 15_000, maxWait: 10_000 });
    } catch (error: any) {
      // A concurrent duplicate or a lost response after COMMIT must return the
      // original request, never create a second contract or notification.
      const landed = await db.intakeRequest.findUnique({ where: { submissionKey } });
      if (landed) return this.replay(landed, actor, payloadHash);
      throw error;
    }
    return this.get(id!, actor);
  }

  private async replay(row: any, actor: AuthUser, hash: string): Promise<ClientRequest> {
    if (row.requesterId !== actor.id || row.payloadHash !== hash) throw new ConflictException('This submission was already used for a different request. Reload the request list before submitting again.');
    return this.get(row.id, actor);
  }

  async update(id: string, dto: UpdateClientRequestDto, actor: AuthUser): Promise<ClientRequest> {
    const db = this.database();
    const before = await this.get(id, actor);
    if (!before.canManage) throw new ForbiddenException('Only the assigned lawyer, a legal lead or an administrator can update this request.');
    if (dto.status === 'waiting-on-client' && !dto.legalNote?.trim()) throw new BadRequestException('Explain what information the client needs to provide.');
    await db.$transaction(async (tx: any) => {
      const changed = await tx.intakeRequest.updateMany({ where: { id, version: dto.version }, data: { clientStatus: dto.status, legalNote: dto.legalNote?.trim() || null, version: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException('This request has changed. Refresh it before saving your update.');
      await tx.requestNotification.create({ data: { id: randomUUID(), requestId: id, recipientId: before.requester.id, kind: `status-${dto.version + 1}`,
        title: `Request update: ${before.title}`, body: `${REQUEST_STATUSES[dto.status]}.${dto.legalNote?.trim() ? ' ' + dto.legalNote.trim() : ''}`, emailStatus: 'not-requested' } });
      await this.audit.recordInTransaction(tx, { actor, action: 'request.status_changed', entity: 'intake', entityId: id,
        summary: `Request status changed to ${REQUEST_STATUSES[dto.status]}`, metadata: { from: before.status, to: dto.status, version: dto.version + 1 } });
    }, { timeout: 15_000, maxWait: 10_000 });
    return this.get(id, actor);
  }
}
