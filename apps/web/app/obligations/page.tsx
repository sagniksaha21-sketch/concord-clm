import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ObligationStatus } from '@concord/shared';
import RemindButton from '@/components/RemindButton';
import DigestButton from '@/components/DigestButton';
import { EmptyState } from '@/components/WorkspaceUI';
import { getObligations } from '@/app/lib/api';

export const dynamic = 'force-dynamic';

const STATUS_BADGE: Record<ObligationStatus, string> = {
  'on-track': 'low',
  'due-soon': 'med',
  'at-risk': 'high',
  scheduled: 'info',
  done: 'neutral',
};

const STATUS_LABEL: Record<ObligationStatus, string> = {
  'on-track': 'On track',
  'due-soon': 'Due soon',
  'at-risk': 'At risk',
  scheduled: 'Scheduled',
  done: 'Done',
};

export default async function ObligationsPage({ searchParams }: { searchParams: { contract?: string } }) {
  // Global auth guard requires a token; forward the session cookie for SSR.
  const token = cookies().get('concord_token')?.value;
  if (!token) redirect('/login');

  const allObligations = await getObligations(token);
  const contractId = typeof searchParams.contract === 'string' ? searchParams.contract : undefined;
  const obligations = contractId ? allObligations.filter(o => o.contractId === contractId) : allObligations;

  return (
    <>

      <div className="view-head">
        <div className="vh-left">
          <div className="eyebrow">Commitments &amp; renewals</div><h2>Key dates &amp; obligations</h2>
          <p>
            Track portfolio commitments and upcoming deadlines. Send an Outlook reminder or prepare the weekly digest for your team.
          </p>
        </div>
      </div>

      <div className="req-inline" style={{ marginBottom: 20 }}>
        {contractId ? <><Link className="btn" href={`/contracts/${encodeURIComponent(contractId)}`}>← Agreement overview</Link><span className="req-help">Showing this agreement’s obligations</span><Link className="btn" href="/obligations">View all obligations</Link></> : <details className="workflow-disclosure"><summary>Team reminders &amp; weekly digest</summary><DigestButton /></details>}
      </div>

      <div className="card">
        <div className="tbl-wrap">
          <table className="tbl tbl-responsive" role="table" aria-label="Portfolio obligations">
            <thead role="rowgroup">
              <tr role="row">
                <th scope="col" role="columnheader">Obligation</th>
                <th scope="col" role="columnheader">Contract</th>
                <th scope="col" role="columnheader">Owner</th>
                <th scope="col" role="columnheader">Due</th>
                <th scope="col" role="columnheader">Status</th>
                <th scope="col" role="columnheader">Outlook</th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {obligations.map((o) => (
                <tr role="row" key={o.id}>
                  <td role="cell" data-label="Obligation" className="t-strong">{o.title}</td>
                  <td role="cell" data-label="Contract"><Link href={`/contracts/${encodeURIComponent(o.contractId)}`}>{o.contractTitle}</Link></td>
                  <td role="cell" data-label="Owner">
                    <span className="owner-av">{o.ownerInitials}</span>
                  </td>
                  <td role="cell" data-label="Due" className="tnum">{o.dueDate}</td>
                  <td role="cell" data-label="Status">
                    <span className={`badge ${STATUS_BADGE[o.status]}`}>
                      <span className="d" />
                      {STATUS_LABEL[o.status]}
                    </span>
                  </td>
                  <td role="cell" data-label="Outlook">
                    <RemindButton id={o.id} />
                  </td>
                </tr>
              ))}
              {!obligations.length && <tr role="row"><td role="cell" colSpan={6}><EmptyState title="No obligations to track">Key dates extracted from your agreements will appear here.</EmptyState></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <p className="page-note">
        Reminder delivery depends on the configured Outlook connection. A dry-run records the intended message without delivering it.
      </p>
    </>
  );
}
