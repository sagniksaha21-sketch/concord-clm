import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { INTAKE_REQUESTS, IntakeRequest, RiskLevel } from '@concord/shared';
import { CreateIntakeDto } from './create-intake.dto';
import { PrismaService } from '../persistence/prisma.service';

interface Triage {
  contractType: string;
  templateId: string;
  risk: RiskLevel;
}

// Keep newly added term sheets out of legacy intake responses. The client
// request endpoints apply their own ownership checks before returning them.
const INTAKE_SELECT = { id: true, title: true, counterparty: true, businessUnit: true, requestor: true, description: true, contractType: true, suggestedTemplateId: true, triageRisk: true, status: true, createdAt: true };

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
    if (this.prisma.enabled) return this.prisma.client.intakeRequest.findMany({ select: INTAKE_SELECT, orderBy: { createdAt: 'desc' } });
    return this.requests;
  }

  async getById(id: string): Promise<IntakeRequest> {
    const r = this.prisma.enabled
      ? await this.prisma.client.intakeRequest.findUnique({ where: { id }, select: INTAKE_SELECT })
      : this.requests.find((x) => x.id === id);
    if (!r) throw new NotFoundException(`Intake ${id} not found`);
    return r;
  }

  async create(dto: CreateIntakeDto): Promise<IntakeRequest> {
    const triage = this.triage(dto);
    const req: IntakeRequest = {
      id: await this.allocateId(),
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
      return this.prisma.client.intakeRequest.create({ data, select: INTAKE_SELECT });
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
  async allocateId(transaction?: any): Promise<string> {
    const year = new Date().getFullYear();
    if (this.prisma.enabled) {
      const db = transaction ?? this.prisma.client;
      // Fixtures/imports can be inserted after the sequence migration. Consume
      // occupied values without resetting the shared sequence: setval(MAX(id))
      // could move it behind values already reserved by another replica.
      for (let attempt = 0; attempt < 100; attempt++) {
        const rows: Array<{ n: bigint | number }> = await db.$queryRawUnsafe("SELECT nextval('intake_seq') AS n");
        const n = Number(rows?.[0]?.n ?? 0);
        if (!(n > 0)) throw new Error('intake_seq returned no value — has the migration been applied?');
        const id = `INT-${year}-${String(n).padStart(3, '0')}`;
        if (!await db.intakeRequest.findUnique({ where: { id }, select: { id: true } })) return id;
      }
      throw new ServiceUnavailableException('Request numbering is catching up with imported records. Please submit again.');
    }
    this.seq += 1;
    return `INT-${year}-${String(this.seq).padStart(3, '0')}`;
  }

  triage(dto: CreateIntakeDto): Triage {
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
