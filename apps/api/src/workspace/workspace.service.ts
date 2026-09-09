import { Injectable, Logger } from '@nestjs/common';
import {
  AttentionItem,
  Contract,
  DashboardInsight,
  DashboardStat,
  DashboardSummary,
  NavCounts,
  NotificationRecord,
  Obligation,
  PipelineBoard,
  PipelineCard,
  PipelineLane,
  PipelineStageCount,
  RiskDistribution,
  SearchHit,
  SearchKind,
  SearchResult,
  TEMPLATES,
  CLAUSES,
  can,
} from '@concord/shared';
import type { Permission, Role } from '@concord/shared';
import { PrismaService } from '../persistence/prisma.service';
import { ContractsService } from '../contracts/contracts.service';
import { ObligationsService } from '../obligations/obligations.service';
import { ESignService } from '../esign/esign.service';
import { IntakeService } from '../intake/intake.service';
import { AuditService } from '../audit/audit.service';

/** Audit actions that represent a notification Concord sent. */
const NOTIFYING_ACTIONS = [
  'approval.requested',
  'approval.route_failed',
  'esign.sent',
  'esign.executed',
  'obligation.',
  'digest.',
];

const NOTIFICATION_LABEL: Record<string, string> = {
  'approval.requested': 'Approval request sent to the routed approvers',
  'approval.route_failed': 'Approval request could NOT be delivered',
  'esign.sent': 'Signature request dispatched to the signatories',
  'esign.executed': 'Executed copy sealed and filed to the archive',
};

/**
 * A description built from the action and the entity id, never from the audit
 * event's own summary text (which embeds envelope ids and counterparty names).
 */
function describeNotification(action: string, entityId?: string): string {
  const base =
    NOTIFICATION_LABEL[action] ??
    (action.startsWith('obligation.')
      ? 'Obligation reminder sent'
      : action.startsWith('digest.')
        ? 'Obligations digest sent'
        : 'Notification sent');
  return entityId ? `${base} · ${entityId}` : base;
}

const STAGES: Array<{ stage: string; label: string; tone: PipelineLane['tone'] }> = [
  { stage: 'intake', label: 'Intake', tone: 'neutral' },
  { stage: 'drafting', label: 'Drafting', tone: 'info' },
  { stage: 'review', label: 'Review', tone: 'med' },
  { stage: 'approval', label: 'Approval', tone: 'med' },
  { stage: 'signature', label: 'Signature', tone: 'low' },
  { stage: 'active', label: 'Active', tone: 'low' },
  { stage: 'renewal', label: 'Renewal', tone: 'high' },
];

/**
 * Read-only aggregates behind the Command Center, the lifecycle board, global
 * search and the notification history.
 *
 * Two rules shape everything here:
 *
 *  1. **Nothing is invented.** Every figure is computed from a live store. When
 *     a store is empty the number is zero and `sampleData` says whether demo
 *     fixtures contributed — the dashboard must never present a plausible
 *     fiction as the state of the portfolio.
 *  2. **Search obeys the permission matrix.** Results are filtered by what the
 *     caller may actually read, and the kinds withheld are reported rather than
 *     silently dropped. A viewer's search must not surface an envelope id they
 *     are forbidden to fetch — that was step one of a real forgery chain.
 */
@Injectable()
export class WorkspaceService {
  private readonly logger = new Logger(WorkspaceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contracts: ContractsService,
    private readonly obligations: ObligationsService,
    private readonly esign: ESignService,
    private readonly intake: IntakeService,
    private readonly audit: AuditService,
  ) {}

  /** True when contract/template fixtures are standing in for a real portfolio. */
  private get usingFixtures(): boolean {
    return !this.prisma.enabled || process.env.DEMO_SAMPLES === 'true';
  }

  private safe<T>(p: Promise<T>, fallback: T, what: string): Promise<T> {
    return p.catch((e) => {
      this.logger.error(`${what} failed: ${String(e)}`);
      return fallback;
    });
  }

