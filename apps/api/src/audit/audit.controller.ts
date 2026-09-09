import { Controller, Get, Query, Res } from '@nestjs/common';
import { AuditService } from './audit.service';
import { Roles } from '../auth/rbac';

/**
 * Read-only access to the immutable audit trail. Restricted to `audit:read`
 * (admin + legal lead). The log itself is written by the interceptor and by
 * domain services — there is deliberately no write endpoint.
 */
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /**
   * Recent events, most recent first. Filtering and paging are pushed into the
   * database (finding C-D5) — this endpoint previously read the entire audit
   * table into memory on every call, which grows without bound.
   *
   * `limit` is capped at 1000; use `offset` to page. The response carries the
   * total so a client can page without fetching everything first.
   */
  @Roles('audit:read')
  @Get()
  async list(
    @Query('entity') entity?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const parsedLimit = Number(limit);
    const parsedOffset = Number(offset);
    const take = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 1000) : 200;
    const skip = Number.isFinite(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0;
    const filter = { entity, entityId, action };
    const [events, total] = await Promise.all([
      this.audit.list({ ...filter, limit: take, offset: skip }),
      this.audit.count(filter),
    ]);
    return { total, limit: take, offset: skip, count: events.length, events };
  }

  /** Tamper-evidence check — recomputes the whole hash chain. */
  @Roles('audit:read')
  @Get('verify')
  verify() {
    return this.audit.verify();
  }

  /** Full chain export (ordered) with an integrity attestation, as a download. */
  @Roles('audit:read')
  @Get('export')
  async export(@Res({ passthrough: true }) res: { set: (h: Record<string, string>) => void }) {
    const [events, total, verification] = await Promise.all([
      this.audit.all(),
      this.audit.count(),
      this.audit.verify(),
    ]);
    const truncated = events.length < total;
    res.set({
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="concord-audit-${new Date()
        .toISOString()
        .slice(0, 10)}.json"`,
    });
    return { exportedAt: new Date().toISOString(), verification, total, exported: events.length, truncated, events };
  }
}
