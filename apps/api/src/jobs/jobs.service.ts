import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../persistence/prisma.service';
import { jobsDeadLettered } from '../telemetry/telemetry';

export interface DeadLetter {
  name: string;
  key?: string;
  attempts: number;
  lastError: string;
  at: string;
}

/**
 * Durability primitives for background work (assessment finding H1).
 *
 *  - `claimOnce(key)` is an atomic first-claim: exactly one caller across all
 *    replicas wins for a given key. It powers both replica-safe scheduling
 *    (only one replica runs the sweep) and idempotency (a webhook/action that
 *    arrives twice is processed once).
 *  - `runWithRetry(...)` retries a flaky step with exponential backoff and, on
 *    exhaustion, records it to a dead-letter queue instead of losing it.
 *
 * The `job_claim` table is now created by a versioned migration rather than by
 * runtime `CREATE TABLE IF NOT EXISTS` (finding C-D33), so it is reviewable,
 * drift-checked, and — see `pruneClaims` — no longer grows for ever.
 */
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  private readonly claimed = new Set<string>();
  private readonly dlq: DeadLetter[] = [];

  constructor(private readonly prisma: PrismaService) {}

  /** True if THIS caller is the first to claim `key`; false if already claimed. */
  async claimOnce(key: string): Promise<boolean> {
    if (this.prisma.enabled && this.prisma.client) {
      try {
        const affected: number = await this.prisma.client.$executeRawUnsafe(
          `INSERT INTO job_claim (claim_key) VALUES ($1) ON CONFLICT (claim_key) DO NOTHING`,
          key,
        );
        // Mirror locally too, so repeated in-process calls are also deduped.
        if (affected === 1) this.claimed.add(key);
        return affected === 1;
      } catch (e) {
        // Falling back to an in-process Set here would be WRONG under autoscale:
        // every replica would think it won. A claim we cannot make durably is a
        // claim we must refuse, so the caller retries rather than double-acting.
        this.logger.error(`claimOnce failed for "${key}" — refusing the claim: ${String(e)}`);
        throw e;
      }
    }
    if (this.claimed.has(key)) return false;
    this.claimed.add(key);
    return true;
  }

  /** Idempotency helper reading naturally at call sites: has `key` been handled? */
  async alreadyProcessed(key: string): Promise<boolean> {
    return !(await this.claimOnce(key));
  }

  /**
   * Gives a claim back.
   *
   * A claim marks work as DONE, but it is necessarily taken BEFORE the work runs
   * — that is what makes it a mutual exclusion. If the work then fails, holding
   * the claim converts a retryable failure into a permanent one: the provider
   * redelivers, we answer "already processed", and the event is lost for good.
   * Callers must release on any failure path.
   */
  async releaseClaim(key: string): Promise<void> {
    this.claimed.delete(key);
    if (!this.prisma.enabled || !this.prisma.client) return;
    try {
      await this.prisma.client.$executeRawUnsafe(`DELETE FROM job_claim WHERE claim_key = $1`, key);
    } catch (e) {
      // Worst case the key stays claimed and the provider's retry is deduped —
      // which is exactly the failure this method exists to prevent, so it is
      // logged at error level rather than swallowed.
      this.logger.error(`Could not release claim "${key}": ${String(e)}`);
    }
  }

  /**
   * Runs `fn` exactly once for `key` across all replicas, releasing the claim if
   * it throws so the caller (or the provider) can retry. Returns `duplicate`
   * when another caller already handled this key.
   */
  async runOnce<T>(key: string, fn: () => Promise<T>): Promise<{ duplicate: boolean; result?: T }> {
    if (await this.alreadyProcessed(key)) return { duplicate: true };
    try {
      return { duplicate: false, result: await fn() };
    } catch (e) {
      await this.releaseClaim(key);
      throw e;
    }
  }

  /**
   * Removes claim rows older than the retention window. Idempotency keys are
   * only meaningful for as long as a provider will retry (hours, not years); the
   * table previously grew without bound because nothing ever deleted from it.
   */
  @Cron(process.env.JOB_CLAIM_PRUNE_CRON || '30 3 * * *', {
    name: 'job-claim-prune',
    timeZone: process.env.SCHEDULE_TZ || 'Asia/Kolkata',
  })
  async pruneClaims(): Promise<{ jobClaims: number; digestRuns: number } | null> {
    if (!this.prisma.enabled || !this.prisma.client) return null;
    const days = Number(process.env.JOB_CLAIM_RETENTION_DAYS || 30);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    try {
      const jobClaims: number = await this.prisma.client.$executeRawUnsafe(
        `DELETE FROM job_claim WHERE created_at < $1`,
        cutoff,
      );
      const digestRuns: number = await this.prisma.client.$executeRawUnsafe(
        `DELETE FROM digest_run WHERE created_at < $1`,
        cutoff,
      );
      if (jobClaims || digestRuns) {
        this.logger.log(
          `Pruned ${jobClaims} job claim(s) and ${digestRuns} digest run(s) older than ${days}d`,
        );
      }
      return { jobClaims, digestRuns };
    } catch (e) {
      this.logger.warn(`Claim prune failed: ${String(e)}`);
      return null;
    }
  }

  /**
   * Runs `fn` with exponential backoff. On final failure the job is dead-lettered
   * (kept for inspection / replay) and the error is rethrown so the caller can
   * still react. `retries` is the number of RETRIES after the first attempt.
   */
  async runWithRetry<T>(
    name: string,
    fn: () => Promise<T>,
    opts: { retries?: number; baseDelayMs?: number; key?: string } = {},
  ): Promise<T> {
    const retries = opts.retries ?? 3;
    const base = opts.baseDelayMs ?? 200;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (e) {
        lastErr = e;
        if (attempt < retries) {
          const delay = base * 2 ** attempt;
          this.logger.warn(`Job "${name}" attempt ${attempt + 1} failed: ${String(e)} — retrying in ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    this.dlq.push({
      name,
      key: opts.key,
      attempts: retries + 1,
      lastError: String(lastErr),
      at: new Date().toISOString(),
    });
    this.logger.error(`Job "${name}" dead-lettered after ${retries + 1} attempts: ${String(lastErr)}`);
    // Work has silently stopped. This is the metric that should page someone.
    jobsDeadLettered.add(1, { job: name });
    throw lastErr;
  }

  /** Current dead-letter queue (seam for an admin view / external replay worker). */
  deadLetters(): DeadLetter[] {
    return [...this.dlq];
  }
}