  // ─── Command Center ────────────────────────────────────────────────────────

  async dashboard(role: Role, greetingName?: string): Promise<DashboardSummary> {
    // E-signature volume is gated on the same permission as GET /api/esign.
    // Publishing it on an un-gated landing page would tell a read-only viewer
    // exactly how many executions are in flight.
    const maySeeEsign = can(role, 'esign:send');
    const [obligations, signatures, documents] = await Promise.all([
      this.safe(this.obligations.list(), [] as Obligation[], 'obligations'),
      maySeeEsign ? this.safe(this.esign.list(), [], 'signature requests') : Promise.resolve([]),
      this.safe(this.countDocuments(), 0, 'document count'),
    ]);

    const contracts = await this.contracts.listFresh();
    const risk = this.riskOf(contracts);
    const pipeline = this.stageCounts(contracts);

    const now = Date.now();
    const soon = obligations.filter((o) => {
      const d = new Date(o.dueDate).getTime();
      return Number.isFinite(d) && d - now <= 90 * 86_400_000;
    });
    const atRisk = obligations.filter((o) => o.status === 'at-risk');
    const outForSignature = signatures.filter((s) =>
      ['sent', 'viewed', 'partially-signed'].includes(s.status),
    ).length;

    const stats: DashboardStat[] = [
      {
        key: 'contracts',
        label: 'Contracts in the portfolio',
        value: String(contracts.length),
        trend: documents
          ? { direction: 'up', label: `${documents} ingested` }
          : undefined,
      },
      {
        key: 'obligations',
        label: 'Key dates in 90 days',
        value: String(soon.length),
        trend: atRisk.length
          ? { direction: 'down', label: `${atRisk.length} at risk` }
          : { direction: 'flat', label: 'none overdue' },
      },
      ...(maySeeEsign
        ? [
            {
              key: 'signature',
              label: 'Out for signature',
              value: String(outForSignature),
              trend: { direction: 'flat' as const, label: `${signatures.length} total` },
            },
          ]
        : []),
      {
        key: 'risk',
        label: 'High-risk contracts',
        value: String(risk.high),
        trend: risk.high
          ? { direction: 'down', label: 'need counsel' }
          : { direction: 'up', label: 'none flagged' },
      },
    ];

    const attention: AttentionItem[] = contracts
      .filter((c) => c.risk !== 'low' || c.stage === 'approval' || c.stage === 'review')
      .slice(0, 6)
      .map((c) => ({
        id: c.id,
        title: c.title,
        counterparty: c.counterparty,
        valueDisplay: c.valueDisplay,
        stage: c.stage,
        risk: c.risk,
        keyDate: this.keyDateFor(c.id, obligations),
        href: `/review/${c.id}`,
      }));

    return {
      greetingName,
      stats,
      pipeline,
      risk,
      attention,
      renewals: soon
        .slice()
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .slice(0, 5),
      insights: this.insights(obligations, maySeeEsign ? signatures.length : 0, risk),
      sampleData: this.usingFixtures,
      generatedAt: new Date().toISOString(),
    };
  }

  private keyDateFor(contractId: string, obligations: Obligation[]): string {
    const match = obligations
      .filter((o) => o.contractId === contractId)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    return match ? match.dueDate : '—';
  }

  private riskOf(contracts: Contract[]): RiskDistribution {
    return {
      low: contracts.filter((c) => c.risk === 'low').length,
      medium: contracts.filter((c) => c.risk === 'medium').length,
      high: contracts.filter((c) => c.risk === 'high').length,
    };
  }

  private stageCounts(contracts: Contract[]): PipelineStageCount[] {
    return STAGES.map((s) => ({
      stage: s.stage,
      label: s.label,
      count: contracts.filter((c) => c.stage === s.stage).length,
    }));
  }

