import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PERMISSIONS, ROLES, ROLE_LABELS, normalizeRole } from '@concord/shared';
import { AuthService } from './auth.service';
import { EntraService } from './entra.service';
import { LoginDto } from './login.dto';
import { SetRoleDto } from './set-role.dto';
import { Public, Roles } from './rbac';

function readCookie(req: any, name: string): string | undefined {
  const header: string = req?.headers?.cookie ?? '';
  const m = header.match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : undefined;
}

function sessionCookie(token: string): string {
  const prod = process.env.NODE_ENV === 'production';
  const domain = process.env.AUTH_COOKIE_DOMAIN ? `; Domain=${process.env.AUTH_COOKIE_DOMAIN}` : '';
  return `concord_token=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=28800; SameSite=Lax${prod ? '; Secure' : ''}${domain}`;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly entra: EntraService,
  ) {}

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: any) {
    const result = await this.auth.login(dto.email, dto.password);
    res.setHeader('Set-Cookie', sessionCookie(this.auth.issueToken(result.user)));
    return result;
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: any) {
    const domain = process.env.AUTH_COOKIE_DOMAIN ? `; Domain=${process.env.AUTH_COOKIE_DOMAIN}` : '';
    res.setHeader('Set-Cookie', `concord_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}${domain}`);
    return { ok: true };
  }

  /** Returns the authenticated user (populated by the global auth guard). */
  @Get('me')
  me(@Req() req: any) {
    return req.user;
  }

  /**
   * The signed-in user's effective permissions — canonical role, its label,
   * and the permission set RolesGuard enforces. The UI uses this to show only
   * the actions the user is allowed to take.
   */
  @Get('permissions')
  permissions(@Req() req: any) {
    const role = normalizeRole(req.user?.role);
    return { role, label: ROLE_LABELS[role], permissions: PERMISSIONS[role] };
  }

  // ─── Role management (finding C-D7) ─────────────────────────────────────────

  /** Every user and the canonical role they currently hold. Admin only. */
  @Roles('admin')
  @Get('users')
  users() {
    return this.auth.listUsers();
  }

  /** The canonical roles an administrator can assign, with their permissions. */
  @Roles('admin')
  @Get('roles')
  roles() {
    return ROLES.map((role) => ({
      role,
      label: ROLE_LABELS[role],
      permissions: PERMISSIONS[role],
    }));
  }

  /**
   * Assigns a canonical role. Without this the only way to create an approver
   * was direct SQL against the production database, because SSO minted no role
   * claim and every user landed on `counsel` — which correctly cannot approve.
   */
  @Roles('admin')
  @Patch('users/:email/role')
  setRole(@Param('email') email: string, @Body() dto: SetRoleDto, @Req() req: any) {
    return this.auth.setRole(decodeURIComponent(email), dto.role, req.user);
  }

  // ─── Entra ID SSO ───────────────────────────────────────────────────────────

  @Public()
  @Get('sso/login')
  async ssoLogin(@Res() res: any) {
    if (!this.entra.enabled) {
      res.status(501).send('Entra SSO not configured (set ENTRA_* env vars).');
      return;
    }
    const state = randomUUID();
    res.setHeader(
      'Set-Cookie',
      `sso_state=${state}; HttpOnly; Max-Age=600; Path=/; SameSite=Lax${
        process.env.NODE_ENV === 'production' ? '; Secure' : ''
      }`,
    );
    res.redirect(await this.entra.getAuthUrl(state));
  }

  @Public()
  @Get('sso/callback')
  async ssoCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: any,
    @Res() res: any,
  ) {
    const expected = readCookie(req, 'sso_state');
    // Require the state cookie: treating a missing cookie as "nothing to compare"
    // makes the CSRF check optional for anyone who can strip it.
    if (!expected || !state || expected !== state) {
      res.status(400).send('State mismatch');
      return;
    }
    const claims = await this.entra.acquireByCode(code);
    if (process.env.NODE_ENV === 'production' && claims.roleSource === 'default' && process.env.ENTRA_ALLOW_UNMAPPED_VIEWERS !== 'true') {
      // An explicit Concord administrator grant is allowed to survive a tenant
      // that does not emit app-role claims. A role learned from a PREVIOUS SSO
      // claim is not: removing a user from the Entra group must remove access.
      if (!(await this.auth.hasExplicitManualAccess(claims.email))) {
        throw new ForbiddenException('Your Entra account is authenticated but is not assigned a Concord role. Ask an administrator to grant explicit access.');
      }
    }
    // The role now comes from the identity provider's own app-role/group claims
    // (see EntraService), not from a field that was never populated.
    const user = await this.auth.upsertUser(claims.email, claims.name, claims.role, 'sso');
    const token = this.auth.issueToken(user);
    const webOrigin = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',')[0];
    res.setHeader('Set-Cookie', [sessionCookie(token), `sso_state=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`]);
    res.redirect(`${webOrigin}/intake`);
  }
}
