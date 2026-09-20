'use client';
import { useEffect, useState } from 'react';
import { ApprovalPolicy } from '@concord/shared';
import { getApprovalPolicies, saveApprovalPolicy, PolicySettings } from '@/app/lib/api';
import { errorMessage, RequestError, RequestLoading } from './RequestUI';
const lists = [['agreementTypes','Agreement types'],['businessUnits','Business units'],['jurisdictions','Governing law / jurisdiction']] as const;
export default function ApprovalPolicies() {
  const [data,setData] = useState<PolicySettings>(), [edit,setEdit] = useState<ApprovalPolicy>(), [busy,setBusy] = useState(false), [error,setError] = useState(''), [saved,setSaved] = useState('');
  async function load() { try { setData(await getApprovalPolicies()); } catch(e) { setError(errorMessage(e)); } }
  useEffect(() => { void load(); },[]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!edit || busy) return;
    const f = new FormData(e.currentTarget), amount = String(f.get('minimumValue') ?? '').trim();
    const conditions: ApprovalPolicy['conditions'] = {};
    for (const [key] of lists) { const values = String(f.get(key) ?? '').split(',').map(v => v.trim()).filter(Boolean); if (values.length) conditions[key] = values; }
    const risks = f.getAll('risk').map(String); if (risks.length) conditions.risks = risks;
    if (amount) { conditions.minimumValue = Number(amount); conditions.currency = String(f.get('currency')).toUpperCase(); }
    for (const key of ['personalData','exclusivity','indemnity'] as const) if (f.get(key)) conditions[key] = true;
    setBusy(true); setError(''); setSaved('');
    try { setData(await saveApprovalPolicy({ id: edit.id, revision: edit.revision, name: String(f.get('name')), enabled: f.get('enabled') === 'on', conditions, approvers: f.getAll('approver').map(String) })); setEdit(undefined); setSaved('Policy saved. It applies to new approval rounds; existing decisions remain unchanged.'); }
    catch(e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <div className="req-page"><div className="view-head"><div className="vh-left"><div className="eyebrow">More · Governance</div><h2>Approval policies</h2><p>Give every agreement the right reviewers, with a reason attached to each decision.</p></div>{!edit && <button className="btn btn-gold" onClick={() => setEdit({ id: crypto.randomUUID(), revision: 0, name: '', enabled: true, conditions: {}, approvers: [] })}>Create policy</button>}</div>
  {error && <RequestError message={error} retry={load} />}{saved && <p role="status" className="req-success">{saved}</p>}{!data && !error && <RequestLoading />}
  {edit && data && <form key={`${edit.id}:${edit.revision}`} className="card card-pad req-form" onSubmit={save}><h3>{edit.revision ? 'Edit policy' : 'New approval policy'}</h3><div className="req-fields"><label className="req-field wide">Policy name<input name="name" required maxLength={160} defaultValue={edit.name} placeholder="For example: Finance review for high-value agreements" /></label>{lists.map(([key,label]) => <label className="req-field" key={key}>{label}<input name={key} defaultValue={edit.conditions[key]?.join(', ')} placeholder="Any — or enter exact values separated by commas" /></label>)}<label className="req-field">Value threshold<input name="minimumValue" type="number" min="0" max="1000000000000000" step="0.01" defaultValue={edit.conditions.minimumValue} placeholder="No threshold" /></label><label className="req-field">Threshold currency<input name="currency" pattern="[A-Za-z]{3}" maxLength={3} defaultValue={edit.conditions.currency ?? 'INR'} /></label></div>
  <fieldset className="guest-permissions"><legend>Risk levels · leave clear for any risk</legend>{['low','medium','high'].map(r => <label key={r}><input type="checkbox" name="risk" value={r} defaultChecked={edit.conditions.risks?.includes(r)} />{r}</label>)}</fieldset>
  <fieldset className="guest-permissions"><legend>Additional conditions</legend>{([['personalData','Personal data involved'],['exclusivity','Exclusivity terms'],['indemnity','Indemnity concerns']] as const).map(([key,label]) => <label key={key}><input name={key} type="checkbox" defaultChecked={edit.conditions[key]} />{label}</label>)}</fieldset>
  <p className="req-help">All selected conditions must apply. Blank conditions apply to every agreement. Unknown facts retain the required approval; currencies are never converted silently.</p>
  <fieldset className="approver-options"><legend>Required approvers</legend>{data.approvers.map(p => <label key={p.id}><input type="checkbox" name="approver" value={p.email} defaultChecked={edit.approvers.includes(p.email)} /><span><b>{p.name}</b><small>{p.email}</small></span></label>)}</fieldset>
  <label className="req-check"><input type="checkbox" name="enabled" defaultChecked={edit.enabled} />Enable this policy</label><div className="req-actions"><button type="button" className="btn" disabled={busy} onClick={() => setEdit(undefined)}>Cancel</button><button className="btn btn-gold" disabled={busy || !data.approvers.length}>{busy ? 'Saving…' : 'Save policy'}</button></div></form>}
  {!edit && data && <div className="obligation-records">{data.policies.map(p => <article className="card card-pad" key={p.id}><div><span className={`badge ${p.enabled ? 'low' : 'neutral'}`}>{p.enabled ? 'Active' : 'Disabled'} · Revision {p.revision}</span><h3>{p.name}</h3><p>{p.approvers.length} required approver{p.approvers.length === 1 ? '' : 's'}</p></div><button className="btn" onClick={() => setEdit(p)}>Edit policy</button></article>)}{!data.policies.length && <section className="card card-pad"><h3>Your routing, made consistent.</h3><p>Create your first policy for Finance, Privacy or Legal approval. Manual routing remains available until policies are configured.</p></section>}</div>}</div>;
}
