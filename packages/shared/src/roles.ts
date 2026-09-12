/**
 * Role-based access control for Concord. Six canonical roles, mapped from the
 * user's stored/Entra role text by `normalizeRole`, each granting a set of
 * permissions checked server-side (NestJS RolesGuard) and surfaced in the UI.
 */

export type Role = 'admin' | 'lead' | 'counsel' | 'approver' | 'viewer' | 'requester';

export type Permission =
  | 'request:read'
  | 'request:write'
  | 'request:manage'
  | 'contract:read'
  | 'contract:write'
  | 'template:write'
  | 'intake:write'
  | 'ingest:write'
  | 'approval:route'
  | 'approve'
  | 'esign:send'
  | 'esign:admin'
  | 'audit:read'
  | 'admin';

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  lead: 'Legal Lead',
  counsel: 'Counsel',
  approver: 'Approver',
  viewer: 'Viewer',
  requester: 'Department client',
};

const READ: Permission[] = ['contract:read'];

export const PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    'request:read', 'request:write', 'request:manage',
    'contract:read', 'contract:write', 'template:write', 'intake:write',
    'ingest:write', 'approval:route', 'approve', 'esign:send', 'esign:admin', 'audit:read', 'admin',
  ],
  lead: [
    'request:read', 'request:write', 'request:manage',
    'contract:read', 'contract:write', 'template:write', 'intake:write',
    'ingest:write', 'approval:route', 'approve', 'esign:send', 'esign:admin', 'audit:read',
  ],
  counsel: ['contract:read', 'contract:write', 'intake:write', 'ingest:write', 'approval:route', 'esign:send', 'request:read', 'request:write', 'request:manage'],
  approver: ['contract:read', 'approve'],
  viewer: READ,
  requester: ['request:read', 'request:write'],
};

/** Maps free-text / Entra role or group names to a canonical role (least-privilege default). */
/**
 * Exact-match mapping from an identity-provider role/group name to a canonical
 * role. Checked BEFORE any fuzzy matching: substring matching alone would let a
 * group called "Read-only Admin" or "Contract Administrator" become full `admin`.
 */
const EXACT_ROLE_MAP: Record<string, Role> = {
  requester: 'requester',
  'department client': 'requester',
  'concord.requester': 'requester',
  admin: 'admin',
  administrator: 'admin',
  'concord.admin': 'admin',
  lead: 'lead',
  'legal lead': 'lead',
  'lead – legal': 'lead',
  'lead - legal': 'lead',
  'concord.lead': 'lead',
  counsel: 'counsel',
  'board counsel': 'counsel',
  legal: 'counsel',
  'concord.counsel': 'counsel',
  approver: 'approver',
  approval: 'approver',
  'concord.approver': 'approver',
  viewer: 'viewer',
  'read-only': 'viewer',
  'concord.viewer': 'viewer',
};

export function normalizeRole(raw?: string): Role {
  const key = (raw ?? '').trim().toLowerCase();
  // hasOwnProperty: a bare lookup would reach Object.prototype, so inputs like
  // "constructor" or "__proto__" would return a non-Role value.
  const exact = Object.prototype.hasOwnProperty.call(EXACT_ROLE_MAP, key)
    ? EXACT_ROLE_MAP[key]
    : undefined;
  if (exact) return exact;
  // Anything not explicitly mapped falls through to the conservative matcher
  // below, which must never grant `admin` on a substring alone.
  return normalizeRoleFuzzy(raw);
}

function normalizeRoleFuzzy(raw?: string): Role {
  const r = (raw || '').toLowerCase();
  // Word-boundary matching: a bare includes('view') also matches "reVIEWer",
  // which would silently downgrade a Contract Reviewer to read-only.
  if (/\breviewer\b/.test(r)) return 'counsel';
  // Least-privilege markers are checked before privileged ones, so
  // "Read-only Admin" resolves to viewer rather than administrator.
  if (/\bview(er|s)?\b|\bread(-only)?\b|\baudit-only\b/.test(r)) return 'viewer';
  if (/\bapprover?s?\b|\bapprovals?\b/.test(r)) return 'approver';
  if (/\blead\b/.test(r)) return 'lead';
  if (/\bcounsel\b|\blawyer\b|\blegal\b/.test(r)) return 'counsel';
  // `admin` is deliberately UNREACHABLE by substring — it must be an exact entry
  // in EXACT_ROLE_MAP. Otherwise an IdP group named "Contract Administrator" or
  // "…Admins" would silently grant full platform administration.
  return 'viewer'; // unknown → least privilege
}

