import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import {
  AUDIT_GENESIS_HASH,
  AuditActor,
  AuditAiProvenance,
  AuditEvent,
  AuditVerifyResult,
} from '@concord/shared';
import { PrismaService } from '../persistence/prisma.service';
import { isProduction } from '../security/security.config';
import { auditAppendFailures } from '../telemetry/telemetry';

/** Input to record an event — the chain fields (seq/prevHash/hash) are computed here. */
export interface AuditInput {
  actor?: AuditActor;
  action: string;
  entity: string;
  entityId?: string;
  summary: string;
  request?: AuditEvent['request'];
  metadata?: Record<string, unknown>;
  ai?: AuditAiProvenance;
  correlationId?: string;
}

/** Which AI capability an event relates to, for the provenance helper. */
export type AiCapability = 'chat' | 'embeddings' | 'extract' | 'ocr' | 'review' | 'triage';

/**
 * Advisory-lock key for the audit chain. Transaction-scoped, so it is released
 * on COMMIT or ROLLBACK — including when a replica is killed mid-transaction.
 * 1129270083 = 0x434F4E43 = "CONC".
 */
const AUDIT_LOCK_KEY = 1129270083;

/** Rows fetched per page when reading, exporting or verifying the chain. */
const PAGE = 500;

/**
 * Append-only, hash-chained audit trail (assessment finding C2).
 *
 * ## Why the append is a transaction, not a cached counter
 *
 * `seq` is UNIQUE in the database. An earlier version allocated it from a
 * per-process cache, which is correct on exactly one replica and wrong on two:
 * both replicas compute the same next `seq`, one INSERT wins, the other raises a
 * unique violation that was caught and logged — and the business action carried
 * on. Under the autoscale profile (1→5 replicas) that silently loses audit
 * events, which is the one failure mode an evidentiary log may not have.
 *
 * The append therefore takes a transaction-scoped Postgres advisory lock, reads
 * the real chain tip inside that transaction, and inserts — so allocation and
 * insertion are atomic across every replica. There is no in-process tip to drift
 * (findings C-D2/C-D3), and a durable-write failure sets `degraded`, which fails
 * readiness so the replica is pulled out of rotation (finding C-D4).
 *
 * Reads are paged rather than loading the whole table (finding C-D5).
 */
@Injectable()
export class AuditService implements OnModuleInit {
  private readonly logger = new Logger(AuditService.name);
  /** In-memory chain — the real store ONLY when no database is configured. */
  private readonly events: AuditEvent[] = [];
  /** Serializes in-process appends (the no-database path). */
  private tail: Promise<unknown> = Promise.resolve();
  /** True once a durable write or read has failed — surfaced on readiness. */
  private persistDegraded = false;
  private lastDegradedReason: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Confirms the durable chain is reachable at boot. Unlike the previous
   * implementation this does NOT cache the tip — the tip is read inside each
   * append's transaction — so a failure here cannot restart the sequence at 1.
   */
  async onModuleInit(): Promise<void> {
    if (!this.usePrisma) return;
    try {
      const last = await this.withTimeout<{ seq: number; hash: string } | null>(
        this.prisma.client.auditEvent.findFirst({ orderBy: { seq: 'desc' } }),
        Number(process.env.AUDIT_BOOT_TIMEOUT_MS || 10_000),
        'audit chain tip',
      );
      this.logger.log(
        last ? `Audit chain reachable · tip seq ${last.seq}` : 'Audit chain reachable · empty',
      );
    } catch (e) {
      // Do not mark degraded on a slow boot probe alone; the first append will
      // establish the truth. But say so loudly.
      this.logger.error(`Could not read the audit chain tip at boot: ${String(e)}`);
    }
  }

  private get usePrisma(): boolean {
    return this.prisma.enabled && Boolean(this.prisma.client?.auditEvent);
  }

  /**
   * True once an audit event has been irrecoverably LOST (a durable write that
   * exhausted its retries). Deliberately sticky and deliberately narrow:
   *
   *  - sticky, because the trail is now incomplete and no later success undoes
   *    that. Readiness fails so the replica leaves rotation and someone looks.
   *  - narrow, because only a failed WRITE loses evidence. A failed read is
   *    logged but does not set this — otherwise one slow admin query would
   *    take a healthy replica out of service for the rest of its life.
   */
  get degraded(): boolean {
    return this.persistDegraded;
  }

  get degradedReason(): string | null {
    return this.lastDegradedReason;
  }

  /**
   * Strict mode makes a failed durable append throw to the caller instead of
   * being swallowed. Default ON in production: an unaudited state change in a
   * legal system of record is worse than a failed request.
   */
  private get strict(): boolean {
    const raw = process.env.AUDIT_STRICT;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return isProduction();
  }

