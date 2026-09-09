import { Injectable, Logger } from '@nestjs/common';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { Role, normalizeRole, resolveRoleDetailed } from '@concord/shared';

export interface EntraClaims {
  name: string;
  email: string;
  /** Raw app-role / group claims exactly as Entra returned them (for audit). */
  rawClaims: string[];
  /** The canonical Concord role those claims resolve to. */
  role: Role;
  /** How the role was reached — useful when an approver reports a 403. */
  roleSource: 'claims' | 'default';
}

/**
 * Microsoft Entra ID (Azure AD) SSO via the OAuth2 authorization-code flow.
 * Enabled when the ENTRA_* env vars are set; otherwise the demo password login
 * remains the way in.
 *
 * ## Role claims (finding C-D7)
 *
 * This service previously returned only `name` and `email`. The caller looked
 * for a `role` that was never populated, so every SSO user was created with the
 * default — which normalises to `counsel`, and `counsel` correctly lacks
 * `approve`. The practical effect was that **nobody could approve anything via
 * SSO**, and the only way to create an approver was direct SQL.
 *
 * Entra returns app-role assignments in the `roles` claim and (when the app
 * registration requests it) group membership in `groups`. App roles come through
 * as readable names, so they map straight through `normalizeRole`. Group claims
 * are objectIds — GUIDs carry no meaning, so they must be translated by
 * `ENTRA_ROLE_MAP`, a JSON object of claim → canonical role, e.g.
 *
 *   ENTRA_ROLE_MAP={"1f3c…-…":"approver","Concord.Leads":"lead"}
 *
 * Unmapped claims fall through to `normalizeRole`. Claims that resolve to
 * nothing recognisable fall back to `ENTRA_DEFAULT_ROLE`, which defaults to
 * `viewer`; raising it grants that role to every unmapped user in the tenant,
 * which is warned about at sign-in and flagged by the boot posture check.
 *
 * Multiple claims never combine into MORE than the claims granted — see
 * `resolveRoleDetailed` in @concord/shared.
 */
@Injectable()
export class EntraService {
  private readonly logger = new Logger(EntraService.name);
  private client: ConfidentialClientApplication | null = null;
  readonly scopes = ['openid', 'profile', 'email', 'User.Read'];

  get redirectUri(): string {
    return process.env.ENTRA_REDIRECT_URI ?? '';
  }

  get enabled(): boolean {
    return Boolean(
      process.env.ENTRA_TENANT_ID &&
        process.env.ENTRA_CLIENT_ID &&
        process.env.ENTRA_CLIENT_SECRET &&
        this.redirectUri,
    );
  }

  /** Least-privilege default for a user whose claims map to nothing we know. */
  get defaultRole(): Role {
    const raw = process.env.ENTRA_DEFAULT_ROLE;
    return raw ? normalizeRole(raw) : 'viewer';
  }

  /** Operator-supplied claim → canonical role translation (JSON object). */
  private roleMap(): Record<string, string> {
    const raw = process.env.ENTRA_ROLE_MAP;
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
      return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [k.trim().toLowerCase(), String(v)]),
      );
    } catch (e) {
      this.logger.error(
        `ENTRA_ROLE_MAP is not valid JSON (${String(e)}) — ignoring it. SSO users will ` +
          `fall back to ${this.defaultRole}.`,
      );
      return {};
    }
  }

  /**
   * Pulls every role-bearing claim out of an id token. Exposed (and pure) so it
   * can be unit-tested without a tenant.
   */
  extractRoleClaims(claims: Record<string, unknown>): string[] {
    const out: string[] = [];
    for (const key of ['roles', 'groups', 'wids']) {
      const v = claims[key];
      if (Array.isArray(v)) out.push(...v.map((x) => String(x)));
      else if (typeof v === 'string' && v.trim()) out.push(v);
    }
    // Some tenants emit a single "role" string instead of the array form.
    if (typeof claims.role === 'string' && claims.role.trim()) out.push(claims.role);
    return out;
  }

  /** Translates raw claims through ENTRA_ROLE_MAP, then resolves one role. */
  resolveFromClaims(rawClaims: string[]): { role: Role; roleSource: 'claims' | 'default' } {
    if (!rawClaims.length) return { role: this.defaultRole, roleSource: 'default' };
    const map = this.roleMap();
    const translated = rawClaims.map((c) => map[c.trim().toLowerCase()] ?? c);
    // A claim set the operator never mapped, and that resolves to nothing
    // recognisable, falls back to ENTRA_DEFAULT_ROLE — which is `viewer` unless
    // an operator deliberately raised it. Raising it grants that role to EVERY
    // unmapped user in the tenant, so it is warned about at boot.
    const anyRecognised = translated.some(
      (c, i) => map[rawClaims[i].trim().toLowerCase()] !== undefined || normalizeRole(c) !== 'viewer',
    );
    if (!anyRecognised) {
      if (this.defaultRole !== 'viewer') {
        this.logger.warn(
          `No recognised role claim; falling back to ENTRA_DEFAULT_ROLE="${this.defaultRole}". ` +
            'Every unmapped user in the tenant receives this role — prefer ENTRA_ROLE_MAP.',
        );
      }
      return { role: this.defaultRole, roleSource: 'default' };
    }
    const resolved = resolveRoleDetailed(translated);
    if (resolved.warning) this.logger.warn(resolved.warning);
    return { role: resolved.role, roleSource: 'claims' };
  }

  private cca(): ConfidentialClientApplication {
    if (!this.client) {
      this.client = new ConfidentialClientApplication({
        auth: {
          clientId: process.env.ENTRA_CLIENT_ID!,
          authority: `https://login.microsoftonline.com/${process.env.ENTRA_TENANT_ID}`,
          clientSecret: process.env.ENTRA_CLIENT_SECRET!,
        },
      });
    }
    return this.client;
  }

  getAuthUrl(state: string): Promise<string> {
    return this.cca().getAuthCodeUrl({
      scopes: this.scopes,
      redirectUri: this.redirectUri,
      state,
    });
  }

  async acquireByCode(code: string): Promise<EntraClaims> {
    const res = await this.cca().acquireTokenByCode({
      code,
      scopes: this.scopes,
      redirectUri: this.redirectUri,
    });
    const claims = (res.idTokenClaims ?? {}) as Record<string, unknown>;
    const email =
      (claims.preferred_username as string) ||
      (claims.email as string) ||
      res.account?.username ||
      '';
    const name = (claims.name as string) || res.account?.name || email;
    const rawClaims = this.extractRoleClaims(claims);
    const { role, roleSource } = this.resolveFromClaims(rawClaims);
    this.logger.log(
      `SSO sign-in ${email} → role "${role}" (${roleSource}; claims: ${
        rawClaims.length ? rawClaims.join(', ') : 'none'
      })`,
    );
    return { name, email, rawClaims, role, roleSource };
  }
}
