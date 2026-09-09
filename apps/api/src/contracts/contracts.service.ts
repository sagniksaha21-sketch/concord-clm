import { ConflictException, Injectable, NotFoundException, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CONTRACTS, Contract } from '@concord/shared';
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
    return { id:x.id,title:x.title,counterparty:x.counterparty,type:x.type,valueDisplay:x.valueDisplay,stage:x.stage,risk:x.risk,version:x.version,source:x.source } as Contract;
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
    const row = await this.prisma.client.contract.findUnique({ where: { id } });
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

  async update(id: string, dto: UpdateContractDto): Promise<Contract> {
    if (!this.prisma.enabled) throw new ServiceUnavailableException('Contract persistence unavailable');
    await this.prisma.client.contract.findUniqueOrThrow({ where: { id } }).catch(() => { throw new NotFoundException(`Contract ${id} not found`); });
    const [routing, decision, signature] = await Promise.all([
      this.prisma.client.approvalRouting.findUnique({ where: { contractId: id }, select: { contractId: true } }),
      this.prisma.client.approvalDecision.findUnique({ where: { contractId: id }, select: { contractId: true } }),
      this.prisma.client.signatureRequest.findFirst({ where: { contractId: id }, select: { id: true } }),
    ]);
    if (routing || decision || signature) {
      throw new ConflictException(
        'This contract is frozen because it has entered approval/signature. Mutating its legal metadata would break the document-to-approval integrity chain. Create an explicit new version instead.',
      );
    }
    const row = await this.prisma.client.contract.update({ where: { id }, data: dto });
    await this.refresh();
    return this.toDomain(row);
  }

  async refresh(): Promise<void> {
    if (!this.prisma.enabled) return;
    const rows = await this.prisma.client.contract.findMany({ orderBy: { updatedAt: 'desc' } });
    this.contracts = rows.map((x: any) => this.toDomain(x));
  }
}
