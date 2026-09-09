'use client';

import { useEffect, useState } from 'react';
import type { NotificationRecord } from '@concord/shared';
import { getNotifications } from '@/app/lib/api';
import { EmptyState, ErrorState, LoadingState } from '@/components/WorkspaceUI';
import { IconMail } from '@/components/icons';

const TONE: Record<NotificationRecord['status'], string> = {
  sent: 'low',
  'dry-run': 'med',
  failed: 'high',
  unknown: 'neutral',
};

const LABEL: Record<NotificationRecord['status'], string> = {
  sent: 'delivered',
  'dry-run': 'dry-run',
  failed: 'not delivered',
  unknown: 'recorded',
};

export default function NotificationsPage() {
  const [rows, setRows] = useState<NotificationRecord[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    getNotifications()
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Could not load notifications'));
  }, []);

  return (
    <>
      <div className="view-head">
        <div className="vh-left">
          <div className="eyebrow">Communication history</div><h2>Outlook notifications</h2>
          <p>
            Every notice Concord sent — approval requests, signature dispatches, execution seals and
            the obligations digest. Read from the immutable audit trail rather than a separate log,
            so this page cannot disagree with the evidentiary record.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3><IconMail />Notification history</h3>
          <span className="ch-act">{rows ? `${rows.length} event(s)` : ''}</span>
        </div>

        {err && <ErrorState title="Notification history unavailable">{err}</ErrorState>}
        {!err && !rows && <LoadingState label="Loading notification history" />}
        {!err && rows && !rows.length && (
          <EmptyState title="No notifications recorded" icon={<IconMail />}>Approval requests, signature dispatches and obligation reminders will appear here with their delivery status.</EmptyState>
        )}

        {rows && rows.length > 0 && (
          <div className="tbl-wrap">
            <table className="tbl tbl-responsive" role="table" aria-label="Notification history">
              <thead role="rowgroup">
                <tr role="row"><th scope="col" role="columnheader">When</th><th scope="col" role="columnheader">Event</th><th scope="col" role="columnheader">Summary</th><th scope="col" role="columnheader">Recipients</th><th scope="col" role="columnheader">Delivery</th></tr>
              </thead>
              <tbody role="rowgroup">
                {rows.map((n) => (
                  <tr role="row" key={n.id}>
                    <td role="cell" data-label="When" className="t-id">{new Date(n.at).toLocaleString()}</td>
                    <td role="cell" data-label="Event"><span className="badge neutral">{n.kind}</span></td>
                    <td role="cell" data-label="Summary" style={{ maxWidth: 420 }}>{n.summary}</td>
                    <td role="cell" data-label="Recipients" className="t-id">{n.recipients.length ? n.recipients.join(', ') : '—'}</td>
                    <td role="cell" data-label="Delivery"><span className={`badge ${TONE[n.status]}`}>{LABEL[n.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card card-pad u-mt">
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
          <b>“Dry-run” means nothing was sent.</b> Microsoft Graph is not configured, so Concord
          logged the message it would have sent instead of delivering it. In production a dry-run is
          treated as a delivery failure — an approval that nobody received is not a routed approval.
        </p>
      </div>
    </>
  );
}
