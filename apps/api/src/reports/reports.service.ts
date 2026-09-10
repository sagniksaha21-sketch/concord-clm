import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  can,
  Contract,
  Obligation,
  PortfolioReport,
  ReportFormat,
  ReportAgreementRow,
  ReportObligationRow,
  ReportSignatureRow,
  Role,
  SignatureRequest,
} from '@concord/shared';
import { ContractsService } from '../contracts/contracts.service';
import { ObligationsService } from '../obligations/obligations.service';
import { ESignService } from '../esign/esign.service';
import { PrismaService } from '../persistence/prisma.service';
import { AuditService } from '../audit/audit.service';
import { buildXlsx } from './xlsx-exporter';
import { buildPdf } from './pdf-exporter';
import { buildPptx } from './pptx-exporter';
import { ReportAiService } from './report-ai.service';

const STAGE_LABELS: Record<string, string> = {
  intake: 'Intake',
  drafting: 'Drafting',
  review: 'Review',
  approval: 'Approval',
  signature: 'Signature',
  active: 'Active',
  renewal: 'Renewal',
};

const RISK_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
const DAY_MS = 86_400_000;

export interface ReportFile {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

/**
 * Builds the one canonical portfolio snapshot consumed by every export.
 *
 * Keeping the insight calculation in the API means the Excel, PDF, PowerPoint
 * and on-screen preview cannot quietly disagree. The language is deterministic
 * and traceable to persisted rows. An optional advisory model can enrich the
 * narrative without changing the authoritative metrics or register rows.
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly contracts: ContractsService,
    private readonly obligations: ObligationsService,
    private readonly esign: ESignService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly reportAi: ReportAiService,
  ) {}

  async portfolio(role: Role): Promise<PortfolioReport> {
    const report = await this.buildPortfolio(role);
    const deterministicInsights = report.insights.map((insight) => ({ ...insight, source: 'rules' as const }));
    const enrichment = await this.reportAi.enrich(report);
    report.ai = enrichment.meta;
    report.insights = enrichment.insights?.length
      ? [...enrichment.insights, ...deterministicInsights.slice(0, 1)]
      : deterministicInsights;
    return report;
  }

  private async buildPortfolio(role: Role): Promise<PortfolioReport> {
    const [contracts, obligations] = await Promise.all([
      this.contracts.listFresh(),
      this.obligations.list(),
    ]);

    // Signature requests include provider envelope and signatory data. Keep
    // them out of reports for roles that cannot open /api/esign themselves.
    const maySeeSignatures = can(role, 'esign:send');
    let signatures: SignatureRequest[] = [];
    const restricted: string[] = maySeeSignatures ? [] : ['signatures'];
    if (maySeeSignatures) {
      try {
        signatures = await this.esign.list();
      } catch (error) {
        // The report remains useful if an optional execution integration is
        // degraded. Mark the omission rather than turning it into zero.
        restricted.push('signatures');
        this.logger.error(`Could not read signature requests for report: ${String(error)}`);
      }
    }
    const generatedAt = new Date().toISOString();
    const sampleData = !this.prisma.enabled || process.env.DEMO_SAMPLES === 'true';

    const visibleObligations = maySeeSignatures
      ? obligations
      : obligations.filter((row) => row.type !== 'signature');
    const obligationRows = visibleObligations
      .map((row) => this.toObligationRow(row))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const signatureRows = signatures.map((row) => this.toSignatureRow(row));
    const signatureDetailAvailable = maySeeSignatures && !restricted.includes('signatures');
    const agreementRows = contracts
      .map((contract) => this.toAgreementRow(contract, obligationRows, signatureRows, signatureDetailAvailable))
      .sort((a, b) => {
        const risk = (RISK_ORDER[a.risk] ?? 9) - (RISK_ORDER[b.risk] ?? 9);
        return risk || a.title.localeCompare(b.title);
      });

    const risk = {
      low: contracts.filter((c) => c.risk === 'low').length,
      medium: contracts.filter((c) => c.risk === 'medium').length,
      high: contracts.filter((c) => c.risk === 'high').length,
    };
    const stages = Object.keys(STAGE_LABELS).map((stage) => ({
      stage,
      label: STAGE_LABELS[stage],
      count: contracts.filter((c) => c.stage === stage).length,
    }));

    const now = Date.now();
    const dueSoon = obligationRows.filter((row) => {
      const date = new Date(row.dueDate).getTime();
      return Number.isFinite(date) && date <= now + 90 * DAY_MS;
    });
    const overdue = obligationRows.filter((row) => new Date(row.dueDate).getTime() < now);
    const next30 = obligationRows.filter((row) => {
      const date = new Date(row.dueDate).getTime();
      return Number.isFinite(date) && date >= now && date <= now + 30 * DAY_MS;
    });
    const pendingSignatures = signatureRows.filter((row) =>
      ['sent', 'viewed', 'partially-signed'].includes(row.status),
    ).length;
    const legalReview = contracts.filter((c) => ['review', 'approval'].includes(c.stage)).length;

    const metrics = [
      { key: 'agreements', label: 'Agreements', value: contracts.length, displayValue: String(contracts.length), detail: 'Persisted contract records' },
      { key: 'legal-review', label: 'In legal review', value: legalReview, displayValue: String(legalReview), detail: 'Review and approval stages' },
      { key: 'high-risk', label: 'High risk', value: risk.high, displayValue: String(risk.high), detail: 'Playbook risk flagged' },
      { key: 'due-90', label: 'Due in 90 days', value: dueSoon.length, displayValue: String(dueSoon.length), detail: 'Obligations and renewals' },
      ...(signatureDetailAvailable
        ? [{ key: 'pending-signatures', label: 'Pending signature', value: pendingSignatures, displayValue: String(pendingSignatures), detail: 'Open signature requests' }]
        : []),
    ];

    const insights = this.buildInsights({
      contracts,
      risk,
      legalReview,
      overdue,
      next30,
      pendingSignatures,
      maySeeSignatures: signatureDetailAvailable,
      dueSoon,
    });

    return {
      scope: 'portfolio',
      generatedAt,
      dataMode: sampleData ? 'illustrative' : 'live',
      sampleData,
      restricted,
      metrics,
      insights,
      stageCounts: stages,
      risk,
      agreements: agreementRows,
      obligations: obligationRows,
      signatures: signatureRows,
    };
  }

  async export(format: string, role: Role, actor?: { id?: string; email?: string; role?: string }): Promise<ReportFile> {
    const normalized = String(format).toLowerCase() as ReportFormat;
    if (!['xlsx', 'pdf', 'pptx'].includes(normalized)) {
      throw new BadRequestException('Report format must be xlsx, pdf, or pptx');
    }
    const report = await this.portfolio(role);
    const stamp = report.generatedAt.slice(0, 10);
    const base = `concord-portfolio-report-${stamp}`;
    const files: Record<ReportFormat, ReportFile> = {
      xlsx: { buffer: buildXlsx(report), filename: `${base}.xlsx`, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      pdf: { buffer: buildPdf(report), filename: `${base}.pdf`, contentType: 'application/pdf' },
      pptx: { buffer: buildPptx(report), filename: `${base}.pptx`, contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
    };

    await this.audit.record({
      actor: actor ?? { email: 'report.export' },
      action: 'report.exported',
      entity: 'report',
      entityId: 'portfolio',
      summary: `Portfolio report exported as ${normalized.toUpperCase()}`,
      metadata: {
        format: normalized,
        agreementCount: report.agreements.length,
        obligationCount: report.obligations.length,
        dataMode: report.dataMode,
        aiStatus: report.ai?.status ?? 'disabled',
        aiProvider: report.ai?.provider ?? 'none',
        aiModel: report.ai?.model,
        aiInsightCount: report.insights.filter((insight) => insight.source === 'ai').length,
      },
      ...(report.ai?.status === 'generated'
        ? { ai: this.audit.aiProvenance('report', { model: report.ai.model, advisory: true }) }
        : {}),
    }).catch((error) => {
      // An export remains useful when a non-critical audit append is briefly
      // unavailable, but the failure is visible in service logs and readiness.
      this.logger.error(`Could not record report export: ${String(error)}`);
    });

    return files[normalized];
  }

  private toAgreementRow(
    contract: Contract,
    obligations: ReportObligationRow[],
    signatures: ReportSignatureRow[],
    maySeeSignatures: boolean,
  ): ReportAgreementRow {
    const related = obligations.filter((row) => row.contractId === contract.id);
    const signature = signatures.find((row) => row.contractId === contract.id);
    return {
      id: contract.id,
      title: contract.title,
      counterparty: contract.counterparty,
      type: contract.type,
      valueDisplay: contract.valueDisplay,
      stage: STAGE_LABELS[contract.stage] ?? contract.stage,
      risk: contract.risk,
      version: contract.version,
      source: contract.source,
      obligationCount: related.length,
      nextDueDate: related[0]?.dueDate,
      signatureStatus: maySeeSignatures ? signature?.status : undefined,
    };
  }

  private toObligationRow(row: Obligation): ReportObligationRow {
    return {
      id: row.id,
      contractId: row.contractId,
      contractTitle: row.contractTitle,
      title: row.title,
      dueDate: row.dueDate,
      status: row.status,
      type: row.type,
      risk: row.risk,
      ownerEmail: row.ownerEmail,
    };
  }

  private toSignatureRow(row: SignatureRequest): ReportSignatureRow {
    return {
      id: row.id,
      contractId: row.contractId,
      contractTitle: row.contractTitle,
      status: row.status,
      provider: row.provider,
      signatoryCount: row.signatories.length,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
    };
  }

  private buildInsights(input: {
    contracts: Contract[];
    risk: { low: number; medium: number; high: number };
    legalReview: number;
    overdue: ReportObligationRow[];
    next30: ReportObligationRow[];
    dueSoon: ReportObligationRow[];
    pendingSignatures: number;
    maySeeSignatures: boolean;
  }): PortfolioReport['insights'] {
    const out: PortfolioReport['insights'] = [];
    if (!input.contracts.length) {
      return [{
        id: 'empty',
        title: 'No agreements in scope',
        body: 'The current portfolio has no persisted agreement records to analyse.',
        tone: 'info',
      }];
    }
    if (input.risk.high) {
      out.push({
        id: 'high-risk',
        title: `${input.risk.high} high-risk agreement${input.risk.high === 1 ? '' : 's'}`,
        body: 'These agreements should receive senior-counsel attention before approval or signature.',
        tone: 'risk',
      });
    }
    if (input.legalReview) {
      out.push({
        id: 'legal-review',
        title: `${input.legalReview} agreement${input.legalReview === 1 ? '' : 's'} in legal review`,
        body: 'Review and approval stages are the current work queue for legal operations.',
        tone: 'watch',
      });
    }
    if (input.overdue.length) {
      out.push({
        id: 'overdue',
        title: `${input.overdue.length} overdue obligation${input.overdue.length === 1 ? '' : 's'}`,
        body: `The earliest due date is ${input.overdue[0].dueDate}. Confirm renewal, remediation or closure.`,
        tone: 'risk',
      });
    } else if (input.next30.length) {
      out.push({
        id: 'next-30',
        title: `${input.next30.length} key date${input.next30.length === 1 ? '' : 's'} in the next 30 days`,
        body: 'Use the obligations register to assign an owner and keep the next decision visible.',
        tone: 'watch',
      });
    }
    if (input.maySeeSignatures && input.pendingSignatures) {
      out.push({
        id: 'signatures',
        title: `${input.pendingSignatures} signature request${input.pendingSignatures === 1 ? '' : 's'} still open`,
        body: 'Pending envelopes remain part of the execution queue until every required signatory completes.',
        tone: 'watch',
      });
    }
    if (!out.length) {
      out.push({
        id: 'steady',
        title: 'No material exceptions detected',
        body: `${input.contracts.length} agreement${input.contracts.length === 1 ? ' is' : 's are'} in scope and the current obligation horizon is clear.`,
        tone: 'info',
      });
    }
    return out.slice(0, 6);
  }
}
