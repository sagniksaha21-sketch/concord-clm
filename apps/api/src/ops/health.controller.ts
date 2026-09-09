import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/rbac';
import { PrismaService } from '../persistence/prisma.service';
import { AuditService } from '../audit/audit.service';
import { telemetryStatus } from '../telemetry/telemetry';
import { degradedModes } from '../security/security.config';
import { StorageService } from '../storage/storage.service';

/**
 * Liveness and readiness probes (GPT 5.6 P1 — operational protections).
 * Both are public (no auth) so orchestrators and load balancers can poll them.
 */
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  /** Liveness — the process is up and serving. */
  @Public()
  @Get()
  live() {
    return {
      status: 'ok',
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      time: new Date().toISOString(),
    };
  }

  /** Readiness — dependencies are reachable; returns 503 if a configured DB is down. */
  @Public()
  @Get('ready')
  async ready() {
    const persistence = this.prisma.enabled ? 'postgres' : 'in-memory';
    // A configured-but-unreachable database is NOT ready: PrismaService silently
    // falls back to in-memory, which would otherwise serve sample data as if it
    // were the real portfolio while reporting healthy.
    let dbOk = true;
    if (process.env.DATABASE_URL && !this.prisma.enabled) {
      dbOk = false;
    } else if (this.prisma.enabled && this.prisma.client) {
      try {
        await this.prisma.client.$queryRawUnsafe('SELECT 1');
      } catch {
        dbOk = false;
      }
    }
    // A replica that has dropped even one audit write is not fit to serve: the
    // evidentiary trail it is producing is incomplete (finding C-D4). Failing
    // readiness takes it out of rotation and raises the alarm, instead of the
    // failure living only in a log line nobody reads.
    const auditOk = !this.audit.degraded;
    const storageOk = await this.storage.probe();
    const ok = dbOk && auditOk && storageOk;
    const production = (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
    const body = production
      ? {
          status: ok ? 'ready' : 'degraded',
          // Public production readiness intentionally exposes only coarse
          // dependency state. Provider names, telemetry configuration and
          // degraded integration details belong in authenticated ops/metrics.
          checks: { database: dbOk ? 'ok' : 'unreachable', auditTrail: auditOk ? 'ok' : 'degraded', storage: storageOk ? 'ok' : 'unreachable' },
          time: new Date().toISOString(),
        }
      : {
          status: ok ? 'ready' : 'degraded',
          checks: {
            persistence,
            database: dbOk ? 'ok' : 'unreachable',
            auditTrail: auditOk ? 'ok' : 'degraded',
            storage: storageOk ? this.storage.storageMode : 'unreachable',
            ...(auditOk ? {} : { auditTrailReason: this.audit.degradedReason ?? 'unknown' }),
            telemetry: telemetryStatus().state,
            ...(telemetryStatus().state === 'active'
              ? { telemetryExporters: telemetryStatus().exporters }
              : { telemetryReason: telemetryStatus().reason }),
          },
          degradedModes: degradedModes(),
          time: new Date().toISOString(),
        };
    if (!ok) throw new ServiceUnavailableException(body);
    return body;
  }
}