  private markDegraded(reason: string): void {
    this.persistDegraded = true;
    this.lastDegradedReason = reason;
  }

  private async withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms);
    });
    try {
      return await Promise.race([p, timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }

  /** Deterministic serialization (sorted keys) of everything but the hash. */
  private canonical(e: Omit<AuditEvent, 'hash'>): string {
    const stable = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(stable);
      if (v && typeof v === 'object') {
        return Object.keys(v as Record<string, unknown>)
          .sort()
          .reduce<Record<string, unknown>>((acc, k) => {
            acc[k] = stable((v as Record<string, unknown>)[k]);
            return acc;
          }, {});
      }
      return v;
    };
    return JSON.stringify(stable(e));
  }

  private hashOf(e: Omit<AuditEvent, 'hash'>): string {
    return createHash('sha256').update(this.canonical(e)).digest('hex');
  }

  /**
   * Appends an event to the chain and returns it.
   *
   * In strict mode a durable failure throws, so the caller cannot proceed as if
   * the action had been recorded. Otherwise it returns null and logs loudly and
   * marks the service degraded (which fails readiness).
   */
  async record(input: AuditInput): Promise<AuditEvent | null> {
    if (this.usePrisma) {
      try {
        return await this.appendDurable(input);
      } catch (err) {
        this.markDegraded(String(err));
        // The evidentiary record now has a hole. Of every metric this service
        // emits, this is the one whose correct steady-state value is zero.
        auditAppendFailures.add(1, { action: input.action, entity: input.entity ?? 'unknown' });
        this.logger.error(
          `AUDIT PERSIST FAILED (${input.action}) — the durable trail is incomplete: ${String(err)}`,
        );
        if (this.strict) throw err;
        return null;
      }
    }
    // No database: the in-memory chain is the store; serialize appends.
    const run = this.tail.then(() => this.appendMemory(input));
    this.tail = run.catch(() => undefined);
    try {
      return await run;
    } catch (err) {
      this.logger.error(`Failed to record audit event: ${String(err)}`);
      if (this.strict) throw err;
      return null;
    }
  }

  /** Everything but the chain fields — shared by both append paths. */
  private bodyOf(input: AuditInput, seq: number, prevHash: string): Omit<AuditEvent, 'hash'> {
    return {
      id: randomUUID(),
      seq,
      at: new Date().toISOString(),
      actor: input.actor ?? {},
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      summary: input.summary,
      request: input.request,
      metadata: input.metadata,
      ai: input.ai,
      correlationId: input.correlationId,
      prevHash,
    };
  }

  /**
   * Allocates `seq`/`prevHash` and inserts, atomically, under an advisory lock
   * held for the life of the transaction. Concurrent appends — in this process
   * or any other replica — queue on the lock instead of colliding.
   */
  private async appendDurable(input: AuditInput): Promise<AuditEvent> {
    const attempts = Number(process.env.AUDIT_WRITE_RETRIES || 3);
    // ONE id for all attempts. A transaction can COMMIT and then have the client
    // fail (dropped connection, Prisma's own timeout firing after COMMIT); a
    // retry with a fresh id would insert the same business event twice, and the
    // chain would verify happily over a trail claiming a contract was approved
    // twice. With a stable id the retry can tell "already landed" from "never
    // landed" — the id is the primary key.
    const eventId = randomUUID();
    let lastErr: unknown;
    for (let attempt = 0; attempt <= attempts; attempt++) {
      try {
        const event = await this.prisma.client.$transaction(
          async (tx: any) => {
            // Fail fast instead of holding a pooled connection for the whole
            // transaction budget while queued behind another replica's append.
            const lockWait = Number(process.env.AUDIT_LOCK_TIMEOUT_MS || 5_000);
            await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${lockWait}ms'`);
            // Serialize chain appends cluster-wide. Released on commit/rollback.
            await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock($1)', AUDIT_LOCK_KEY);

            // Did a previous attempt already commit this exact event?
            const already = await tx.auditEvent.findUnique({ where: { id: eventId } });
            if (already) return this.fromRow(already);

            const last = await tx.auditEvent.findFirst({ orderBy: { seq: 'desc' } });
            const seq = (last?.seq ?? 0) + 1;
            const prevHash = last?.hash ?? AUDIT_GENESIS_HASH;
            const body = { ...this.bodyOf(input, seq, prevHash), id: eventId };
            const e: AuditEvent = { ...body, hash: this.hashOf(body) };
            await tx.auditEvent.create({ data: this.toRow(e) });
            // High-water mark, in the SAME transaction — so deleting events
            // later leaves a tip that has gone backwards, which verify() sees.
            if (tx.auditAnchor) {
              await tx.auditAnchor.upsert({
                where: { id: 'chain' },
                update: { seq: e.seq, hash: e.hash },
                create: { id: 'chain', seq: e.seq, hash: e.hash },
              });
            }
            return e;
          },
          {
            timeout: Number(process.env.AUDIT_TX_TIMEOUT_MS || 15_000),
            maxWait: Number(process.env.AUDIT_TX_MAX_WAIT_MS || 10_000),
          },
        );
        return event;
      } catch (e) {
        lastErr = e;
        if (attempt < attempts) {
          await new Promise((r) => setTimeout(r, 50 * 2 ** attempt));
        }
      }
    }
    throw lastErr;
  }

  /** No-database path: the RAM chain is the only chain. */
  private async appendMemory(input: AuditInput): Promise<AuditEvent> {
    const prev = this.events[this.events.length - 1];
    const body = this.bodyOf(input, (prev?.seq ?? 0) + 1, prev?.hash ?? AUDIT_GENESIS_HASH);
    const event: AuditEvent = { ...body, hash: this.hashOf(body) };
    this.events.push(event);
    return event;
  }

  private toRow(event: AuditEvent): any {
    return {
      id: event.id,
      seq: event.seq,
      at: new Date(event.at),
      actorId: event.actor.id ?? null,
      actorEmail: event.actor.email ?? null,
      actorRole: event.actor.role ?? null,
      action: event.action,
      entity: event.entity,
      entityId: event.entityId ?? null,
      summary: event.summary,
      request: event.request ? (event.request as any) : undefined,
      metadata: event.metadata ? (event.metadata as any) : undefined,
      ai: event.ai ? (event.ai as any) : undefined,
      correlationId: event.correlationId ?? null,
      prevHash: event.prevHash,
      hash: event.hash,
    };
  }

  private fromRow(r: any): AuditEvent {
    return {
      id: r.id,
      seq: r.seq,
      at: new Date(r.at).toISOString(),
      actor: {
        id: r.actorId ?? undefined,
        email: r.actorEmail ?? undefined,
        role: r.actorRole ?? undefined,
      },
      action: r.action,
      entity: r.entity,
      entityId: r.entityId ?? undefined,
      summary: r.summary,
      request: r.request ?? undefined,
      metadata: r.metadata ?? undefined,
      ai: r.ai ?? undefined,
      correlationId: r.correlationId ?? undefined,
      prevHash: r.prevHash,
      hash: r.hash,
    } as AuditEvent;
  }

  /**
   * Most-recent-first, filtered and paged IN THE DATABASE (finding C-D5) —
   * `GET /api/audit` previously read every row into memory on each call.
   */
  async list(
    opts: {
      entity?: string;
      entityId?: string;
      action?: string;
      /** Match ANY of these action prefixes — pushed into the query, not filtered after. */
      actions?: string[];
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<AuditEvent[]> {
    const take = Math.min(Math.max(opts.limit ?? 200, 1), 1000);
    const skip = Math.max(opts.offset ?? 0, 0);
    if (!this.usePrisma) {
      let out = [...this.events].reverse();
      if (opts.entity) out = out.filter((e) => e.entity === opts.entity);
      if (opts.entityId) out = out.filter((e) => e.entityId === opts.entityId);
      if (opts.action) out = out.filter((e) => e.action.startsWith(opts.action!));
      if (opts.actions?.length) {
        out = out.filter((e) => opts.actions!.some((a) => e.action.startsWith(a)));
      }
      return out.slice(skip, skip + take);
    }
    try {
      const rows = await this.prisma.client.auditEvent.findMany({
        where: this.whereOf(opts),
        orderBy: { seq: 'desc' },
        take,
        skip,
      });
      return rows.map((r: any) => this.fromRow(r));
    } catch (e) {
      // A failed READ is not a lost event. Marking degraded here would let a
      // single statement timeout on an admin page permanently fail readiness
      // and make verify() report an unattestable trail for ever.
      this.logger.error(`Audit read from database failed: ${String(e)}`);
      return [];
    }
  }

  /** Total matching events, so a caller can page without fetching everything. */
  async count(
    opts: { entity?: string; entityId?: string; action?: string; actions?: string[] } = {},
  ): Promise<number> {
    if (!this.usePrisma) return this.events.length;
    try {
      return await this.prisma.client.auditEvent.count({ where: this.whereOf(opts) });
    } catch {
      return 0;
    }
  }

  private whereOf(opts: {
    entity?: string;
    entityId?: string;
    action?: string;
    actions?: string[];
  }): any {
    const where: any = {};
    if (opts.entity) where.entity = opts.entity;
    if (opts.entityId) where.entityId = opts.entityId;
    if (opts.action) where.action = { startsWith: opts.action };
    if (opts.actions?.length) {
      where.OR = opts.actions.map((a) => ({ action: { startsWith: a } }));
    }
    return where;
  }

  /**
   * Streams the chain in order, a page at a time, applying `onPage` to each.
   * Used by export and verify so neither materialises the whole table.
   */
  /**
   * Streams the chain in order, a page at a time. `onPage` returns `false` to
   * stop — without that, a cap that stops COLLECTING still kept FETCHING, so
   * exporting 50k events from a 10M-row table issued 20,000 queries.
   */
  private async eachPage(
    fromSeq: number,
    onPage: (rows: AuditEvent[]) => boolean | void | Promise<boolean | void>,
  ): Promise<void> {
    if (!this.usePrisma) {
      await onPage(this.events.filter((e) => e.seq >= fromSeq));
      return;
    }
    let cursor = fromSeq;
    for (;;) {
      const rows = await this.prisma.client.auditEvent.findMany({
        where: { seq: { gte: cursor } },
        orderBy: { seq: 'asc' },
        take: PAGE,
      });
      if (!rows.length) return;
      const carryOn = await onPage(rows.map((r: any) => this.fromRow(r)));
      if (carryOn === false) return;
      cursor = rows[rows.length - 1].seq + 1;
      if (rows.length < PAGE) return;
    }
  }

  /** Full chain in order (for export), bounded by AUDIT_EXPORT_MAX_EVENTS. */
  async all(): Promise<AuditEvent[]> {
    const max = Number(process.env.AUDIT_EXPORT_MAX_EVENTS || 50_000);
    const out: AuditEvent[] = [];
    try {
      await this.eachPage(1, (rows) => {
        for (const r of rows) {
          if (out.length >= max) return false; // stop fetching, not just collecting
          out.push(r);
        }
        return true;
      });
    } catch (e) {
      this.logger.error(`Audit export read failed: ${String(e)}`);
    }
    return out;
  }

  /**
   * Recomputes the chain to prove nothing was inserted, edited or removed.
   * Verifies a bounded suffix when the chain is very long — a suffix check is
   * still sound because each event carries its predecessor's hash.
   */
  async verify(): Promise<AuditVerifyResult> {
    if (this.persistDegraded) {
      return {
        ok: false,
        count: await this.count(),
        message:
          'Audit persistence has failed at least once — the durable trail is incomplete ' +
          `and cannot be attested (${this.lastDegradedReason ?? 'unknown cause'}). ` +
          'Investigate before relying on this log.',
      };
    }

    const total = await this.count();
    const max = Number(process.env.AUDIT_VERIFY_MAX_EVENTS || 100_000);
    let fromSeq = 1;
    let expectedPrev = AUDIT_GENESIS_HASH;

    // The chain proves that the events which REMAIN are unaltered. It cannot, on
    // its own, notice that events were DELETED: truncate the table and a chain
    // walk finds nothing to complain about. Compare against the high-water mark
    // written in the same transaction as each append.
    const tip = await this.tipOf();
    const anchorRow = await this.anchor();
    if (anchorRow) {
      if (!tip || tip.seq < anchorRow.seq) {
        return {
          ok: false,
          count: total,
          brokenAt: tip?.seq,
          message:
            `Events are MISSING — the chain ends at seq ${tip?.seq ?? 0} but ${anchorRow.seq} ` +
            'were committed. Entries have been deleted from the audit trail.',
        };
      }
      if (tip.seq === anchorRow.seq && tip.hash !== anchorRow.hash) {
        return {
          ok: false,
          count: total,
          brokenAt: tip.seq,
          message: `The final event (seq ${tip.seq}) does not match the recorded chain tip — the log has been altered.`,
        };
      }
    } else if (total === 0) {
      // No anchor and no events: either genuinely new, or wiped before the
      // anchor existed. Say which, rather than attesting an empty trail.
      return {
        ok: true,
        count: 0,
        message:
          'No audit events recorded yet. (No chain anchor exists, so an empty trail ' +
          'cannot be distinguished from one that was cleared before anchoring began.)',
      };
    }

    const maxSeq = tip?.seq ?? 0;
    // Appends allocate a contiguous integer seq under an advisory lock. Therefore
    // count < maxSeq proves at least one historical row is missing, even when the
    // expensive hash walk below is intentionally bounded to a suffix. Without
    // this check, deleting an old event outside the verified suffix could still
    // produce "Chain intact".
    if (this.usePrisma && total !== maxSeq) {
      return {
        ok: false, count: total,
        message: `Audit sequence has gaps — highest seq is ${maxSeq} but only ${total} event(s) remain. Historical entries have been deleted.`,
      };
    }
    if (this.usePrisma && maxSeq > max) {
      // Anchor the suffix on the event immediately before it. Use the highest
      // SEQ, not the row COUNT — they differ the moment there is any gap, and
      // using the count silently degraded to a full scan that then reported
      // "chain broken", indistinguishable from real tampering.
      const anchorSeq = maxSeq - max;
      const previous = await this.prisma.client.auditEvent.findFirst({ where: { seq: anchorSeq } });
      if (previous) {
        fromSeq = anchorSeq + 1;
        expectedPrev = previous.hash;
      }
    }

    let checked = 0;
    let expectedSeq = fromSeq;
    let broken: number | null = null;
    try {
      await this.eachPage(fromSeq, (rows) => {
        for (const e of rows) {
          const { hash, ...body } = e;
          if (e.seq !== expectedSeq || e.prevHash !== expectedPrev || this.hashOf(body) !== hash) {
            broken = e.seq;
            return false; // stop immediately; do not scan the rest of the table
          }
          expectedPrev = e.hash;
          expectedSeq += 1;
          checked += 1;
        }
        return true;
      });
    } catch (e) {
      return { ok: false, count: total, message: `Audit read failed during verification: ${String(e)}` };
    }

    if (broken !== null) {
      return {
        ok: false,
        count: total,
        brokenAt: broken,
        message: `Chain broken at seq ${broken} — the log has been altered.`,
      };
    }
    const scope = fromSeq === 1 ? '' : ` (verified seq ${fromSeq}–${expectedSeq - 1} of ${total})`;
    return {
      ok: true,
      count: total,
      message: `Chain intact — ${checked} event(s) verified${scope}.`,
    };
  }

  /** Current last event in the chain (durable store, or the RAM chain). */
  private async tipOf(): Promise<{ seq: number; hash: string } | null> {
    if (!this.usePrisma) {
      const last = this.events[this.events.length - 1];
      return last ? { seq: last.seq, hash: last.hash } : null;
    }
    try {
      const r = await this.prisma.client.auditEvent.findFirst({ orderBy: { seq: 'desc' } });
      return r ? { seq: r.seq, hash: r.hash } : null;
    } catch {
      return null;
    }
  }

  /** The recorded high-water mark, if the anchor table is available. */
  private async anchor(): Promise<{ seq: number; hash: string } | null> {
    if (!this.usePrisma || !this.prisma.client?.auditAnchor) {
      // Without a database the RAM chain is the only record; its own tip is the
      // best available anchor, so deletion detection does not apply.
      return null;
    }
    try {
      const a = await this.prisma.client.auditAnchor.findUnique({ where: { id: 'chain' } });
      return a ? { seq: a.seq, hash: a.hash } : null;
    } catch {
      return null;
    }
  }

  /**
   * Reports the AI provider/model that a capability resolves to from the current
   * environment, so an audit event can record real provenance without each caller
   * threading model strings. `advisory` is always true — Concord's AI never makes
   * an autonomous state change (assessment guardrail).
   */
  aiProvenance(capability: AiCapability, extra?: Partial<AuditAiProvenance>): AuditAiProvenance {
    const env = process.env;
    let provider = 'local';
    let model: string | undefined;
    switch (capability) {
      case 'chat':
      case 'review':
      case 'triage':
        provider = env.CHAT_PROVIDER ?? (env.AZURE_OPENAI_ENDPOINT ? 'azure' : 'local');
        model = env.CHAT_MODEL ?? env.BEDROCK_CHAT_MODEL ?? env.AZURE_OPENAI_DEPLOYMENT;
        break;
      case 'embeddings':
        provider = env.EMBEDDINGS_PROVIDER ?? 'local';
        model = env.EMBEDDINGS_MODEL ?? env.BEDROCK_EMBEDDINGS_MODEL ?? env.AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT;
        break;
      case 'extract':
        provider = env.EXTRACT_PROVIDER ?? (env.AZURE_OPENAI_ENDPOINT ? 'azure' : 'local');
        model = env.CHAT_MODEL ?? env.AZURE_OPENAI_DEPLOYMENT;
        break;
      case 'ocr':
        provider = env.OCR_PROVIDER ?? 'none';
        break;
    }
    return { capability, provider, model, advisory: true, ...extra };
  }
}
