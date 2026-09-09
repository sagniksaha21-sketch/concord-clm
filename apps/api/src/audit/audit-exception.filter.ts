import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  ForbiddenException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuditService } from './audit.service';

/**
 * Records denied access attempts (401/403) to the audit trail — these are thrown
 * by the global guards *before* the audit interceptor runs, so without this they
 * would go unlogged. Security reviewers want failed authorization attempts on the
 * record, so we capture them here and then reproduce the standard error response.
 */
@Catch(UnauthorizedException, ForbiddenException)
export class AuditExceptionFilter implements ExceptionFilter {
  constructor(private readonly audit: AuditService) {}

  catch(exception: HttpException, host: ArgumentsHost): void {
    if (host.getType() !== 'http') throw exception;

    const http = host.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();
    const status = exception.getStatus();
    const method: string = req.method;
    const path: string = (req.originalUrl ?? req.url ?? '').split('?')[0];
    const ip = req.ip || undefined; // trusted (see main.ts 'trust proxy')
    const actor = req.user
      ? { id: req.user.id, email: req.user.email, role: req.user.role }
      : {};

    // Fire-and-forget with an explicit catch: in strict mode `record` throws, and
    // an unhandled rejection here would take the process down while denying a
    // request. The service marks itself degraded, which fails readiness.
    this.audit
      .record({
        actor,
        action: status === 403 ? 'access.forbidden' : 'access.unauthenticated',
        entity: 'security',
        summary: `${status} on ${method} ${path}${
          req.user?.email ? ` (user: ${req.user.email})` : ''
        }`,
        request: { method, path, ip, outcome: 'error' },
        metadata: { status, reason: exception.message },
        correlationId: req.id,
      })
      .catch(() => undefined);

    // Reproduce Nest's default error response.
    const body = exception.getResponse();
    res.status(status).json(typeof body === 'string' ? { statusCode: status, message: body } : body);
  }
}
