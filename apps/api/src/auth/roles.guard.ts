import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission, can, normalizeRole } from '@concord/shared';
import { PERMS_KEY, PUBLIC_KEY } from './rbac';

/**
 * Global authorization guard. When a route declares `@Roles(...permissions)`,
 * the authenticated user's canonical role must hold all of them, else 403.
 * Routes with no `@Roles` require only authentication (any signed-in user).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()])) return true;
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    // Legacy authenticated routes belong to the legal workspace. Department
    // accounts must use explicitly declared routes, including their own inbox.
    if (!required && user && normalizeRole(user.role) === 'requester') {
      throw new ForbiddenException('This area is available to the legal workspace only.');
    }
    if (!required || required.length === 0) return true;
    if (!user) throw new UnauthorizedException('Authentication required');

    const role = normalizeRole(user.role);
    const ok = required.every((p) => can(role, p));
    if (!ok) {
      throw new ForbiddenException(
        `Insufficient permissions — requires ${required.join(', ')} (your role: ${role})`,
      );
    }
    return true;
  }
}
