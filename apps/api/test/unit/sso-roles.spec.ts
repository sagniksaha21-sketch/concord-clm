import { PERMISSIONS, resolveRole, resolveRoleDetailed } from '@concord/shared';
import { EntraService } from '../../src/auth/entra.service';

/**
 * Finding C-D7 — "nobody can approve anything via SSO".
 *
 * EntraService returned only name and email; the caller read a `role` field that
 * was never populated, so every SSO user was created with the default. That
 * default normalised to `counsel`, and `counsel` correctly lacks `approve`, so
 * the approval callback rejected every real approver. These tests pin the claim
 * extraction, the mapping, and the least-privilege behaviour.
 */
describe('SSO role claims (C-D7)', () => {
  const svc = new EntraService();
  const ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...ENV };
  });

  it('extracts app-role, group and single-role claims from an id token', () => {
    expect(
      svc.extractRoleClaims({
        roles: ['Concord.Approver', 'Concord.Counsel'],
        groups: ['4f0c9a11-1111-2222-3333-444455556666'],
        name: 'Someone',
      }),
    ).toEqual([
      'Concord.Approver',
      'Concord.Counsel',
      '4f0c9a11-1111-2222-3333-444455556666',
    ]);

    // Some tenants emit a bare string instead of an array.
    expect(svc.extractRoleClaims({ role: 'Concord.Lead' })).toEqual(['Concord.Lead']);
    expect(svc.extractRoleClaims({})).toEqual([]);
  });

  it('resolves an app-role claim to the matching canonical role', () => {
    expect(svc.resolveFromClaims(['Concord.Approver'])).toEqual({
      role: 'approver',
      roleSource: 'claims',
    });
    expect(svc.resolveFromClaims(['Concord.Lead']).role).toBe('lead');
  });

  it('translates opaque group GUIDs through ENTRA_ROLE_MAP', () => {
    const gid = '4f0c9a11-1111-2222-3333-444455556666';
    process.env.ENTRA_ROLE_MAP = JSON.stringify({ [gid]: 'approver' });
    expect(svc.resolveFromClaims([gid])).toEqual({ role: 'approver', roleSource: 'claims' });
  });

  it('falls back to the configured default when nothing is recognised', () => {
    const gid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    delete process.env.ENTRA_ROLE_MAP;
    // No map entry, no readable name → default (viewer unless configured).
    expect(svc.resolveFromClaims([gid])).toEqual({ role: 'viewer', roleSource: 'default' });
    process.env.ENTRA_DEFAULT_ROLE = 'counsel';
    expect(svc.resolveFromClaims([gid])).toEqual({ role: 'counsel', roleSource: 'default' });
  });

  it('ignores a malformed ENTRA_ROLE_MAP instead of crashing sign-in', () => {
    process.env.ENTRA_ROLE_MAP = '{not json';
    expect(() => svc.resolveFromClaims(['Concord.Approver'])).not.toThrow();
    expect(svc.resolveFromClaims(['Concord.Approver']).role).toBe('approver');
  });

  it('defaults to least privilege, and never infers admin', () => {
    expect(svc.defaultRole).toBe('viewer');
    process.env.ENTRA_ROLE_MAP = JSON.stringify({ 'Some.Group': 'Contract Administrator' });
    expect(svc.resolveFromClaims(['Some.Group']).role).not.toBe('admin');
  });
});

describe('resolveRole — never grants more than the claims did', () => {
  it('does NOT invent permissions when combining two group claims', () => {
    // Returning the smallest role that COVERS counsel+approver means `lead`,
    // which also carries template:write, esign:admin and audit:read — three
    // permissions neither Entra group granted. audit:read is the whole immutable
    // trail; esign:admin gates the endpoint that drives an envelope to executed.
    // Inventing those from two innocuous group memberships is privilege
    // escalation, so resolution must stay within what was actually claimed.
    const claimed = new Set([...PERMISSIONS.counsel, ...PERMISSIONS.approver]);
    const { role, warning } = resolveRoleDetailed(['Concord.Counsel', 'Concord.Approver']);

    for (const p of PERMISSIONS[role]) {
      expect(claimed.has(p)).toBe(true); // nothing granted that wasn't claimed
    }
    expect(role).not.toBe('lead');
    expect(role).not.toBe('admin');
    // The shortfall is reported rather than silently papered over.
    expect(warning).toMatch(/does NOT include/i);
    expect(warning).toMatch(/PATCH \/api\/auth\/users/);
  });

  it('picks the widest role the user actually holds', () => {
    // counsel carries strictly more than approver, so counsel is the honest
    // answer — and an administrator is told that `approve` is missing.
    expect(resolveRole(['Concord.Counsel', 'Concord.Approver'])).toBe('counsel');
  });

  it('returns an exact fit with no warning when one exists', () => {
    const { role, warning } = resolveRoleDetailed(['Concord.Viewer', 'Concord.Viewer']);
    expect(role).toBe('viewer');
    expect(warning).toBeUndefined();
  });

  it('does not escalate a single claim', () => {
    expect(resolveRole(['Concord.Counsel'])).toBe('counsel');
    expect(resolveRole(['Concord.Approver'])).toBe('approver');
    expect(resolveRole(['Concord.Viewer'])).toBe('viewer');
  });

  it('returns viewer with no claims at all', () => {
    expect(resolveRole([])).toBe('viewer');
    expect(resolveRole([undefined, null, '  '])).toBe('viewer');
  });

  it('grants admin only on an exact admin claim', () => {
    expect(resolveRole(['Concord.Admin'])).toBe('admin');
    expect(resolveRole(['Contract Administrator'])).not.toBe('admin');
    expect(resolveRole(['Legal Admins', 'Concord.Counsel'])).not.toBe('admin');
  });
});
