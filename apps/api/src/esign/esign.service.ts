import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { isProduction } from '../security/security.config';
import { Cron } from '@nestjs/schedule';
import {
  ArchivedDocument,
  CreateSignatureInput,
  SignatureEvent,
  SignatureRequest,
  SignatureStatus,
  SIGNATURE_REQUESTS,
} from '@concord/shared';
import { randomUUID, createHash } from 'crypto';
import { MelentoService } from './melento.service';
import { AuditService } from '../audit/audit.service';
import { JobsService } from '../jobs/jobs.service';
import { NotificationsService, wasDelivered } from '../notifications/notifications.service';
import {
  signatureRequestHtml,
  signatureNudgeHtml,
  executionCertificateHtml,
} from '../notifications/templates';
import { PrismaService } from '../persistence/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ContractsService } from '../contracts/contracts.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const PENDING: SignatureStatus[] = ['sent', 'viewed', 'partially-signed'];

/**
 * Orchestrates the e-signature lifecycle stage: procure the e-stamp, dispatch
 * the signing envelope through Melento, notify signatories via Outlook, and
 * track status to completion. Persists to Postgres when available, else an
 * in-memory store seeded with sample requests.
 */
@Injectable()
export class ESignService implements OnModuleInit {
  private readonly logger = new Logger(ESignService.name);
  private mem: SignatureRequest[] = [];
  private archiveMem: ArchivedDocument[] = [];

  constructor(
    private readonly melento: MelentoService,
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly jobs: JobsService,
    private readonly contracts: ContractsService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Sample signature requests are demo fixtures. Never seed them when a real
    // database is configured, and never archive them — doing so wrote genuine
    // ArchivedDocument rows, uploaded certificates and audit events for
    // fictional agreements (and leaked a new file on every restart).
    const demo = process.env.DEMO_SAMPLES === 'true' || !this.prisma.enabled;
    if (!demo) return;
    this.mem = SIGNATURE_REQUESTS.map((r) => JSON.parse(JSON.stringify(r)));
    if (process.env.DEMO_ARCHIVE_SAMPLES === 'true') {
      for (const r of this.mem) {
        if (r.status === 'completed') await this.archive(r).catch(() => undefined);
      }
    }
  }

  private get usePrisma(): boolean {
    return this.prisma.enabled && Boolean(this.prisma.client?.signatureRequest);
  }

