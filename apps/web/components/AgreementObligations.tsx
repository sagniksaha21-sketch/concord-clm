'use client';
import { useState } from 'react';
import { AgreementWorkspace } from '@concord/shared';
import { saveAgreementObligation } from '@/app/lib/api';
import { errorMessage, RequestError, requestDate } from './RequestUI';
type Item = AgreementWorkspace['obligations'][number];
const TYPES = [['renewal','Renewal / expiry'],['notice','Notice deadline'],['payment','Payment'],['reporting','Reporting'],['service','Service level'],['insurance','Insurance'],['privacy','Data / privacy'],['milestone','Milestone'],['other','Other commitment']];
export default function AgreementObligations({ data, onChange }: { data: AgreementWorkspace; onChange: (data: AgreementWorkspace) => void }) {
  const [editing,setEditing] = useState<Item>(); const [busy,setBusy] = useState(false); const [error,setError] = useState('');
  const canWrite = data.permissions.includes('contract:write');
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!editing || busy) return;
    const fields = new FormData(e.currentTarget); setBusy(true); setError('');
    try { onChange(await saveAgreementObligation(data.contract.id, { id: editing.id, revision: data.revision, title: String(fields.get('title')), type: String(fields.get('type')), dueDate: String(fields.get('dueDate')), ownerEmail: String(fields.get('ownerEmail')), evidence: String(fields.get('evidence')), completed: fields.get('completed') === 'on' })); setEditing(undefined); window.dispatchEvent(new Event('concord:inbox')); }
    catch(e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <section className="card card-pad"><div className="agreement-section-head"><h3>Obligations &amp; key dates</h3>{canWrite && !editing && <button className="btn" onClick={() => setEditing({ id: crypto.randomUUID(), title: '', type: 'other', dueDate: '', ownerEmail: data.request?.assignedLegal.email ?? '', evidence: '', confirmed: false })}>Add commitment</button>}</div>
    <p className="req-help">Check dates and commitments against the executed agreement. Confirm an owner and the source provision before reminders are enabled.</p>
    {editing && <form className="req-form" onSubmit={save} key={editing.id}><div className="req-fields"><label className="req-field wide">Commitment<input name="title" required maxLength={200} defaultValue={editing.title} /></label><label className="req-field">Type<select name="type" defaultValue={editing.type}>{TYPES.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label><label className="req-field">Due date<input name="dueDate" type="date" required defaultValue={editing.dueDate} /></label><label className="req-field wide">Owner’s email<input name="ownerEmail" type="email" required maxLength={254} defaultValue={editing.ownerEmail} /><small>Use an existing legal account or this agreement’s business requestor.</small></label><label className="req-field wide">Source clause or page &amp; obligation<textarea name="evidence" required rows={3} maxLength={4000} defaultValue={editing.evidence} placeholder="For example: Page 8, clause 12 — written notice is required 90 days before expiry." /></label><label className="obligation-checkbox"><input type="checkbox" name="completed" defaultChecked={!!editing.completedAt} />Already completed</label><label className="obligation-checkbox wide"><input type="checkbox" required />I checked this commitment against the signed agreement.</label></div><div className="req-actions"><button className="btn" type="button" disabled={busy} onClick={() => { setEditing(undefined); setError(''); }}>Cancel</button><button className="btn btn-gold" disabled={busy}>{busy ? 'Saving…' : 'Confirm & save commitment'}</button></div></form>}
    {error && <RequestError message={error} />}
    <div className="obligation-records">{data.obligations.map(o => <article key={o.id}><div><span className={`badge ${o.confirmed ? 'low' : 'med'}`}>{o.completedAt ? 'Completed' : o.confirmed ? 'Confirmed' : 'Needs confirmation'}</span><h4>{o.title}</h4><p>{o.evidence}</p></div><div><b>{requestDate(o.dueDate)}</b><small>{o.ownerEmail ?? 'Assign an owner'}</small>{canWrite && <button className="btn" disabled={busy} onClick={() => { setEditing(o); setError(''); }}>{o.confirmed ? 'Update' : 'Review & confirm'}</button>}</div></article>)}</div>
    {!data.obligations.length && !editing && <p className="req-help">No commitments are recorded yet. Add renewal, notice and other obligations from the executed agreement.</p>}
  </section>;
}
