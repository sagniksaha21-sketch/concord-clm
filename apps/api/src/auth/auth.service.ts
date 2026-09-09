import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AuthUser, LoginResult, ROLES, Role, ROLE_LABELS, isRole, normalizeRole } from '@concord/shared';
import { PrismaService } from '../persistence/prisma.service';
import { AuditService } from '../audit/audit.service';
import { demoLoginEnabled, isProduction } from '../security/security.config';

/**
 * The single canonical form of an email address in this system. Every lookup,
 * every comparison and every write goes through it.
 */
export function normaliseEmail(email?: string | null): string {
  return (email ?? '').trim().toLowerCase();
}

interface StoredUser extends AuthUser {
  password: string;
  /** 'manual' = set by an administrator in Concord; 'sso' = taken from Entra claims. */
  roleSource?: string;
}

export interface ManagedUser {
  id: string;
  email: string;
  name: string;
  role: string;
  canonicalRole: Role;
  roleLabel: string;
  roleSource: string;
}

/**
 * Email/password auth for the legal team. Users come from Postgres when Prisma
 * is enabled, otherwise from a seeded in-memory list (demo password: "concord").
 * Production should front this with Microsoft Entra ID SSO.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly secret = process.env.AUTH_JWT_SECRET ?? 'dev-secret-change-me';

  private readonly demoUsers: StoredUser[] = [
    {
      id: 'u-demo-admin',
      email: normaliseEmail(process.env.DEMO_USER_EMAIL ?? 'concord.admin@example.test'),
      name: process.env.DEMO_USER_NAME ?? 'Concord Demo Administrator',
      role: 'admin',
      password: bcrypt.hashSync(process.env.SEED_USER_PASSWORD ?? 'concord', 8),
    },
    {
      id: 'u-demo-reviewer',
      email: normaliseEmail(process.env.DEMO_REVIEWER_EMAIL ?? 'concord.reviewer@example.test'),
      name: process.env.DEMO_REVIEWER_NAME ?? 'Concord Demo Reviewer',
      role: 'viewer',
      password: bcrypt.hashSync(process.env.SEED_USER_PASSWORD ?? 'concord', 8),
    },
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Emails that are always platform administrators, from configuration.
   *
   * Without this the system has a chicken-and-egg problem: role assignment is an
   * admin-only endpoint, but SSO never mints an admin, so the very first
   * administrator could only be created with direct SQL against production
   * (finding C-D7). This makes that first grant a reviewed configuration change
   * instead, and it is re-applied on every sign-in so it cannot be revoked from
   * inside the app.
   */
  private bootstrapAdmins(): string[] {
    return (process.env.ADMIN_BOOTSTRAP_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }

  isBootstrapAdmin(email: string): boolean {
    return this.bootstrapAdmins().includes(normaliseEmail(email));
  }

  private async findByEmail(email: string): Promise<StoredUser | null> {
    const key = normaliseEmail(email);
    if (this.prisma.enabled) {
      const u = await this.prisma.client.user.findUnique({ where: { email: key } });
      return u
        ? { id: u.id, email: u.email, name: u.name, role: u.role, password: u.password, roleSource: u.roleSource }
        : null;
    }
    // Seeded demo accounts are only usable when demo login is enabled (never in
    // production unless explicitly opted in) — production runs on Entra ID SSO.
    if (!demoLoginEnabled()) return null;
    return this.demoUsers.find((u) => normaliseEmail(u.email) === key) ?? null;
  }

  async login(email: string, password: string): Promise<LoginResult> {
    // Production is SSO-only. Keeping the password endpoint alive against the
    // production user table would create a second authentication surface without
    // Entra MFA / Conditional Access, even though the UI no longer exposes it.
    if (isProduction()) {
      throw new UnauthorizedException('Password sign-in is disabled. Use Microsoft SSO.');
    }
    const user = await this.findByEmail(email);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      await this.audit.record({
        action: 'auth.login_failed',
        entity: 'user',
        summary: `Failed login attempt for ${email}`,
        metadata: { email }, // never the password
      });
      throw new UnauthorizedException('Invalid email or password');
    }
    const role = this.isBootstrapAdmin(user.email) ? 'admin' : user.role;
    const pub: AuthUser = { id: user.id, email: user.email, name: user.name, role };
    await this.audit.record({
      actor: { id: user.id, email: user.email, role },
      action: 'auth.login',
      entity: 'user',
      entityId: user.id,
      summary: `${user.name} signed in`,
      metadata: { canonicalRole: normalizeRole(role) },
    });
    return { user: pub };
  }

  issueToken(user: AuthUser): string {
    return jwt.sign(user, this.secret, {
      expiresIn: '8h',
      algorithm: 'HS256',
      issuer: 'concord-api',
      audience: 'concord-web',
    });
  }

  /**
   * Creates/updates a user from SSO claims.
   *
   * A role an administrator set inside Concord (`roleSource = 'manual'`) is NOT
   * overwritten by a later SSO sign-in — otherwise a deliberate promotion would
   * silently revert the next morning. Claims win for everyone else, so removing
   * someone from an Entra group takes effect on their next sign-in.
   */
  async upsertUser(
    rawEmail: string,
    name: string,
    role = 'viewer',
    roleSource: 'sso' | 'manual' = 'sso',
  ): Promise<AuthUser> {
    // Entra's `preferred_username` preserves the casing the user typed, and
    // Postgres `text` equality is case-sensitive. Storing "Priya.Sharma@..."
    // while every lookup uses the lower-cased form made that account invisible
    // to role assignment AND to approver authorization — permanently, from
    // inside the app. One canonical form, chosen at the boundary.
    const email = normaliseEmail(rawEmail);
    const effectiveRole = this.isBootstrapAdmin(email) ? 'admin' : role;
    if (this.prisma.enabled) {
      const existing = await this.prisma.client.user.findUnique({ where: { email } });
      const keepManual =
        existing?.roleSource === 'manual' && roleSource === 'sso' && !this.isBootstrapAdmin(email);
      const u = await this.prisma.client.user.upsert({
        where: { email },
        update: keepManual
          ? { name }
          : { name, role: effectiveRole, roleSource: this.isBootstrapAdmin(email) ? 'bootstrap' : roleSource },
        create: {
          email,
          name,
          role: effectiveRole,
          roleSource: this.isBootstrapAdmin(email) ? 'bootstrap' : roleSource,
          password: '',
        },
      });
      if (existing && !keepManual && existing.role !== u.role) {
        await this.audit.record({
          actor: { id: u.id, email: u.email, role: u.role },
          action: 'auth.role_synced',
          entity: 'user',
          entityId: u.id,
          summary: `${u.email} role changed ${existing.role} → ${u.role} from identity-provider claims`,
          metadata: { from: existing.role, to: u.role, source: roleSource },
        });
      }
      return { id: u.id, email: u.email, name: u.name, role: u.role };
    }
    return { id: `sso-${email}`, email, name, role: effectiveRole };
  }


  /**
   * Re-authorize a signed token against the current user record. This makes role
   * demotion/account removal effective immediately instead of waiting up to the
   * JWT's eight-hour expiry. Production always has Postgres; dev keeps the
   * token-only path for the demo.
   */
  async authorizeToken(token: string): Promise<AuthUser> {
    const claims = this.verify(token);
    if (!this.prisma.enabled) return claims;
    const email = normaliseEmail(claims.email);
    const row = await this.prisma.client.user.findUnique({ where: { email } });
    if (!row) throw new UnauthorizedException('Account is no longer authorized');
    const role = this.isBootstrapAdmin(email) ? 'admin' : row.role;
    return { id: row.id, email: row.email, name: row.name, role };
  }

  verify(token: string): AuthUser {
    try {
      return jwt.verify(token, this.secret, {
        algorithms: ['HS256'],
        issuer: 'concord-api',
        audience: 'concord-web',
      }) as AuthUser;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  /** Returns the stored role for an email (for approver authorization), or null. */
  /** True only for an administrator/bootstrap grant that exists independently of current Entra claims. */
  async hasExplicitManualAccess(email: string): Promise<boolean> {
    const key = normaliseEmail(email);
    if (this.isBootstrapAdmin(key)) return true;
    if (!this.prisma.enabled) return false;
    const u = await this.prisma.client.user.findUnique({ where: { email: key }, select: { roleSource: true } });
    return u?.roleSource === 'manual' || u?.roleSource === 'bootstrap';
  }

  async findRole(email: string): Promise<string | null> {
    if (this.isBootstrapAdmin(email)) return 'admin';
    if (this.prisma.enabled) {
      const u = await this.prisma.client.user.findUnique({ where: { email: normaliseEmail(email) } });
      return u?.role ?? null;
    }
    const u = await this.findByEmail(email);
    return u?.role ?? null;
  }

  // ─── Role management (admin only; wired in AuthController) ──────────────────

  private toManaged = (u: any): ManagedUser => {
    // Explicit field list — never spread a user row into a response, or a later
    // schema addition (a password hash, a token) ships to the client for free.
    const canonical = normalizeRole(u.role);
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      canonicalRole: canonical,
      roleLabel: ROLE_LABELS[canonical],
      roleSource: u.roleSource ?? 'sso',
    };
  };

  async listUsers(): Promise<ManagedUser[]> {
    if (this.prisma.enabled) {
      const rows = await this.prisma.client.user.findMany({ orderBy: { email: 'asc' } });
      return rows.map(this.toManaged);
    }
    return this.demoUsers.map(this.toManaged);
  }

  /**
   * Assigns a canonical role to a user. This is the endpoint that makes an
   * approver exist without touching the database by hand.
   */
  async setRole(email: string, role: string, actor?: AuthUser): Promise<ManagedUser> {
    const target = normaliseEmail(email);
    if (!target) throw new BadRequestException('An email is required.');
    if (!isRole(role)) {
      throw new BadRequestException(`Role must be one of: ${ROLES.join(', ')}.`);
    }
    if (this.isBootstrapAdmin(target) && role !== 'admin') {
      throw new BadRequestException(
        `${target} is a configured bootstrap administrator (ADMIN_BOOTSTRAP_EMAILS) and ` +
          'cannot be demoted from inside the application. Change the configuration instead.',
      );
    }

    if (!this.prisma.enabled) {
      const u = this.demoUsers.find((d) => normaliseEmail(d.email) === target);
      if (!u) throw new NotFoundException(`No user ${email}`);
      const previous = u.role;
      u.role = role;
      u.roleSource = 'manual';
      await this.auditRoleChange(target, previous, role, actor);
      return this.toManaged(u);
    }

    const existing = await this.prisma.client.user.findUnique({ where: { email: target } });
    if (!existing) throw new NotFoundException(`No user ${email}`);
    const updated = await this.prisma.client.user.update({
      where: { email: target },
      data: { role, roleSource: 'manual' },
    });
    await this.auditRoleChange(target, existing.role, role, actor);
    return this.toManaged(updated);
  }

  private async auditRoleChange(
    email: string,
    from: string,
    to: string,
    actor?: AuthUser,
  ): Promise<void> {
    this.logger.log(`Role change ${email}: ${from} → ${to} by ${actor?.email ?? 'unknown'}`);
    await this.audit.record({
      actor: actor ? { id: actor.id, email: actor.email, role: actor.role } : {},
      action: 'auth.role_assigned',
      entity: 'user',
      entityId: email,
      summary: `${email} role changed ${from} → ${to} by ${actor?.email ?? 'an administrator'}`,
      metadata: { email, from, to, assignedBy: actor?.email },
    });
  }
}
