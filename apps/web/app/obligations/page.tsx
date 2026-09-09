import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ObligationStatus } from '@concord/shared';
import RemindButton from '@/components/RemindButton';
import DigestButton from '@/components/DigestButton';
import { getObligations } from '@/app/lib/api';

export const dynamic = 'force-dynamic';

const STATUS_BADGE: Record<ObligationStatus, string> = {
  'on-track': 'low',
  'due-soon': 'medium',
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

export default async function ObligationsPage() {
  // Global auth guard requires a token; forward the session cookie for SSR.
  const token = cookies().get('concord_token')?.value;
  if (!token) redirect('/login');

  const obligations = await getObligations(token);

  return (
    <>

      <div className="view-head">
        <div className="vh-left">
          <h2>Key dates &amp; obligations</h2>
          <p>
            Extracted from the portfolio. Fire an Outlook reminder for any item — it
            dispatches through Microsoft Graph (dry-run until a tenant is configured).
            A scheduled digest of everything below goes out automatically each week.
          </p>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <DigestButton />
      </div>

      <div className="card">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Obligation</th>
                <th>Contract</th>
                <th>Owner</th>
                <th>Due</th>
                <th>Status</th>
                <th>Outlook</th>
              </tr>
            </thead>
            <tbody>
              {obligations.map((o) => (
                <tr key={o.id}>
                  <td className="t-strong">{o.title}</td>
                  <td>{o.contractTitle}</td>
                  <td>
                    <span className="owner-av">{o.ownerInitials}</span>
                  </td>
                  <td className="tnum">{o.dueDate}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[o.status]}`}>
                      <span className="d" />
                      {STATUS_LABEL[o.status]}
                    </span>
                  </td>
                  <td>
                    <RemindButton id={o.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="page-note">
        Concord · obligation intelligence for Lakmē Lever Private Limited ·
        Design sibling of the Franchise Management Portal
      </p>
    </>
  );
}
