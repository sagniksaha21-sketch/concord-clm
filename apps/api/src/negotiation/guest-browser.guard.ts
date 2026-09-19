import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { GuestAuthService, guestRequestToken } from './guest-auth.service';
@Injectable()
export class GuestBrowserGuard implements CanActivate {
  constructor(private readonly auth: GuestAuthService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(req.params.invitationId)) throw new NotFoundException('Review room not found.');
    if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
      const allowed = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',').map(s => s.trim().replace(/\/$/,''));
      if (!allowed.includes(String(req.headers.origin ?? '').replace(/\/$/,''))) throw new ForbiddenException('Open this action from the Concord review room.');
    }
    if (!/\/(challenge|verify)\/?$/.test(req.path)) {
      await this.auth.authenticate(req.params.invitationId,guestRequestToken(req,req.params.invitationId));
      if (!['GET','HEAD','OPTIONS'].includes(req.method)) await this.auth.actionLimit(req.params.invitationId);
    }
    return true;
  }
}
