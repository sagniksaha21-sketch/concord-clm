import type { Permission } from '@concord/shared';
import { IconBox, IconChart, IconFlow, IconGrid, IconInbox, IconMail, IconMore, IconShield } from './icons';

export type NavGroup = 'work' | 'governance';
export type NavEntry = {
  href: string; label: string; match: string;
  icon: (p: { className?: string }) => JSX.Element;
  needs?: Permission; group: NavGroup; description: string; portalOnly?: boolean; approverOnly?: boolean;
};

// Lifecycle capabilities are contextual actions, not global destinations.
// API authorization remains server-side; this is the shared visible hierarchy.
export const PRIMARY_NAV = ['/', '/work', '/repository', '/reports', '/workspace'];
export const NAV_GROUPS: Array<[NavGroup, string]> = [['work', 'Workspace'], ['governance', 'Administration']];
export const NAV: NavEntry[] = [
  { href: '/approvals', label: 'My Approvals', match: '/approvals', icon: IconShield, needs: 'approve', group: 'work', description: 'Review your assigned approval cards', approverOnly: true },
  { href: '/', label: 'Home', match: '/', icon: IconGrid, needs: 'contract:read', group: 'work', description: 'What needs your attention today' },
  { href: '/work', label: 'Work', match: '/work', icon: IconFlow, needs: 'contract:read', group: 'work', description: 'Take an agreement from request to completion' },
  { href: '/repository', label: 'Contracts', match: '/repository', icon: IconBox, needs: 'contract:read', group: 'work', description: 'Agreements, search and approved templates' },
  { href: '/reports', label: 'Reports', match: '/reports', icon: IconChart, needs: 'contract:read', group: 'work', description: 'Portfolio insights, Excel, PDF and PowerPoint' },
  { href: '/workspace', label: 'More', match: '/workspace', icon: IconMore, needs: 'contract:read', group: 'governance', description: 'Administration and occasional tools' },
  { href: '/requests', label: 'My Requests', match: '/requests', icon: IconInbox, needs: 'request:read', group: 'work', description: 'Request a contract and follow its progress', portalOnly: true },
  { href: '/team', label: 'Team & access', match: '/team', icon: IconShield, needs: 'admin', group: 'governance', description: 'Manage Requestors, lawyers and access' },
  { href: '/notifications', label: 'Email delivery', match: '/notifications', icon: IconMail, needs: 'audit:read', group: 'governance', description: 'Investigate Outlook delivery history' },
  { href: '/audit', label: 'Audit trail', match: '/audit', icon: IconShield, needs: 'audit:read', group: 'governance', description: 'Inspect system-wide recorded decisions' },
];

export function navIsActive(entry: NavEntry, path: string): boolean {
  if (entry.href === '/work') return /^\/(work|pipeline|contracts|requests|review|authoring|intake|esign|obligations)(\/|$)/.test(path);
  if (entry.href === '/repository') return /^\/(repository|templates|ingest)(\/|$)/.test(path);
  if (entry.href === '/workspace') return /^\/(workspace|team|audit|notifications)(\/|$)/.test(path);
  return entry.match === '/' ? path === '/' : path === entry.match || path.startsWith(`${entry.match}/`);
}
export function agreementHref(id: string): string { return `/contracts/${encodeURIComponent(id)}`; }
