import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  RequestTimeoutException,
} from '@nestjs/common';
import { Observable, TimeoutError, throwError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

/**
 * Caps request duration so a stuck upstream (OCR, AI, Graph) cannot hold a
 * request open indefinitely. Generous default (120s) so legitimate long OCR/AI
 * calls still complete; tune with REQUEST_TIMEOUT_MS.
 */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  private readonly ms = Number(process.env.REQUEST_TIMEOUT_MS || 120000);

  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      timeout(this.ms),
      catchError((err) =>
        err instanceof TimeoutError
          ? throwError(() => new RequestTimeoutException('Request timed out'))
          : throwError(() => err),
      ),
    );
  }
}