export const ROLES: Role[] = ['admin', 'lead', 'counsel', 'approver', 'viewer', 'requester'];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as string[]).includes(value);
}

export interface ResolvedRole {
  role: Role;
  /** Set when the claims could not be represented by a single role without loss. */
  warning?: string;
}

/**
 * Resolves ONE canonical role from all of an identity provider's role/group
 * claims (finding C-D7).
 *
 * The six roles are not a ladder — `counsel` can draft but not approve,
 * `approver` can approve but not draft — so "take the highest" would silently
 * drop one of a user's two capabilities.
 *
 * The tempting alternative is worse: taking the union of the two permission sets
 * and returning the smallest role that covers it. For counsel+approver that is
 * `lead`, which also carries `template:write`, `esign:admin` and `audit:read` —
 * three permissions **neither Entra group granted**. `audit:read` is the entire
 * immutable trail and `esign:admin` gates the endpoint that drives an envelope
 * to executed. Inventing those from two innocuous group memberships is a
 * privilege escalation, not a convenience.
 *
 * So this NEVER grants a permission that no matched role carried. When no single
 * role covers the claims exactly, it returns the matched role with the widest
 * permission set — always a subset of what the claims granted — and reports a
 * warning so an administrator can assign an explicit role via
 * `PATCH /api/auth/users/:email/role`.
 *
 * `admin` is reachable only from an exact `admin` claim; no claims at all is
 * `viewer`.
 */
export function resolveRoleDetailed(claims: Array<string | undefined | null>): ResolvedRole {
  const present = claims.filter(
    (c): c is string => typeof c === 'string' && c.trim().length > 0,
  );
  if (!present.length) return { role: 'viewer' };

  const matched = present.map((c) => normalizeRole(c));
  if (matched.includes('admin')) return { role: 'admin' };

  const distinct = [...new Set(matched)];
  if (distinct.length === 1) return { role: distinct[0] };

  const union = new Set<Permission>();
  for (const r of distinct) for (const p of PERMISSIONS[r]) union.add(p);
  const needed = [...union];

  // A role that covers the union AND grants nothing beyond it is an exact fit.
  for (const candidate of ['requester', 'viewer', 'approver', 'counsel', 'lead'] as Role[]) {
    const grants = PERMISSIONS[candidate];
    if (needed.every((p) => grants.includes(p)) && grants.length === needed.length) {
      return { role: candidate };
    }
  }

  // No exact fit: fall back to the widest role the user actually holds. This is
  // a subset of their claims, never a superset.
  const widest = distinct.reduce((best, r) =>
    PERMISSIONS[r].length > PERMISSIONS[best].length ? r : best,
  );
  const dropped = needed.filter((p) => !PERMISSIONS[widest].includes(p));
  return {
    role: widest,
    warning:
      `Claims resolve to multiple roles (${distinct.join(', ')}) that no single Concord ` +
      `role represents. Granted "${widest}" — the widest role actually claimed — which ` +
      `does NOT include: ${dropped.join(', ')}. Assign an explicit role via ` +
      'PATCH /api/auth/users/:email/role if this user needs both.',
  };
}

/** Convenience wrapper returning just the role. */
export function resolveRole(claims: Array<string | undefined | null>): Role {
  return resolveRoleDetailed(claims).role;
}

export function can(role: Role, perm: Permission): boolean {
  return PERMISSIONS[role]?.includes(perm) ?? false;
}

/** Roles that hold a given permission — handy for @Roles() decorators. */
export function rolesWith(perm: Permission): Role[] {
  return (Object.keys(PERMISSIONS) as Role[]).filter((r) => can(r, perm));
}