  /**
   * Observations derived from the data on screen. Deliberately deterministic —
   * no model call — so nothing on the landing page can hallucinate a commitment
   * the portfolio does not contain.
   */
  private insights(
    obligations: Obligation[],
    signatureCount: number,
    risk: RiskDistribution,
  ): DashboardInsight[] {
    const out: DashboardInsight[] = [];
    const now = Date.now();
    const overdue = obligations.filter((o) => new Date(o.dueDate).getTime() < now);
    const next30 = obligations.filter((o) => {
      const d = new Date(o.dueDate).getTime();
      return d >= now && d - now <= 30 * 86_400_000;
    });

    if (overdue.length) {
      out.push({
        id: 'overdue',
        body: `${overdue.length} obligation${overdue.length === 1 ? ' is' : 's are'} past ${overdue.length === 1 ? 'its' : 'their'} due date — the earliest is “${overdue[0].title}” on ${overdue[0].contractTitle}.`,
        at: new Date().toISOString(),
        tone: 'risk',
      });
    }
    if (next30.length) {
      out.push({
        id: 'next30',
        body: `${next30.length} key date${next30.length === 1 ? ' falls' : 's fall'} in the next 30 days. The daily digest covers ${next30.length === 1 ? 'it' : 'them'} if it is enabled.`,
        at: new Date().toISOString(),
        tone: 'warn',
      });
    }
    if (risk.high) {
      out.push({
        id: 'risk',
        body: `${risk.high} contract${risk.high === 1 ? ' carries' : 's carry'} a high playbook risk score and ${risk.high === 1 ? 'is' : 'are'} recommended for senior-counsel sign-off.`,
        at: new Date().toISOString(),
        tone: 'warn',
      });
    }
    if (signatureCount) {
      out.push({
        id: 'esign',
        body: `${signatureCount} signature request${signatureCount === 1 ? '' : 's'} on record. Completed envelopes are sealed with a SHA-256 checksum and filed to the archive automatically.`,
        at: new Date().toISOString(),
        tone: 'info',
      });
    }
    if (!out.length) {
      out.push({
        id: 'quiet',
        body: 'Nothing needs attention right now — no overdue obligations and no high-risk contracts outstanding.',
        at: new Date().toISOString(),
        tone: 'info',
      });
    }
    return out;
  }

  private navCache: { at: number; role: Role; counts: NavCounts } | null = null;
  private get navCacheTtlMs(): number {
    return Number(process.env.NAV_COUNTS_CACHE_MS || 15_000);
  }

  private async countDocuments(): Promise<number> {
    if (!this.prisma.enabled || !this.prisma.client?.document) return 0;
    return this.prisma.client.document.count();
  }

  // ─── Lifecycle pipeline board ──────────────────────────────────────────────

  async board(): Promise<PipelineBoard> {
    const contracts = await this.contracts.listFresh();
    const lanes: PipelineLane[] = STAGES.map((s) => ({
      stage: s.stage,
      label: s.label,
      tone: s.tone,
      cards: contracts
        .filter((c) => c.stage === s.stage)
        .map(
          (c): PipelineCard => ({
            id: c.id,
            title: c.title,
            counterparty: c.counterparty,
            valueDisplay: c.valueDisplay,
            risk: c.risk,
            stage: c.stage,
            versionLabel: c.version ? `v${String(c.version).replace(/^v/, '')}` : undefined,
            href: `/review/${c.id}`,
          }),
        ),
    }));
    return { lanes, total: contracts.length, sampleData: this.usingFixtures };
  }

  // ─── Global search ─────────────────────────────────────────────────────────

