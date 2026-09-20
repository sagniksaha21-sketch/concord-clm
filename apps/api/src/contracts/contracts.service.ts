import { ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CONTRACTS, Contract, AuthUser, normalizeRole } from '@concord/shared';
import { PrismaService } from '../persistence/prisma.service';
import { isProduction } from '../security/security.config';
import { CreateContractDto, UpdateContractDto } from './contract.dto';

@Injectable()
export class ContractsService implements OnModuleInit {
  private contracts: Contract[] = [];
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    if (this.prisma.enabled) return this.refresh();
    if (!isProduction() && process.env.DEMO_SAMPLES !== 'false') this.contracts = [...CONTRACTS];
  }

  private toDomain(x: any): Contract {
    return { id:x.id,title:x.title,counterparty:x.counterparty,type:x.type,valueDisplay:x.valueDisplay,stage:x.stage,risk:x.risk,version:x.version,source:x.source, ...(x.intakeRequest ? { requestId: x.intakeRequest.id } : {}) } as Contract;
  }

  list(): Contract[] { return [...this.contracts]; }

  getById(id: string): Contract {
    const c = this.contracts.find((x) => x.id === id);
    if (!c) throw new NotFoundException(`Contract ${id} not found`);
    return c;
  }

  /** Authoritative read for request-time production decisions (multi-replica safe). */
  async listFresh(): Promise<Contract[]> {
    if (!this.prisma.enabled) return this.list();
    const rows = await this.prisma.client.contract.findMany({ orderBy: { updatedAt: 'desc' } });
    return rows.map((x: any) => this.toDomain(x));
  }

  /** Authoritative lookup for review/approval/signature decisions. */
  async getByIdFresh(id: string): Promise<Contract> {
    if (!this.prisma.enabled) return this.getById(id);
    const row = await this.prisma.client.contract.findUnique({ where: { id }, include: { intakeRequest: { select: { id: true } } } });
    if (!row) throw new NotFoundException(`Contract ${id} not found`);
    return this.toDomain(row);
  }

  async create(dto: CreateContractDto): Promise<Contract> {
    if (!this.prisma.enabled) throw new ServiceUnavailableException('Contract persistence unavailable');
    const row = await this.prisma.client.contract.create({ data: {
      id: randomUUID(), title: dto.title.trim(), counterparty: dto.counterparty.trim(), type: dto.type.trim(),
      valueDisplay: dto.valueDisplay?.trim() || 'Not specified', stage: dto.stage || 'intake', risk: dto.risk || 'low',
      version: dto.version?.trim() || 'v1', source: dto.source?.trim() || 'created in Concord',
    }});
    await this.refresh();
    return this.toDomain(row);
  }

  async update(id: string, dto: UpdateContractDto, actor: AuthUser): Promise<Contract> {
    if (!this.prisma.enabled) throw new ServiceUnavailableException('Contract persistence unavailable');
    const row = await this.prisma.client.$transaction(async (tx: any) => {
      await tx.$queryRawUnsafe('SELECT id FROM "Contract" WHERE id = $1 FOR UPDATE',id);
      const current = await tx.contract.findUnique({ where: { id }, include: { intakeRequest: true } });
      if (!current) throw new NotFoundException(`Contract ${id} not found`);
      const owner = current.intakeRequest?.assignedLegalUserId ?? current.ownerId;
      if (owner && owner !== actor.id && !['admin','lead'].includes(normalizeRole(actor.role))) throw new ForbiddenException('This agreement is assigned to another lawyer.');
      const [routing, decision, signature] = await Promise.all([
        tx.approvalRouting.findUnique({ where: { contractId: id }, select: { contractId: true } }),
        tx.approvalDecision.findUnique({ where: { contractId: id }, select: { contractId: true } }),
        tx.signatureRequest.findFirst({ where: { contractId: id }, select: { id: true } }),
      ]);
      if (routing || decision || signature || current.agreedDocumentId || current.executedAt || ['negotiation','agreed','approval','signature','active','renewal'].includes(current.stage)) {
        throw new ConflictException('This agreement is controlled by its current lifecycle. Use the Agreement Workspace to review or revise it.');
      }
      if (dto.stage !== undefined && dto.stage !== current.stage || dto.version !== undefined && dto.version !== current.version) {
        throw new ConflictException('Progress the agreement or save a document version inside the Agreement Workspace. Metadata edits cannot change lifecycle stage or version.');
      }
      return tx.contract.update({ where: { id }, data: { ...dto, lifecycleRevision: { increment: 1 } } });
    });
    await this.refresh();
    return this.toDomain(row);
  }

  async refresh(): Promise<void> {
    if (!this.prisma.enabled) return;
    const rows = await this.prisma.client.contract.findMany({ orderBy: { updatedAt: 'desc' } });
    this.contracts = rows.map((x: any) => this.toDomain(x));
  }
}