  async list(): Promise<SignatureRequest[]> {
    if (this.usePrisma) {
      const rows = await this.prisma.client.signatureRequest.findMany({ orderBy: { createdAt: 'desc' } });
      return rows.map(this.fromRow);
    }
    return [...this.mem].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Targeted lookup by provider envelope id (indexed) — not a full table scan. */
  private async findByEnvelope(envelopeId?: string): Promise<SignatureRequest | null> {
    if (!envelopeId) return null;
    if (this.usePrisma) {
      const row = await this.prisma.client.signatureRequest.findFirst({ where: { envelopeId } });
      return row ? this.fromRow(row) : null;
    }
    return this.mem.find((r) => r.envelopeId === envelopeId) ?? null;
  }

  async get(id: string): Promise<SignatureRequest> {
    const found = this.usePrisma
      ? await this.prisma.client.signatureRequest.findUnique({ where: { id } }).then((r: any) => r && this.fromRow(r))
      : this.mem.find((r) => r.id === id);
    if (!found) throw new NotFoundException(`Signature request ${id} not found`);
    return found;
  }

  private async approvedDocument(contractId: string, contractVersion: string) {
    if (!this.prisma.enabled) throw new ForbiddenException('E-signature requires durable approval persistence');
    const decision = await this.prisma.client.approvalDecision.findUnique({ where: { contractId } });
    if (!decision || decision.decision !== 'approved') {
      throw new ForbiddenException('This contract has not been approved. E-signature is blocked until an authorized approval is recorded.');
    }
    const doc = await this.prisma.client.document.findFirst({
      where: { contractId, status: { not: 'quarantined' }, blobPath: { not: null }, sha256: { not: null } },
      orderBy: { createdAt: 'desc' }, select: { id: true, filename: true, blobPath: true, sha256: true },
    });
    if (!doc?.blobPath || !doc.sha256 || decision.documentId !== doc.id || decision.documentSha256 !== doc.sha256 || decision.contractVersion !== contractVersion) {
      throw new ConflictException('The document/version now queued for signature is not the exact document/version that was approved. Re-run review and approval.');
    }
    return doc;
  }

  /** Procure stamp (if requested) → create envelope → notify → persist. */
  async create(input: CreateSignatureInput): Promise<SignatureRequest> {
    // Never trust the browser to name the legal instrument. Resolve the persisted
    // contract first so an envelope cannot be created for a fabricated ID/title.
    const contract = await this.contracts.getByIdFresh(input.contractId);
    const contractTitle = `${contract.title} — ${contract.counterparty}`;
    const approvedDoc = await this.approvedDocument(contract.id, contract.version);
    const sourceFile = await this.storage.get(approvedDoc.blobPath!);
    const sourceHash = createHash('sha256').update(sourceFile.buffer).digest('hex');
    if (sourceHash !== approvedDoc.sha256) throw new ConflictException('Stored agreement bytes no longer match the approved SHA-256 digest.');
    const now = new Date().toISOString();
    const audit: SignatureEvent[] = [
      { event: 'created', at: now, by: input.signatories?.[0]?.email },
    ];

    const req: SignatureRequest = {
      id: `SIG-${new Date().getFullYear()}-${randomUUID().slice(0, 5).toUpperCase()}`,
      contractId: input.contractId,
      contractTitle,
      signatories: (input.signatories || []).map((s, i) => ({ ...s, order: s.order ?? i + 1, status: 'draft' as SignatureStatus })),
      message: input.message,
      provider: this.melento.provider,
      status: 'draft',
      createdAt: now,
      audit,
      documentId: approvedDoc.id, documentSha256: approvedDoc.sha256, contractVersion: contract.version,
    };

    // Persist the draft BEFORE any external side effect. If Melento accepts a
    // stamp/envelope and the database write then fails, Concord must still have
    // a durable request record to reconcile against the provider.
    await this.persist(req);
    req.version = 0;

    // 1) e-stamp paper
    if (input.stampPaper) {
      req.stampPaper = { ...input.stampPaper, status: 'pending' };
      try {
        const stamp = await this.melento.procureStamp(req.stampPaper);
        req.stampPaper.certificateNo = stamp.certificateNo;
        req.stampPaper.status = 'procured';
        audit.push({ event: 'stamp-procured', at: new Date().toISOString(), detail: `e-stamp ${stamp.certificateNo} (₹${req.stampPaper.dutyAmount}, ${req.stampPaper.state})` });
        await this.update(req);
      } catch (e) {
        this.logger.warn(`Stamp procurement failed: ${String(e)}`);
        audit.push({ event: 'stamp-failed', at: new Date().toISOString(), detail: String(e) });
        await this.update(req);
        if (isProduction()) throw new ServiceUnavailableException('Required e-stamp procurement failed; signing was not started.');
      }
    }

    // 2) signing envelope
    try {
      const env = await this.melento.createEnvelope({
        contractId: req.contractId,
        contractTitle: req.contractTitle,
        signatories: req.signatories,
        message: req.message,
        stampCertificateNo: req.stampPaper?.certificateNo,
        document: { filename: sourceFile.filename, contentType: sourceFile.contentType, bytes: sourceFile.buffer, sha256: approvedDoc.sha256 },
      });
      req.envelopeId = env.envelopeId;
      req.signingUrl = env.signingUrl;
      req.status = 'sent';
      req.sentAt = new Date().toISOString();
      req.signatories = req.signatories.map((s) => ({ ...s, status: 'sent' as SignatureStatus }));
      audit.push({ event: 'sent', at: req.sentAt, detail: `Envelope ${env.envelopeId} dispatched to ${req.signatories.length} signatories` });
      await this.update(req);
    } catch (e) {
      this.logger.warn(`Envelope create failed: ${String(e)}`);
      audit.push({ event: 'send-failed', at: new Date().toISOString(), detail: String(e) });
      await this.update(req);
      if (isProduction()) throw new ServiceUnavailableException('Signing provider could not create the envelope.');
    }

    // 3) Outlook notification to each signatory
    if (req.status === 'sent') {
      for (const s of req.signatories) {
        await this.notifications
          .sendEmail({ to: [s.email], subject: `✍️ Signature requested: ${req.contractTitle}`, html: signatureRequestHtml(req, s) })
          .catch(() => undefined);
      }
    }

    await this.audit.record({
      action: req.status === 'sent' ? 'esign.sent' : 'esign.draft',
      entity: 'signature',
      entityId: req.id,
      summary:
        req.status === 'sent'
          ? `Signing envelope ${req.envelopeId} dispatched for "${req.contractTitle}" to ${req.signatories.length} signatory(ies)`
          : `Signature request created for "${req.contractTitle}" (not yet dispatched)`,
      metadata: {
        contractId: req.contractId,
        envelopeId: req.envelopeId,
        provider: req.provider,
        signatories: req.signatories.map((s) => s.email),
        stampCertificateNo: req.stampPaper?.certificateNo,
        stampState: req.stampPaper?.state,
      },
    });

    return req;
  }

  /**
   * Advances a request to its next state — used to *simulate* signer progress in
   * the stub (sent → viewed → each signer signs → completed). In production this
   * is driven by Melento's webhook (see `webhook`), not called directly.
   */
  async advance(id: string): Promise<SignatureRequest> {
    // This drives an envelope to "completed" and mints an execution certificate
    // with no signature from anyone. It is a demo aid and must never be callable
    // in production, where only the HMAC-verified webhook may change state.
    if (isProduction() && process.env.DEMO_SAMPLES !== 'true') {
      throw new ForbiddenException(
        'Simulating signer progress is disabled in production — execution status ' +
          'is driven only by verified Melento webhooks.',
      );
    }
    const updated = await this.mutate(id, (req) => {
      const nowIso = new Date().toISOString();
      if (req.status === 'sent') {
        req.status = 'viewed';
        req.signatories = req.signatories.map((s, i) => (i === 0 ? { ...s, status: 'viewed' } : s));
        req.audit.push({ event: 'viewed', at: nowIso, by: req.signatories[0]?.email });
      } else if (req.status === 'viewed' || req.status === 'partially-signed') {
        const next = req.signatories.find((s) => s.status !== 'signed');
        if (next) {
          next.status = 'signed';
          next.signedAt = nowIso;
          req.audit.push({ event: 'signed', at: nowIso, by: next.email });
        }
        const allSigned = req.signatories.every((s) => s.status === 'signed');
        if (allSigned) {
          req.status = 'completed';
          req.completedAt = nowIso;
          if (req.stampPaper) req.stampPaper.status = 'affixed';
          req.audit.push({ event: 'completed', at: nowIso, detail: 'All parties signed; stamped document sealed' });
        } else {
          req.status = 'partially-signed';
        }
      }
      return true;
    });
    const req = updated ?? (await this.get(id));
    if (req.status === 'completed') await this.archive(req);
    return this.get(id);
  }

  /** Handles a Melento status callback. Maps their event to our status. */
  async webhook(payload: any): Promise<{ ok: boolean; duplicate?: boolean }> {
    const envelopeId = payload?.envelopeId ?? payload?.id;
    const event = String(payload?.event ?? payload?.status ?? '').toLowerCase();

    // Resolve the envelope FIRST. Claiming the idempotency key before we know the
    // envelope exists would burn the key and return 200, so the provider would
    // never retry and the event would be lost.
    const req = await this.findByEnvelope(envelopeId);
    if (!req) return { ok: false };

    // Idempotency key: envelope + event + signer + the provider's own event
    // timestamp. The timestamp is inside the HMAC-verified body, so it is not
    // attacker-chosen, and including it keeps DISTINCT events distinct — keying
    // on envelope+event+signer alone would silently drop the second signer's
    // signature (both arrive as `signed` with no signer email from some providers).
    const stamp = String(payload?.occurredAt ?? payload?.timestamp ?? payload?.eventTime ?? '');
    const idemKey = `esign-webhook:${envelopeId}:${event}:${payload?.signerEmail ?? ''}:${stamp}`;
    if (await this.jobs.alreadyProcessed(idemKey)) {
      this.logger.log(`Duplicate webhook ignored (${idemKey})`);
      return { ok: true, duplicate: true };
    }
    // The claim is taken BEFORE the work — that is what makes it exclusive — so
    // every failure path below must give it back. Holding a claim over failed
    // work turns a retryable failure into a permanent one: the provider
    // redelivers, we answer "already processed", and the event is lost.
    try {
      return await this.applyWebhook(req, event, payload);
    } catch (e) {
      await this.jobs.releaseClaim(idemKey);
      throw e;
    }
  }

  /** The state transition itself — see `webhook` for the idempotency contract. */
  private async applyWebhook(
    req: SignatureRequest,
    event: string,
    payload: any,
  ): Promise<{ ok: boolean; duplicate?: boolean }> {

    const map: Record<string, SignatureStatus> = {
      viewed: 'viewed', opened: 'viewed',
      signed: 'partially-signed',
      completed: 'completed', finished: 'completed',
      declined: 'declined', rejected: 'declined',
      expired: 'expired',
    };
    const status = map[event];
    if (!status) return { ok: true };

    // Monotonic state machine: out-of-order delivery is normal, so an older event
    // must never regress an executed agreement back to an earlier state.
    const ORDER: Record<string, number> = {
      draft: 0, sent: 1, viewed: 2, 'partially-signed': 3,
      completed: 4, declined: 4, expired: 4,
    };
    const TERMINAL = new Set(['completed', 'declined', 'expired']);

    let skipped: 'terminal' | 'out-of-order' | null = null;

    // The whole transition runs inside `mutate`, which re-reads the row and
    // re-applies on a version conflict (finding C-D15). Applying it to the copy
    // fetched before the idempotency claim would let two signers' webhooks
    // overwrite one another — the second write would carry the first signer's
    // stale `signatories` array and erase their signature.
    const updated = await this.mutate(req.id, (row) => {
      skipped = null; // per-attempt: a discarded attempt must not leak its verdict
      if (TERMINAL.has(row.status)) {
        skipped = 'terminal';
        return false;
      }
      if ((ORDER[status] ?? 0) < (ORDER[row.status] ?? 0)) {
        skipped = 'out-of-order';
        return false;
      }

      // Per-signer state: mark the signatory this event is about, so nudges stop
      // chasing people who have signed and the certificate carries real timestamps.
      const signer = String(payload?.signerEmail ?? '').toLowerCase();
      const at = new Date().toISOString();
      if (status === 'partially-signed' && signer) {
        row.signatories = row.signatories.map((s) =>
          s.email.toLowerCase() === signer
            ? { ...s, status: 'signed' as SignatureStatus, signedAt: at }
            : s,
        );
        // Derive completion from the signatories rather than waiting for a
        // separate `completed` callback that may never arrive.
        if (row.signatories.every((s) => s.status === 'signed')) {
          row.status = 'completed';
          row.completedAt = at;
          if (row.stampPaper) row.stampPaper.status = 'affixed';
        } else {
          row.status = status;
        }
      } else {
        row.status = status;
        if (status === 'completed') {
          row.completedAt = at;
          row.signatories = row.signatories.map((s) =>
            s.status === 'signed' ? s : { ...s, status: 'signed' as SignatureStatus, signedAt: s.signedAt ?? at },
          );
          if (row.stampPaper) row.stampPaper.status = 'affixed';
        }
      }
      row.audit.push({ event, at, by: payload?.signerEmail, detail: 'via Melento webhook' });
      return true;
    });

    if (!updated) {
      // A previous completion may have committed the terminal state but failed
      // while retrieving/storing the provider-executed agreement. A retry must
      // repair that evidence gap rather than treating the callback as a harmless
      // duplicate forever.
      if (skipped === 'terminal' && req.status === 'completed' && !(await this.isArchived(req.id))) {
        const current = await this.get(req.id);
        await this.archive(current);
        return { ok: true };
      }
      this.logger.warn(
        skipped === 'terminal'
          ? `Ignoring "${event}" for ${req.id}: already terminal (${req.status})`
          : `Ignoring out-of-order "${event}" for ${req.id} (current ${req.status})`,
      );
      return { ok: true, duplicate: true };
    }

    if (updated.status === 'completed') await this.archive(updated);
    return { ok: true };
  }

  // ── Auto-nudge: remind signatories who haven't signed within the SLA ──

  private get nudgeAfterDays(): number {
    return Number(process.env.MELENTO_NUDGE_AFTER_DAYS || 2);
  }
  private get reNudgeEveryDays(): number {
    return Number(process.env.MELENTO_NUDGE_EVERY_DAYS || 1);
  }

  /**
   * Nudges every pending signatory whose request has been out for at least
   * MELENTO_NUDGE_AFTER_DAYS and who hasn't signed — at most once per
   * MELENTO_NUDGE_EVERY_DAYS. `force` ignores both windows (used by the manual
   * endpoint for testing). Emails go out via Outlook (dry-run without Graph).
   */
  async nudgePending(force = false, overrideAfterDays?: number): Promise<{ count: number; nudged: { request: string; signer: string; days: number }[] }> {
    const after = overrideAfterDays ?? this.nudgeAfterDays;
    const now = Date.now();
    const nudged: { request: string; signer: string; days: number }[] = [];

    for (const req of await this.list()) {
      if (!PENDING.includes(req.status)) continue;
      const sentMs = req.sentAt ? new Date(req.sentAt).getTime() : new Date(req.createdAt).getTime();
      const daysWaiting = Math.floor((now - sentMs) / DAY_MS);
      if (!force && daysWaiting < after) continue;
      if (!force && req.lastNudgedAt && now - new Date(req.lastNudgedAt).getTime() < this.reNudgeEveryDays * DAY_MS) continue;

      const pending = req.signatories.filter((s) => s.status !== 'signed');
      if (!pending.length) continue;

      const delivered: string[] = [];
      for (const s of pending) {
        const res = await this.notifications
          .sendEmail({ to: [s.email], subject: `⏰ Reminder: sign ${req.contractTitle}`, html: signatureNudgeHtml(req, s, daysWaiting) })
          .catch(() => null);
        // Only claim a reminder was sent if it was (finding C-D26): recording a
        // nudge that failed suppresses the retry for a whole day. In production
        // a `dry-run` is NOT a delivery — Graph is simply not configured.
        if (res && wasDelivered(res)) {
          delivered.push(s.email);
          nudged.push({ request: req.id, signer: s.email, days: daysWaiting });
        } else {
          this.logger.warn(`Nudge to ${s.email} for ${req.id} was NOT delivered — will retry next sweep`);
        }
      }
      if (!delivered.length) continue;
      const at = new Date().toISOString();
      await this.mutate(req.id, (row) => {
        row.lastNudgedAt = at;
        row.audit.push({
          event: 'nudged',
          at,
          detail: `Reminder sent to ${delivered.join(', ')} (waiting ${daysWaiting}d)`,
        });
        return true;
      });
    }

    this.logger.log(`Auto-nudge: ${nudged.length} reminder(s) sent`);
    return { count: nudged.length, nudged };
  }

  /**
   * Scheduled sweep (default daily 09:00). Dormant until MELENTO_NUDGE_ENABLED=true,
   * so it never fires unexpectedly in dev. Uses the same claim-free path as a
   * single instance; run one replica for the nudge or drive nudgePending() from
   * an external scheduler.
   */
  @Cron(process.env.MELENTO_NUDGE_CRON || '0 9 * * *', {
    name: 'esign-nudge',
    timeZone: process.env.SCHEDULE_TZ || 'Asia/Kolkata',
  })
  async scheduledNudge(): Promise<void> {
    if (process.env.MELENTO_NUDGE_ENABLED !== 'true') return;
    // @Cron invokes this without awaiting, so ANY rejection here is an unhandled
    // rejection. Fail closed and log: a missed sweep is visible the next hour, a
    // crashed process is not.
    const runKey = `esign-nudge:${new Date().toISOString().slice(0, 13)}`;
    try {
      if (!(await this.jobs.claimOnce(runKey))) {
        this.logger.log(`Nudge ${runKey} already claimed by another replica — skipping`);
        return;
      }
    } catch (e) {
      this.logger.error(`Nudge ${runKey} could not be claimed (${String(e)}) — skipping this sweep`);
      return;
    }
    try {
      await this.nudgePending(false);
    } catch (e) {
      // Give the claim back so the next sweep retries rather than skipping.
      await this.jobs.releaseClaim(runKey).catch(() => undefined);
      this.logger.error(`Nudge sweep ${runKey} failed: ${String(e)}`);
    }
  }

  // ── Signed-document archive ──

  /** Seals the provider-executed agreement and files it into the document store. */
  private async archive(req: SignatureRequest): Promise<ArchivedDocument | null> {
    if (await this.isArchived(req.id)) return null;

    const prod = (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
    let buffer: Buffer;
    let contentType: string;
    let filename: string;

    if (prod) {
      if (!req.envelopeId || !req.documentSha256) {
        throw new Error(`Cannot archive ${req.id}: envelope/document provenance is incomplete.`);
      }
      const executed = await this.melento.downloadExecutedDocument(req.envelopeId);
      if (executed.sourceSha256.toLowerCase() !== req.documentSha256.toLowerCase()) {
        throw new Error(`Executed agreement source hash does not match the approved document for ${req.id}.`);
      }
      buffer = executed.bytes;
      contentType = executed.contentType;
      filename = executed.filename;
    } else {
      // Non-production keeps a human-readable simulator certificate. It is never
      // represented as the signed agreement in production.
      buffer = Buffer.from(executionCertificateHtml(req), 'utf8');
      contentType = 'text/html';
      filename = `executed-${req.id}.html`;
    }

    const checksum = createHash('sha256').update(buffer).digest('hex');
    let storageKey = '';
    try {
      storageKey = await this.storage.put(buffer, filename, contentType);
    } catch (e) {
      this.logger.error(`Archive store FAILED for ${req.id} — not archiving: ${String(e)}`);
      throw e;
    }
    if (!storageKey) throw new Error(`Archive for ${req.id} produced no storage key`);
    const retentionYears = Number(process.env.RETENTION_YEARS || 8);
    const retentionUntil = new Date();
    retentionUntil.setFullYear(retentionUntil.getFullYear() + retentionYears);
    const doc: ArchivedDocument = {
      id: `ARC-${req.id}`,
      requestId: req.id,
      contractId: req.contractId,
      contractTitle: req.contractTitle,
      signatories: req.signatories.map((s) => ({ name: s.name, role: s.role, signedAt: s.signedAt })),
      stampCertificateNo: req.stampPaper?.certificateNo,
      stampState: req.stampPaper?.state,
      completedAt: req.completedAt ?? new Date().toISOString(),
      archivedAt: new Date().toISOString(),
      storageKey,
      checksum,
      format: contentType,
      filename,
      size: buffer.length,
      retentionUntil: retentionUntil.toISOString(),
      legalHold: false,
    };
    await this.persistArchive(doc);
    await this.mutate(req.id, (row) => {
      row.audit.push({
        event: 'archived',
        at: doc.archivedAt,
        detail: `Provider-executed agreement filed · sha256 ${checksum.slice(0, 12)}…`,
      });
      return true;
    }).catch((e) => {
      this.logger.error(`Archived ${req.id} but could not append the archive audit entry: ${String(e)}`);
      return null;
    });
    this.logger.log(`Archived executed ${req.id} → ${doc.id} (${buffer.length}B)`);

    await this.audit
      .record({
        action: 'esign.executed',
        entity: 'signature',
        entityId: req.id,
        summary: `Provider-executed copy of "${req.contractTitle}" sealed and archived (${doc.id})`,
        metadata: {
          archiveId: doc.id,
          contractId: req.contractId,
          approvedSourceSha256: req.documentSha256,
          executedChecksum: checksum,
          stampCertificateNo: req.stampPaper?.certificateNo,
          signatories: req.signatories.map((s) => ({ name: s.name, signedAt: s.signedAt })),
        },
      })
      .catch((e) => this.logger.error(`Archived ${req.id} as ${doc.id} but could NOT write the esign.executed audit event: ${String(e)}`));

    return doc;
  }

  async listArchive(): Promise<ArchivedDocument[]> {
    if (this.useArchivePrisma) {
      const rows = await this.prisma.client.archivedDocument.findMany({ orderBy: { archivedAt: 'desc' } });
      return rows.map(this.fromArchiveRow);
    }
    return [...this.archiveMem].sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
  }

  async getArchiveFile(id: string): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const doc = this.useArchivePrisma
      ? await this.prisma.client.archivedDocument.findUnique({ where: { id } }).then((r: any) => r && this.fromArchiveRow(r))
      : this.archiveMem.find((a) => a.id === id);
    if (!doc) throw new NotFoundException(`Archived document ${id} not found`);
    const f = await this.storage.get(doc.storageKey);
    return { buffer: f.buffer, contentType: doc.format || f.contentType, filename: doc.filename || `executed-${doc.requestId}` };
  }

  private get useArchivePrisma(): boolean {
    return this.prisma.enabled && Boolean(this.prisma.client?.archivedDocument);
  }
  private async isArchived(requestId: string): Promise<boolean> {
    if (this.useArchivePrisma) {
      return Boolean(await this.prisma.client.archivedDocument.findFirst({ where: { requestId } }));
    }
    return this.archiveMem.some((a) => a.requestId === requestId);
  }
  /**
   * No silent in-memory fallback (finding C-D16): the archive row IS the record
   * that an executed copy was sealed. Writing it to a process-local array that
   * `listArchive()` never reads once Prisma is enabled would report success
   * while the executed contract disappears at the next restart.
   */
  private async persistArchive(doc: ArchivedDocument): Promise<void> {
    if (this.useArchivePrisma) {
      await this.prisma.client.archivedDocument.create({ data: this.toArchiveRow(doc) });
      return;
    }
    this.archiveMem.unshift(doc);
  }
  private toArchiveRow = (d: ArchivedDocument): any => ({
    id: d.id, requestId: d.requestId, contractId: d.contractId, contractTitle: d.contractTitle,
    signatories: d.signatories as any, stampCertificateNo: d.stampCertificateNo ?? null, stampState: d.stampState ?? null,
    completedAt: new Date(d.completedAt), archivedAt: new Date(d.archivedAt),
    storageKey: d.storageKey, checksum: d.checksum, format: d.format, filename: d.filename ?? null, size: d.size,
    retentionUntil: d.retentionUntil ? new Date(d.retentionUntil) : null, legalHold: d.legalHold ?? false,
  });
  private fromArchiveRow = (r: any): ArchivedDocument => ({
    id: r.id, requestId: r.requestId, contractId: r.contractId, contractTitle: r.contractTitle,
    signatories: r.signatories ?? [], stampCertificateNo: r.stampCertificateNo ?? undefined, stampState: r.stampState ?? undefined,
    completedAt: new Date(r.completedAt).toISOString(), archivedAt: new Date(r.archivedAt).toISOString(),
    storageKey: r.storageKey, checksum: r.checksum, format: r.format, filename: r.filename ?? undefined, size: r.size,
    retentionUntil: r.retentionUntil ? new Date(r.retentionUntil).toISOString() : undefined,
    legalHold: r.legalHold ?? false,
  });

  // ── persistence helpers ──

  /**
   * Writes a NEW signature request.
   *
   * There is deliberately no fall-back to the in-memory list when the database
   * write fails (finding C-D16). That fallback existed, but nothing ever READ
   * from it once Prisma was enabled — so a failed write returned success to the
   * caller, sent the signing emails, and left no record anywhere. Signature
   * requests are the evidentiary spine of an execution; a write that did not
   * happen has to be reported as a failure.
   */
  private async persist(req: SignatureRequest): Promise<void> {
    if (this.usePrisma) {
      await this.prisma.client.signatureRequest.create({ data: this.toRow(req) });
      return;
    }
    this.mem.unshift(req);
  }

  /**
   * Persists a state change with optimistic concurrency (finding C-D15).
   *
   * Every change here is a read-modify-write of the WHOLE row (`signatories` and
   * `audit` are JSON blobs). Two webhooks arriving together — the common case
   * with multiple signers — each read the same row and each write their own
   * version back, so the second silently erases the first signer's signature and
   * audit entry. The version check turns that into a detected conflict, and
   * `mutate()` re-reads and re-applies instead of losing the event.
   */
  private async update(req: SignatureRequest): Promise<void> {
    if (!this.usePrisma) {
      const i = this.mem.findIndex((r) => r.id === req.id);
      if (i >= 0) this.mem[i] = req;
      return;
    }
    const expected = req.version ?? 0;
    const res = await this.prisma.client.signatureRequest.updateMany({
      where: { id: req.id, version: expected },
      data: { ...this.toRow(req), version: expected + 1 },
    });
    if (res.count !== 1) {
      throw new ConflictException(
        `Signature request ${req.id} changed concurrently (expected version ${expected}).`,
      );
    }
    req.version = expected + 1;
  }

  /**
   * Read-modify-write with automatic retry on a concurrency conflict. `mutate`
   * returns false to abort without writing (e.g. an out-of-order event).
   */
  private async mutate(
    id: string,
    mutateFn: (req: SignatureRequest) => Promise<boolean> | boolean,
    attempts = Number(process.env.ESIGN_WRITE_RETRIES || 4),
  ): Promise<SignatureRequest | null> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      const req = await this.get(id);
      let proceed: boolean;
      try {
        proceed = await mutateFn(req);
      } catch (e) {
        throw e;
      }
      if (!proceed) return null;
      try {
        await this.update(req);
        return req;
      } catch (e) {
        if (e instanceof ConflictException) {
          lastErr = e;
          this.logger.warn(
            `Concurrent change on ${id} — re-reading and re-applying (attempt ${i + 1}/${attempts})`,
          );
          await new Promise((r) => setTimeout(r, 25 * (i + 1)));
          continue;
        }
        throw e;
      }
    }
    throw lastErr ?? new ConflictException(`Could not apply the change to ${id}.`);
  }

  private toRow = (r: SignatureRequest): any => ({
    id: r.id, contractId: r.contractId, contractTitle: r.contractTitle, documentId: r.documentId ?? null, documentSha256: r.documentSha256 ?? null, contractVersion: r.contractVersion ?? null,
    status: r.status, provider: r.provider, envelopeId: r.envelopeId ?? null,
    signingUrl: r.signingUrl ?? null, message: r.message ?? null,
    signatories: r.signatories as any, stampPaper: (r.stampPaper ?? null) as any, audit: r.audit as any,
    createdAt: new Date(r.createdAt), sentAt: r.sentAt ? new Date(r.sentAt) : null,
    completedAt: r.completedAt ? new Date(r.completedAt) : null,
    lastNudgedAt: r.lastNudgedAt ? new Date(r.lastNudgedAt) : null,
  });
  private fromRow = (row: any): SignatureRequest => ({
    id: row.id, contractId: row.contractId, contractTitle: row.contractTitle, documentId: row.documentId ?? undefined, documentSha256: row.documentSha256 ?? undefined, contractVersion: row.contractVersion ?? undefined,
    status: row.status, provider: row.provider, envelopeId: row.envelopeId ?? undefined,
    signingUrl: row.signingUrl ?? undefined, message: row.message ?? undefined,
    signatories: row.signatories ?? [], stampPaper: row.stampPaper ?? undefined, audit: row.audit ?? [],
    createdAt: new Date(row.createdAt).toISOString(),
    sentAt: row.sentAt ? new Date(row.sentAt).toISOString() : undefined,
    completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : undefined,
    lastNudgedAt: row.lastNudgedAt ? new Date(row.lastNudgedAt).toISOString() : undefined,
    version: typeof row.version === 'number' ? row.version : 0,
  });
}
