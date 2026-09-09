import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  DigestResult,
  NotificationResult,
  OBLIGATIONS,
  Obligation,
  SignatureRequest,
} from '@concord/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../persistence/prisma.service';
import { ESignService } from '../esign/esign.service';
import { AuditService } from '../audit/audit.service';
import { obligationEmailHtml, obligationsDigestHtml } from '../notifications/templates';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Key dates and obligations, and the Outlook digest built from them.
 *
 * ## Where the rows come from (finding C-D21)
 *
 * These were previously read from static arrays in `@concord/shared` — including
 * the signature rows, which came from the sample fixtures rather than the real
 * e-signature store. The daily digest to the legal mailbox was therefore a list
 * of fictional obligations, and `remind` 404'd on every signature-derived row
 * because `getById` only searched the static array.
 *
 * Now every row is derived from a live store:
 *   - pending signatures      → `ESignService.list()` (Postgres, or memory when
 *                               no database is configured)
 *   - renewals and expiries   → the `Document` table's extracted expiry dates
 *   - sample obligations      → only when demo fixtures are explicitly on
 *
 * and `getById` resolves against exactly the same composition, so anything the
 * calendar or the digest shows can also be reminded on.
 */
@Injectable()
export class ObligationsService {
  private readonly logger = new Logger(ObligationsService.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
    private readonly esign: ESignService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Records an outbound notification in the immutable trail.
   *
   * Reminders and the weekly digest were the ONLY outbound email in Concord
   * that wrote nothing to the audit trail: `auth`, `workflow` and `esign` all
   * recorded theirs. `WorkspaceService.NOTIFYING_ACTIONS` already listed
   * `obligation.` and `digest.`, so the notification history had two branches
   * that could never match a row — the page told a lead "no notifications
   * recorded" on the same day the digest emailed seven obligations to the legal
   * mailbox. For a system whose footer reads "every state change is recorded in
   * the immutable audit trail", an unlogged outbound email is the gap that
   * matters most: it is the one a regulator asks to see.
   *
   * Failure to record must not fail the send — the email has already gone out,
   * and throwing here would report a failure for a delivery that succeeded — so
   * it is logged loudly and swallowed, exactly as the workflow service does.
   */
  private async recordNotification(input: {
    action: string;
    entityId?: string;
    summary: string;
    recipients: string[];
    result: NotificationResult;
    extra?: Record<string, unknown>;
  }): Promise<void> {
    await this.audit
      .record({
        actor: { email: 'system@concord' },
        action: input.action,
        entity: 'obligation',
        entityId: input.entityId,
        summary: input.summary,
        metadata: {
          routedTo: input.recipients,
          delivery: input.result.status,
          ...(input.extra ?? {}),
        },
      })
      .catch((e) =>
        this.logger.error(
          `Outbound ${input.action} was SENT but could not be recorded in the audit trail: ${String(e)}`,
        ),
      );
  }

  /**
   * Sample obligations are demo fixtures. They are shown when there is no
   * database (the offline demo) or when DEMO_SAMPLES is explicitly set — never
   * silently mixed into a real portfolio, and never emailed to the legal team as
   * if they were real commitments.
   */
  private get includeSamples(): boolean {
    return process.env.DEMO_SAMPLES === 'true' || !this.prisma.enabled;
  }

  async list(): Promise<Obligation[]> {
    if (this.cache && Date.now() - this.cache.at < this.cacheTtlMs) return this.cache.rows;
    const [signatures, documents] = await Promise.all([
      this.signatureObligations(),
      this.documentObligations(),
    ]);
    const samples = this.includeSamples ? OBLIGATIONS : [];
    const rows = [...samples, ...documents, ...signatures].sort((a, b) =>
      a.dueDate.localeCompare(b.dueDate),
    );
    this.cache = { at: Date.now(), rows };
    return rows;
  }

  private initials(name = ''): string {
    return (
      name
        .split(/\s+/)
        .map((w) => w[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase() || '—'
    );
  }

  /**
   * Pending e-signatures surface as obligations (a "sign-by" key date), so they
   * ride the same calendar and digest as renewals — and the e-sign module's
   * auto-nudge chases whoever is late. Read from the live signature store.
   */
  private async signatureObligations(): Promise<Obligation[]> {
    const afterDays = Number(process.env.MELENTO_NUDGE_AFTER_DAYS || 3);
    let requests: SignatureRequest[] = [];
    try {
      requests = await this.esign.list();
    } catch (e) {
      this.logger.error(`Could not read signature requests for obligations: ${String(e)}`);
      return [];
    }
    return requests
      .filter((r) => ['sent', 'viewed', 'partially-signed'].includes(r.status))
      .map((r) => {
        const pending = r.signatories.find((s) => s.status !== 'signed') ?? r.signatories[0];
        const base = r.sentAt ? new Date(r.sentAt) : new Date(r.createdAt);
        const due = new Date(base.getTime() + afterDays * DAY_MS);
        const overdue = due.getTime() < Date.now();
        return {
          id: `OBL-${r.id}`,
          title: `Signature due — ${pending?.role ?? 'counterparty'}`,
          contractId: r.contractId,
          contractTitle: r.contractTitle,
          ownerEmail: pending?.email ?? r.signatories[0]?.email ?? '',
          ownerInitials: this.initials(pending?.name),
          dueDate: due.toISOString().slice(0, 10),
          status: overdue ? 'at-risk' : 'due-soon',
          type: 'signature',
          risk: overdue ? 'high' : 'medium',
          outlookScheduled: true,
        } as Obligation;
      });
  }

  /**
   * Renewal / expiry obligations derived from what ingestion actually extracted
   * from the uploaded agreements. No database means no ingested documents, so
   * this contributes nothing rather than inventing rows.
   */
  private async documentObligations(): Promise<Obligation[]> {
    if (!this.prisma.enabled || !this.prisma.client?.document) return [];
    try {
      // Page through ALL documents rather than taking the 500 most recent.
      // Truncating by recency silently drops the renewal dates of everything
      // ingested earlier — they vanish from the calendar, from the digest, and
      // `remind` 404s on them. Swapping a fictional list for a truncated real
      // one is not a fix. Only the three columns needed are selected, so this
      // does not drag the extraction/validation JSON blobs across for every row.
      const rows = await this.scanDocuments();
      const owner = process.env.OBLIGATIONS_DEFAULT_OWNER || 'legal@lakmelever.com';
      const out: Obligation[] = [];
      for (const r of rows) {
        const expiry = (r.extraction as any)?.expiryDate;
        if (!expiry) continue;
        const due = new Date(expiry);
        if (Number.isNaN(due.getTime())) continue;
        const daysOut = Math.round((due.getTime() - Date.now()) / DAY_MS);
        out.push({
          id: `OBL-DOC-${r.id}`,
          title: daysOut < 0 ? 'Expired — confirm renewal or exit' : 'Renewal / expiry decision due',
          contractId: r.id,
          contractTitle: r.filename,
          ownerEmail: owner,
          ownerInitials: this.initials(owner.split('@')[0].replace(/[._]/g, ' ')),
          dueDate: due.toISOString().slice(0, 10),
          status: daysOut < 0 ? 'at-risk' : daysOut <= 60 ? 'due-soon' : 'on-track',
          type: 'renewal',
          risk: daysOut < 0 ? 'high' : daysOut <= 60 ? 'medium' : 'low',
          outlookScheduled: true,
        });
      }
      return out;
    } catch (e) {
      this.logger.error(`Could not derive obligations from documents: ${String(e)}`);
      return [];
    }
  }

  /**
   * Every document, a page at a time, selecting only what an obligation needs.
   * `OBLIGATIONS_DOC_SCAN_MAX` is a safety valve, not a silent truncation: when
   * it is hit the shortfall is logged rather than quietly dropped.
   */
  private async scanDocuments(): Promise<Array<{ id: string; filename: string; extraction: any }>> {
    const page = Math.max(1, Number(process.env.OBLIGATIONS_DOC_SCAN_LIMIT || 500));
    const hardMax = Number(process.env.OBLIGATIONS_DOC_SCAN_MAX || 100_000);
    const out: Array<{ id: string; filename: string; extraction: any }> = [];
    let cursor: string | undefined;
    for (;;) {
      const batch = await this.prisma.client.document.findMany({
        select: { id: true, filename: true, extraction: true },
        orderBy: { id: 'asc' },
        take: page,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (!batch.length) break;
      out.push(...batch);
      cursor = batch[batch.length - 1].id;
      if (batch.length < page) break;
      if (out.length >= hardMax) {
        this.logger.error(
          `Document scan hit OBLIGATIONS_DOC_SCAN_MAX (${hardMax}); renewal dates beyond ` +
            'that point are NOT in the calendar or the digest. Raise the limit or move ' +
            'obligation derivation to a materialised table.',
        );
        break;
      }
    }
    return out;
  }

  async upcoming(days = 90): Promise<Obligation[]> {
    const horizon = Date.now() + days * DAY_MS;
    return (await this.list()).filter((o) => new Date(o.dueDate).getTime() <= horizon);
  }

  /**
   * Resolves against the SAME composition `list()` returns. Previously this only
   * searched the static array, so every signature-derived row 404'd the moment a
   * user clicked "remind" on it.
   */
  async getById(id: string): Promise<Obligation> {
    const o = (await this.list()).find((x) => x.id === id);
    if (!o) throw new NotFoundException(`Obligation ${id} not found`);
    return o;
  }

  /**
   * `list()` reads the signature store and scans documents, so calling it from
   * several helpers in one request multiplies that work. This caches the
   * composition for a short window — long enough to cover a single request,
   * short enough that the calendar is never stale to a person watching it.
   */
  private cache: { at: number; rows: Obligation[] } | null = null;
  private get cacheTtlMs(): number {
    return Number(process.env.OBLIGATIONS_CACHE_MS || 2_000);
  }

  /** Fires an Outlook reminder for a single obligation via Microsoft Graph. */
  async remind(id: string, to?: string[]): Promise<NotificationResult> {
    const o = await this.getById(id);
    const recipients = (to && to.length ? to : [o.ownerEmail]).filter(Boolean);
    if (!recipients.length) {
      throw new NotFoundException(`Obligation ${id} has no owner to remind.`);
    }
    const subject = `⏰ Reminder: ${o.title} — ${o.contractTitle} (due ${o.dueDate})`;
    const result = await this.notifications.sendEmail({
      to: recipients,
      subject,
      html: obligationEmailHtml(o),
    });
    await this.recordNotification({
      action: 'obligation.reminded',
      entityId: o.id,
      summary: `Reminder for "${o.title}" on ${o.contractTitle} (due ${o.dueDate})`,
      recipients,
      result,
      extra: { contractId: o.contractId, dueDate: o.dueDate },
    });
    return result;
  }

  // ─── Scheduled digest ───────────────────────────────────────────────────────

  private digestRecipients(): string[] {
    const raw = process.env.OBLIGATIONS_DIGEST_RECIPIENTS || 'legal@lakmelever.com';
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }

  /** Composes the digest (without sending) — used by the preview endpoint. */
  async buildDigest(days = 90): Promise<DigestResult> {
    const items = await this.upcoming(days);
    const subject = `📅 Concord digest — ${items.length} obligation${
      items.length === 1 ? '' : 's'
    } due in the next ${days} days`;
    return {
      windowDays: days,
      count: items.length,
      subject,
      html: obligationsDigestHtml(items, days),
    };
  }

  /** Builds and sends the digest as ONE Outlook email (dry-run without Graph). */
  async sendDigest(days = 90, to?: string[]): Promise<DigestResult> {
    const digest = await this.buildDigest(days);
    const recipients = to && to.length ? to : this.digestRecipients();
    const notification = await this.notifications.sendEmail({
      to: recipients,
      subject: digest.subject,
      html: digest.html!,
    });
    this.logger.log(
      `Obligations digest → ${recipients.join(', ')} (${digest.count} items, ${notification.status})`,
    );
    await this.recordNotification({
      action: 'digest.sent',
      summary: `Obligations digest — ${digest.count} item(s) due in the next ${days} days`,
      recipients,
      result: notification,
      extra: { windowDays: days, itemCount: digest.count },
    });
    return { ...digest, notification };
  }

  /**
   * Claims a scheduled run so only ONE API replica sends each digest: an
   * INSERT … ON CONFLICT on a per-run key is atomic across replicas. The
   * `digest_run` table is now created by a versioned migration rather than at
   * runtime (finding C-D33). Without Postgres there is a single instance, so
   * there is nothing to coordinate.
   *
   * Fails CLOSED: if the claim cannot be evaluated, skip rather than send. Every
   * replica sending "just in case" means N copies of the same digest to the
   * legal mailbox, and a missed digest is visible the next morning.
   */
  private async claimScheduledRun(runKey: string): Promise<boolean> {
    if (!this.prisma.enabled || !this.prisma.client) return true; // single instance
    try {
      const affected: number = await this.prisma.client.$executeRawUnsafe(
        `INSERT INTO digest_run (run_key) VALUES ($1) ON CONFLICT (run_key) DO NOTHING`,
        runKey,
      );
      return affected === 1;
    } catch (e) {
      this.logger.error(`Digest run-claim failed (${String(e)}) — skipping this run`);
      return false;
    }
  }

  /**
   * Scheduled sweep. Runs on OBLIGATIONS_DIGEST_CRON (default daily 08:00 IST)
   * but only sends when OBLIGATIONS_DIGEST_ENABLED=true, so it stays dormant in
   * dev. The manual POST /api/obligations/digest/run bypasses the claim — it is
   * an explicit, on-demand action.
   */
  @Cron(process.env.OBLIGATIONS_DIGEST_CRON || '0 8 * * *', {
    name: 'obligations-digest',
    timeZone: process.env.SCHEDULE_TZ || 'Asia/Kolkata',
  })
  async scheduledDigest(): Promise<void> {
    if (process.env.OBLIGATIONS_DIGEST_ENABLED !== 'true') return;
    const days = Number(process.env.OBLIGATIONS_DIGEST_WINDOW_DAYS || 90);
    const runKey = `digest:${new Date().toISOString().slice(0, 13)}:${days}`; // hour-grained
    if (!(await this.claimScheduledRun(runKey))) {
      this.logger.log(`Digest ${runKey} already claimed by another replica — skipping`);
      return;
    }
    this.logger.log(`Running scheduled obligations digest (window ${days}d)`);
    await this.sendDigest(days);
  }
}
