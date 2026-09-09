import { Injectable, NotFoundException } from '@nestjs/common';
import { INTAKE_REQUESTS, IntakeRequest, RiskLevel } from '@concord/shared';
import { CreateIntakeDto } from './create-intake.dto';
import { PrismaService } from '../persistence/prisma.service';

interface Triage {
  contractType: string;
  templateId: string;
  risk: RiskLevel;
}

/**
 * Contract intake with AI triage. Persists to Postgres when Prisma is enabled,
 * otherwise keeps requests in memory (seeded from @concord/shared).
 */
@Injectable()
export class IntakeService {
  private requests: IntakeRequest[] = [...INTAKE_REQUESTS];
  private seq = INTAKE_REQUESTS.length;

  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<IntakeRequest[]> {
    if (this.prisma.enabled) return this.prisma.client.intakeRequest.findMany({ orderBy: { createdAt: 'desc' } });
    return this.requests;
  }

  async getById(id: string): Promise<IntakeRequest> {
    const r = this.prisma.enabled
      ? await this.prisma.client.intakeRequest.findUnique({ where: { id } })
      : this.requests.find((x) => x.id === id);
    if (!r) throw new NotFoundException(`Intake ${id} not found`);
    return r;
  }

  async create(dto: CreateIntakeDto): Promise<IntakeRequest> {
    const triage = this.triage(dto);
    const req: IntakeRequest = {
      id: await this.nextId(),
      title: dto.title,
      counterparty: dto.counterparty,
      businessUnit: dto.businessUnit,
      requestor: dto.requestor,
      description: dto.description,
      contractType: dto.contractType ?? triage.contractType,
      suggestedTemplateId: triage.templateId,
      triageRisk: triage.risk,
      status: 'triaged',
      createdAt: new Date().toISOString().slice(0, 10),
    };
    if (this.prisma.enabled) {
      const { createdAt, ...data } = req;
      return this.prisma.client.intakeRequest.create({ data });
    }
    this.requests = [req, ...this.requests];
    return req;
  }

  /**
   * Allocates the next intake identifier (finding C-D22).
   *
   * This used to be `count() + 1`, which is not an identifier: two intakes
   * created at the same moment read the same count, mint the same id, and the
   * second insert fails on the primary key — losing a request the user believes
   * was filed. `nextval` on a Postgres sequence is atomic across replicas, and
   * the sequence is created by a versioned migration, not at runtime.
   */
  private async nextId(): Promise<string> {
    const year = new Date().getFullYear();
    if (this.prisma.enabled) {
      const rows: Array<{ n: bigint | number }> = await this.prisma.client.$queryRawUnsafe(
        "SELECT nextval('intake_seq') AS n",
      );
      const n = Number(rows?.[0]?.n ?? 0);
      if (n > 0) return `INT-${year}-${String(n).padStart(3, '0')}`;
      throw new Error('intake_seq returned no value — has the migration been applied?');
    }
    this.seq += 1;
    return `INT-${year}-${String(this.seq).padStart(3, '0')}`;
  }

  private triage(dto: CreateIntakeDto): Triage {
    const t = `${dto.title} ${dto.description}`.toLowerCase();
    if (/\bnda\b|non-disclosure|confidential/.test(t))
      return { contractType: 'Compliance', templateId: 'TPL-NDA', risk: 'low' };
    if (/lease|premises|\brent\b|tenancy/.test(t))
      return { contractType: 'Real Estate', templateId: 'TPL-LEASE', risk: 'medium' };
    if (/franchise|fofo/.test(t))
      return { contractType: 'Franchise', templateId: 'TPL-FOFO', risk: 'medium' };
    if (/data|dpdp|privacy|processing|personal/.test(t))
      return { contractType: 'Compliance', templateId: 'TPL-MSA', risk: 'high' };
    return { contractType: 'IT / SaaS', templateId: 'TPL-MSA', risk: 'low' };
  }
}
