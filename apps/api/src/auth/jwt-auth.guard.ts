import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { PUBLIC_KEY } from './rbac';

/**
 * Global authentication guard. Every route requires a valid login/SSO JWT
 * unless marked `@Public()`. The token is read from the `Authorization: Bearer`
 * header or the `concord_token` cookie; the decoded user is attached to
 * `req.user` for RolesGuard and the audit trail.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const token = this.extractToken(req);
    if (!token) throw new UnauthorizedException('Authentication required');
    req.user = await this.auth.authorizeToken(token); // also enforces current role/account state
    return true;
  }

  private extractToken(req: any): string | null {
    const header = String(req.headers['authorization'] ?? '');
    if (/^Bearer\s+/i.test(header)) return header.replace(/^Bearer\s+/i, '').trim();
    const cookie = String(req.headers['cookie'] ?? '');
    const m = cookie.match(/(?:^|;\s*)concord_token=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
}