  /**
   * Cross-entity search, filtered by what the caller may read. `restricted`
   * names the kinds that were withheld, so the UI can say so rather than
   * implying the portfolio is empty.
   */
  async search(query: string, role: Role, limit = 20): Promise<SearchResult> {
    const q = (query ?? '').trim().toLowerCase();
    if (q.length < 2) return { query, count: 0, hits: [], restricted: [] };

    const hits: SearchHit[] = [];
    const restricted: SearchKind[] = [];
    const match = (...fields: Array<string | undefined>) =>
      fields.some((f) => (f ?? '').toLowerCase().includes(q));

    /**
     * Each kind is gated on the permission that guards that entity's OWN route.
     * If the two ever diverge, search becomes a way around the matrix — so the
     * mapping is stated once, here, and asserted in `workspace.spec.ts`.
     *
     * contract / template / clause / obligation → contract:read
     *   (`@Roles('contract:read')` on this controller already requires it, so
     *    these can never be withheld; they are not reported as restricted.)
     * intake     → contract:read  (GET /api/intake carries no stricter role)
     * signature  → esign:send     (matches @Roles on GET /api/esign)
     */
    const gate = (kind: SearchKind, perm: Permission): boolean => {
      if (can(role, perm)) return true;
      if (!restricted.includes(kind)) restricted.push(kind);
      return false;
    };

    if (gate('contract', 'contract:read')) {
      for (const c of await this.contracts.listFresh()) {
        if (match(c.title, c.counterparty, c.id, c.type, c.stage)) {
          hits.push({
            kind: 'contract',
            id: c.id,
            title: c.title,
            subtitle: `${c.counterparty} · ${c.type} · ${c.valueDisplay}`,
            href: `/review/${c.id}`,
            badge: c.risk,
            badgeTone: c.risk === 'medium' ? 'med' : (c.risk as 'low' | 'high'),
          });
        }
      }
    }

    if (gate('template', 'contract:read')) {
      for (const t of TEMPLATES) {
        if (match(t.name, t.contractType, t.id, t.description)) {
          hits.push({
            kind: 'template',
            id: t.id,
            title: t.name,
            subtitle: `${t.contractType} · ${t.clauseIds.length} clause(s)`,
            href: '/templates',
            badge: 'template',
            badgeTone: 'neutral',
          });
        }
      }
      // Clauses ride the same gate as templates (both are `contract:read`).
      for (const c of CLAUSES) {
        if (match(c.title, c.category, c.id)) {
          hits.push({
            kind: 'clause',
            id: c.id,
            title: c.title,
            subtitle: `${c.category}${c.playbookStandard ? ' · playbook standard' : ' · non-standard'}`,
            href: '/authoring',
            badge: c.playbookStandard ? 'standard' : 'non-standard',
            badgeTone: c.playbookStandard ? 'low' : 'med',
          });
        }
      }
    }

    if (gate('intake', 'contract:read')) {
      const rows = await this.safe(this.intake.list(), [], 'intake search');
      for (const r of rows) {
        if (match(r.title, r.counterparty, r.id, r.businessUnit, r.requestor)) {
          hits.push({
            kind: 'intake',
            id: r.id,
            title: r.title,
            subtitle: `${r.counterparty} · ${r.businessUnit} · ${r.status}`,
            href: '/intake',
            badge: r.status,
            badgeTone: 'info',
          });
        }
      }
    }

    // Signature requests carry provider envelope ids — gated on esign:send, the
    // same permission the e-sign listing itself requires.
    if (gate('signature', 'esign:send')) {
      const rows = await this.safe(this.esign.list(), [], 'signature search');
      for (const r of rows) {
        if (match(r.contractTitle, r.contractId, r.id, ...r.signatories.map((s) => s.name))) {
          hits.push({
            kind: 'signature',
            id: r.id,
            title: r.contractTitle,
            subtitle: `${r.id} · ${r.signatories.length} signatory(ies) · ${r.status}`,
            href: '/esign',
            badge: r.status,
            badgeTone: r.status === 'completed' ? 'low' : 'info',
          });
        }
      }
    }

    if (gate('obligation', 'contract:read')) {
      const rows = await this.safe(this.obligations.list(), [], 'obligation search');
      for (const o of rows) {
        if (match(o.title, o.contractTitle, o.id, o.ownerEmail)) {
          hits.push({
            kind: 'obligation',
            id: o.id,
            title: o.title,
            subtitle: `${o.contractTitle} · due ${o.dueDate}`,
            href: '/obligations',
            badge: o.status,
            badgeTone: o.status === 'at-risk' ? 'high' : o.status === 'due-soon' ? 'med' : 'low',
          });
        }
      }
    }

    const unique = [...new Set(restricted)];
    return { query, count: hits.length, hits: hits.slice(0, limit), restricted: unique };
  }

