import { normalizeRole, can, PERMISSIONS, rolesWith, ROLE_LABELS } from '@concord/shared';

describe('RBAC roles & permission matrix', () => {
  it('normalizes identity/role strings to canonical roles', () => {
    expect(normalizeRole('Lead – Legal')).toBe('lead');
    expect(normalizeRole('Board Counsel')).toBe('counsel');
    expect(normalizeRole('Administrator')).toBe('admin');
    expect(normalizeRole('Approver')).toBe('approver');
    expect(normalizeRole('read-only viewer')).toBe('viewer');
    expect(normalizeRole(undefined)).toBe('viewer'); // safe default
    expect(normalizeRole('something unknown')).toBe('viewer');
  });

  it('enforces least privilege for viewers', () => {
    expect(can('viewer', 'contract:read')).toBe(true);
    expect(can('viewer', 'contract:write')).toBe(false);
    expect(can('viewer', 'approve')).toBe(false);
    expect(can('viewer', 'audit:read')).toBe(false);
    expect(PERMISSIONS.viewer).toEqual(['contract:read']);
  });

  it('separates duties: counsel drafts but cannot approve; approver approves but cannot draft', () => {
    expect(can('counsel', 'contract:write')).toBe(true);
    expect(can('counsel', 'approve')).toBe(false);
    expect(can('counsel', 'approval:route')).toBe(true);
    expect(can('approver', 'approve')).toBe(true);
    expect(can('approver', 'approval:route')).toBe(false);
    expect(can('approver', 'contract:write')).toBe(false);
    expect(can('approver', 'template:write')).toBe(false);
  });

  it('routes approval without granting approval authority', () => {
    expect(rolesWith('approval:route').sort()).toEqual(['admin', 'counsel', 'lead']);
  });

  it('restricts audit reads to lead and admin only', () => {
    const readers = rolesWith('audit:read').sort();
    expect(readers).toEqual(['admin', 'lead']);
  });

  it('grants admin the platform-admin permission and lead the approval authority', () => {
    expect(can('admin', 'admin')).toBe(true);
    expect(can('lead', 'admin')).toBe(false);
    expect(can('lead', 'approve')).toBe(true);
    expect(rolesWith('approve')).toEqual(expect.arrayContaining(['admin', 'lead', 'approver']));
    expect(rolesWith('approve')).not.toContain('counsel');
    expect(rolesWith('approve')).not.toContain('viewer');
  });

  it('does not grant admin from a substring (privilege-escalation regression)', () => {
    // An IdP group name must never escalate to platform admin by containing "admin".
    expect(normalizeRole('Contract Administrator')).not.toBe('admin');
    expect(normalizeRole('Read-only Admin')).toBe('viewer');
    expect(normalizeRole('Legal Admins')).not.toBe('admin');
    // Exact, intended mappings still work.
    expect(normalizeRole('admin')).toBe('admin');
    expect(normalizeRole('Administrator')).toBe('admin');
    expect(normalizeRole('Concord.Admin')).toBe('admin');
  });

  it('does not downgrade a Reviewer to read-only (availability regression)', () => {
    // 'reviewer' contains 'view' — a substring match silently stripped
    // contract:write/esign:send from one of the most common CLM role names.
    expect(normalizeRole('Contract Reviewer')).toBe('counsel');
    expect(normalizeRole('Legal Reviewer')).toBe('counsel');
    // Genuine read-only names still resolve to viewer.
    expect(normalizeRole('Viewer')).toBe('viewer');
    expect(normalizeRole('Read-only')).toBe('viewer');
  });

  it('is not confused by prototype-chain keys', () => {
    for (const evil of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      const r = normalizeRole(evil);
      expect(['admin', 'lead', 'counsel', 'approver', 'viewer']).toContain(r);
      expect(r).toBe('viewer'); // unknown → least privilege
    }
  });

  it('has a label for every role', () => {
    for (const r of ['admin', 'lead', 'counsel', 'approver', 'viewer'] as const) {
      expect(ROLE_LABELS[r]).toBeTruthy();
    }
  });
});
