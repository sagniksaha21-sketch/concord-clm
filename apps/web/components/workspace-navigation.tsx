import type { Permission } from '@concord/shared';
import { IconBell, IconBox, IconCalendar, IconChart, IconDoc, IconFlow, IconGrid, IconInbox, IconMail, IconShield, IconSign, IconSparkle, IconUpload } from './icons';

export type NavGroup = 'work' | 'library' | 'execute' | 'governance';
export type NavEntry = {
  href: string;
  label: string;
  match: string;
  icon: (p: { className?: string }) => JSX.Element;
  needs?: Permission;
  group: NavGroup;
  description: string;
};

// One catalogue powers the sidebar, tools directory, mobile sheet and search.
// Visibility is presentation only; all API authorization remains server-side.
export const PRIMARY_NAV = ['/', '/requests', '/pipeline', '/inbox', '/repository', '/obligations'];
export const NAV_GROUPS: Array<[NavGroup, string]> = [
  ['work', 'Draft & review'], ['library', 'Library & insights'],
  ['execute', 'Signing'], ['governance', 'Administration'],
];
export const NAV: NavEntry[] = [
  { href: '/', label: 'Home', match: '/', icon: IconGrid, needs: 'contract:read', group: 'work', description: 'Your command centre and portfolio overview' },
  { href: '/requests', label: 'Requests', match: '/requests', icon: IconInbox, needs: 'request:read', group: 'work', description: 'Raise an agreement and work with your chosen lawyer' },
  { href: '/pipeline', label: 'Agreements', match: '/pipeline', icon: IconFlow, needs: 'contract:read', group: 'work', description: 'Find an agreement and continue its next step' },
  { href: '/inbox', label: 'Inbox', match: '/inbox', icon: IconBell, group: 'work', description: 'Your assignments and request updates' },
  { href: '/repository', label: 'Repository', match: '/repository', icon: IconBox, needs: 'contract:read', group: 'library', description: 'Search agreements, signed copies and portfolio knowledge' },
  { href: '/obligations', label: 'Obligations', match: '/obligations', icon: IconCalendar, needs: 'contract:read', group: 'execute', description: 'Track commitments, renewals and deadlines' },
  { href: '/authoring', label: 'Draft an agreement', match: '/authoring', icon: IconDoc, needs: 'contract:write', group: 'work', description: 'Prepare a draft using approved templates and clauses' },
  { href: '/review', label: 'AI Review', match: '/review', icon: IconSparkle, needs: 'contract:read', group: 'work', description: 'Check findings and deviations against the source agreement' },
  { href: '/intake', label: 'Manual intake', match: '/intake', icon: IconInbox, needs: 'contract:read', group: 'work', description: 'Manage the existing intake queue and capture a document record' },
  { href: '/templates', label: 'Templates & clauses', match: '/templates', icon: IconDoc, needs: 'contract:read', group: 'library', description: 'Browse and maintain approved legal language' },
  { href: '/ingest', label: 'Upload documents', match: '/ingest', icon: IconUpload, needs: 'ingest:write', group: 'library', description: 'Upload agreements for extraction and validation' },
  { href: '/reports', label: 'Reports & presentations', match: '/reports', icon: IconChart, needs: 'contract:read', group: 'library', description: 'Create Excel, PDF and PowerPoint insights from the portfolio' },
  { href: '/esign', label: 'Signatures & stamps', match: '/esign', icon: IconSign, needs: 'esign:send', group: 'execute', description: 'Prepare signing requests and track executed copies' },
  { href: '/team', label: 'Team & access', match: '/team', icon: IconShield, needs: 'admin', group: 'governance', description: 'Manage department clients, lawyers and access' },
  { href: '/notifications', label: 'Email delivery', match: '/notifications', icon: IconMail, needs: 'audit:read', group: 'governance', description: 'Check the Outlook delivery history' },
  { href: '/audit', label: 'Audit trail', match: '/audit', icon: IconShield, needs: 'audit:read', group: 'governance', description: 'Inspect recorded decisions and activity' },
];

export function navIsActive(entry: NavEntry, path: string): boolean {
  if (entry.href === '/pipeline' && path.startsWith('/contracts/')) return true;
  return entry.match === '/' ? path === '/' : path === entry.match || path.startsWith(`${entry.match}/`);
}

export function agreementHref(id: string): string {
  return `/contracts/${encodeURIComponent(id)}`;
}