  // ─── Notification history ──────────────────────────────────────────────────

  /**
   * What Concord actually sent through Outlook, read from the audit trail
   * rather than a second log that could disagree with it.
   */
  async notifications(limit = 50): Promise<NotificationRecord[]> {
    const take = Math.min(Math.max(limit, 1), 200);
    // Filter in the DATABASE. Taking "the newest N events of any kind" and
    // filtering afterwards means the page goes permanently empty once N
    // non-notifying events (every request writes one) accumulate after the most
    // recent notification — days, not months, on a real deployment.
    const events = await this.safe(
      this.audit.list({ actions: NOTIFYING_ACTIONS, limit: take }),
      [],
      'notification history',
    );

    return events.map((e) => {
      const md = (e.metadata ?? {}) as Record<string, unknown>;
      const recipients = Array.isArray(md.routedTo) ? (md.routedTo as string[]).map(String) : [];
      const raw = typeof md.delivery === 'string' ? md.delivery : '';
      const status: NotificationRecord['status'] =
        e.action === 'approval.route_failed'
          ? 'failed'
          : raw === 'sent' || raw === 'dry-run' || raw === 'failed'
            ? raw
            : 'unknown';
      return {
        id: e.id,
        at: e.at,
        kind: e.action,
        // Rebuilt from the action and the entity, NOT the raw audit summary.
        // Audit summaries embed provider envelope ids and counterparty names;
        // echoing them here turned this page into a second read path for data
        // the audit endpoint itself gates.
        summary: describeNotification(e.action, e.entityId),
        recipients,
        status,
        entity: e.entity,
        entityId: e.entityId,
      };
    });
  }

  // ─── Sidebar badge counts ──────────────────────────────────────────────────

  async navCounts(role: Role): Promise<NavCounts> {
    const contracts = await this.contracts.listFresh();
    // `obligations.list()` pages the whole Document table. The sidebar asks for
    // these counts on every navigation, so it is served from a short-lived cache
    // rather than re-running that scan a dozen times while someone clicks
    // through the app.
    const now = Date.now();
    if (this.navCache && now - this.navCache.at < this.navCacheTtlMs && this.navCache.role === role) {
      return this.navCache.counts;
    }

    const [obligations, signatures, intake] = await Promise.all([
      this.safe(this.obligations.list(), [] as Obligation[], 'nav obligations'),
      can(role, 'esign:send') ? this.safe(this.esign.list(), [], 'nav signatures') : Promise.resolve([]),
      // GET /api/intake has no stricter role, so the badge matches the page.
      this.safe(this.intake.list(), [], 'nav intake'),
    ]);
    const counts: NavCounts = {
      intake: intake.length,
      pipeline: contracts.filter((c) => c.stage !== 'active').length,
      review: contracts.filter((c) => c.risk === 'high').length,
      obligations: obligations.filter((o) => {
        const d = new Date(o.dueDate).getTime();
        return Number.isFinite(d) && d - now <= 90 * 86_400_000;
      }).length,
      esign: signatures.filter((s) => ['sent', 'viewed', 'partially-signed'].includes(s.status)).length,
      // Unread-notification tracking does not exist yet; reporting a number here
      // would light a topbar dot that means nothing.
      notifications: 0,
    };
    this.navCache = { at: now, role, counts };
    return counts;
  }
}
