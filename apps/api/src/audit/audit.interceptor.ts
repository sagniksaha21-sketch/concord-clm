import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditService } from './audit.service';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Baseline audit coverage: records one immutable event for every mutating HTTP
 * request (who, when, method+path, outcome), so nothing that changes state is
 * unlogged. Services add richer semantic events (with AI provenance) on top —
 * this guarantees the floor.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const type = ctx.getType();
    if (type !== 'http') return next.handle();

    const req = ctx.switchToHttp().getRequest();
    const method: string = req.method;
    if (!MUTATING.has(method)) return next.handle();

    const path: string = req.originalUrl ?? req.url ?? '';
    const entity = this.entityFromPath(path);
    const actor = req.user
      ? { id: req.user.id, email: req.user.email, role: req.user.role }
      : {};
    // req.ip only: 'trust proxy' makes it authoritative, whereas X-Forwarded-For
    // is client-supplied and would make every forensic IP falsifiable.
    const ip = req.ip || undefined;

    // The baseline event is recorded AFTER the handler has already run, so a
    // failure here cannot un-do the mutation and must not be rethrown into the
    // response pipeline (in strict mode `record` throws). It is caught here;
    // `AuditService` has already marked itself degraded, which fails readiness
    // and takes this replica out of rotation.
    const emit = (outcome: 'ok' | 'error') => {
      this.audit
        .record({
          actor,
          action: `request.${method.toLowerCase()}`,
          entity,
          summary: `${method} ${this.stripQuery(path)}`,
          request: { method, path: this.stripQuery(path), ip, outcome },
          correlationId: req.id,
        })
        .catch(() => undefined);
    };

    return next.handle().pipe(
      tap({
        error: () => emit('error'),
        complete: () => emit('ok'),
      }),
    );
  }

  /** First path segment after `/api/` → entity name (e.g. /api/esign/x → esign). */
  private entityFromPath(path: string): string {
    const m = path.replace(/^\/+/, '').match(/^api\/([^/?]+)/);
    return m ? m[1] : 'api';
  }

  private stripQuery(path: string): string {
    const i = path.indexOf('?');
    return i >= 0 ? path.slice(0, i) : path;
  }
}
