import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getPermissions } from '@/app/lib/api';
import { NAV, NAV_GROUPS, PRIMARY_NAV } from '@/components/workspace-navigation';
import { IconArrowRight } from '@/components/icons';

export const dynamic = 'force-dynamic';

export default async function WorkspaceTools() {
  const token = cookies().get('concord_token')?.value;
  if (!token) redirect('/login');
  const { permissions, role } = await getPermissions(token);
  if (role === 'requester') redirect('/requests');
  const tools = NAV.filter(n => !PRIMARY_NAV.includes(n.href) && (!n.needs || permissions.includes(n.needs)));
  return <div className="workspace-directory">
    <div className="view-head"><div className="vh-left"><div className="eyebrow">Your workspace</div><h2>The right tool, when you need it.</h2><p>Draft, explore insights or manage your team. Your everyday work stays in the sidebar.</p></div></div>
    {NAV_GROUPS.map(([group, title]) => {
      const entries = tools.filter(n => n.group === group);
      if (!entries.length) return null;
      return <section key={group} aria-labelledby={`tools-${group}`} className="tool-section">
        <h3 id={`tools-${group}`}>{title}</h3>
        <div className="tool-grid">{entries.map(n => {
          const Icon = n.icon;
          return <Link href={n.href} key={n.href} className="tool-card"><span className="tool-symbol"><Icon /></span><span><b>{n.label}</b><small>{n.description}</small></span><IconArrowRight className="tool-arrow" /></Link>;
        })}</div>
      </section>;
    })}
  </div>;
}
