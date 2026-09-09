'use client';

import { useMemo, useState } from 'react';
import type { ApprovalResult } from '@concord/shared';
import { requestApproval } from '@/app/lib/api';
import { IconAlert, IconCheck, IconMail, IconShield } from '@/components/icons';

type State = 'idle' | 'sending' | 'done' | 'error';

export default function ApproveBar({ contractId }: { contractId: string }) {
  const [state, setState] = useState<State>('idle');
  const [result, setResult] = useState<ApprovalResult | null>(null);
  const [error, setError] = useState('');
  const [approverText, setApproverText] = useState('');
  const [note, setNote] = useState('');

  const approvers = useMemo(() => [...new Set(approverText.split(/[;,\n]/).map((x) => x.trim().toLowerCase()).filter(Boolean))], [approverText]);

  async function route() {
    if (!approvers.length || approvers.some((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))) {
      setError('Enter at least one valid approver email address.'); setState('error'); return;
    }
    setState('sending'); setError(''); setResult(null);
    try {
      setResult(await requestApproval(contractId, { approvers, note: note.trim() || undefined, decision: 'request' }));
      setState('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approval routing failed.'); setState('error');
    }
  }

  const n = result?.notification;
  return (
    <div className="card-pad approval-composer">
      <label className="premium-field"><span>Approver email(s) *</span><textarea value={approverText} onChange={(e) => setApproverText(e.target.value)} placeholder="approver@company.com\nsecond.approver@company.com" rows={3} /><small>Separate multiple approvers with commas, semicolons or new lines.</small></label>
      <label className="premium-field"><span>Routing note <small>optional</small></span><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Explain the decision needed, key deviations or deadline." rows={3} maxLength={1200} /></label>
      <button className="btn btn-gold approval-route-btn" onClick={route} disabled={state === 'sending'}>{state === 'sending' ? 'Routing securely…' : <><IconMail />Route approval via Outlook</>}</button>
      <div className="approval-hint"><IconShield />Approvers are authorized again when they act; receiving the email alone does not grant approval rights.</div>

      {state === 'done' && n && <div className={`result ${n.status === 'sent' ? 'sent' : n.status === 'failed' ? 'error' : 'dry'}`}><div className="r-h">{n.status === 'sent' ? <><IconCheck /> Approval request sent</> : n.status === 'failed' ? <><IconAlert /> Graph delivery failed</> : <><IconMail /> Approval notification prepared</>}</div><div><b>To:</b> {n.to.join(', ')}</div><div><b>Subject:</b> {n.subject}</div>{n.detail && <div className="result-detail">{n.detail}</div>}</div>}
      {state === 'error' && <div className="result error" role="alert"><div className="r-h"><IconAlert /> Could not route approval</div><div className="result-detail">{error}</div></div>}
    </div>
  );
}
