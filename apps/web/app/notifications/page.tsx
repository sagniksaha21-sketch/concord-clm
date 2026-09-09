'use client';

import { useEffect, useState } from 'react';
import type { NotificationRecord } from '@concord/shared';
import { getNotifications } from '@/app/lib/api';
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
          <h2>Outlook notifications</h2>
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

        {err && <div className="empty">{err}</div>}
        {!err && !rows && <div className="empty">Loading…</div>}
        {!err && rows && !rows.length && (
          <div className="empty">
            <span className="e-ico">✉</span>
            No notifications recorded yet. Route a contract for approval or send one for signature
            and it will appear here.
          </div>
        )}

        {rows && rows.length > 0 && (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>When</th><th>Event</th><th>Summary</th><th>Recipients</th><th>Delivery</th></tr>
              </thead>
              <tbody>
                {rows.map((n) => (
                  <tr key={n.id}>
                    <td className="t-id">{new Date(n.at).toLocaleString()}</td>
                    <td><span className="badge neutral">{n.kind}</span></td>
                    <td style={{ maxWidth: 420 }}>{n.summary}</td>
                    <td className="t-id">{n.recipients.length ? n.recipients.join(', ') : '—'}</td>
                    <td><span className={`badge ${TONE[n.status]}`}>{LABEL[n.status]}</span></td>
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
