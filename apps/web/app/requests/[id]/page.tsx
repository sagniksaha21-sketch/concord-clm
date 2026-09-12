'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { ClientRequest } from '@concord/shared';
import { getClientRequest, updateClientRequest } from '@/app/lib/api';
import { errorMessage, OutlookStatus, REQUEST_STATUSES, requestDate, RequestError, RequestHeader, RequestLoading, RequestStatus, TermSheet } from '@/components/RequestUI';

export default function RequestDetail({ params }: { params: { id: string } }) {
  const [item, setItem] = useState<ClientRequest>();
  const [status, setStatus] = useState<ClientRequest['status']>('submitted');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  function accept(value: ClientRequest) { setItem(value); setStatus(value.status); setNote(value.legalNote ?? ''); }
  const load = useCallback(async () => { setError(''); try { accept(await getClientRequest(params.id)); } catch (e) { setError(errorMessage(e)); } }, [params.id]);
  useEffect(() => { void load(); }, [load]);
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!item || busy) return;
    setBusy(true); setSaveError(''); setSaved(false);
    try { accept(await updateClientRequest(item.id, { status, legalNote: note, version: item.version })); setSaved(true); window.dispatchEvent(new Event('concord:inbox')); }
    catch (e) { setSaveError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <div className="req-page"><Link className="req-back" href="/requests">← Agreement requests</Link>{error ? <RequestError message={error} retry={load} /> : !item ? <RequestLoading /> : <>
    <RequestHeader kicker={`${item.id} · ${item.contractType}`} title={item.title} description={`${item.counterparty} · ${item.businessUnit}`} action={<RequestStatus status={item.status} />} />
    {item.legalNote && <div className="req-note"><b>From your legal team</b><br />{item.legalNote}</div>}
    <div className="req-detail-grid"><section className="req-panel"><div className="req-inline"><h3>Submitted term sheet</h3><span className="req-id">Saved {requestDate(item.createdAt)}</span></div><TermSheet terms={item.terms} /></section>
    <aside className="req-aside"><section className="req-panel"><span className="eyebrow">Your legal contact</span><div className="req-person"><span className="req-avatar" aria-hidden="true">{item.assignedLegal.name.split(/\s+/).map(p => p[0]).slice(0,2).join('')}</span><div><b>{item.assignedLegal.name}</b><a href={`mailto:${item.assignedLegal.email}`}>{item.assignedLegal.email}</a></div></div><dl className="req-meta"><div><dt>Requested by</dt><dd>{requestDate(item.requestedByDate)}{item.urgency === 'urgent' ? ' · Urgent' : ''}</dd></div><div><dt>Raised by</dt><dd>{item.requester.name}<br />{item.requester.email}</dd></div><div><dt>Agreement stage</dt><dd style={{ textTransform: 'capitalize' }}>{item.contractStage}</dd></div></dl><OutlookStatus status={item.emailStatus} /><p className="req-help">The assignment is saved in your lawyer’s Concord inbox.{item.emailStatus === 'awaiting-configuration' ? ' Email will be attempted after Microsoft is connected.' : item.emailStatus === 'uncertain' ? ' Email acceptance is unconfirmed. Check with your legal contact if urgent.' : ''}</p>{item.canOpenAgreement && <Link className="btn btn-gold" href={`/contracts/${encodeURIComponent(item.contractId)}`}>Open linked agreement →</Link>}{!item.canOpenAgreement && <p className="req-help">Need to add information? Contact your lawyer and quote {item.id}.</p>}</section>
    {item.canManage && <section className="req-panel"><h3>Keep your client informed</h3><p className="req-help">Updates appear here and in the client’s Concord inbox.</p><form className="req-form" onSubmit={save}><label className="req-field">Request status<select value={status} disabled={busy} onChange={e => { setStatus(e.target.value as ClientRequest['status']); setSaved(false); }}>{Object.entries(REQUEST_STATUSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="req-field">Note to your client{status === 'waiting-on-client' ? ' *' : ''}<textarea maxLength={2000} required={status === 'waiting-on-client'} value={note} disabled={busy} onChange={e => { setNote(e.target.value); setSaved(false); }} placeholder="Progress, next steps or information you need" /></label>{saveError && <RequestError message={saveError} retry={load} />}{saved && <p className="req-success" role="status">Update saved. Your client has been notified in Concord.</p>}<button className="btn btn-gold" disabled={busy || (status === item.status && note === (item.legalNote ?? ''))}>{busy ? 'Saving…' : 'Save client update'}</button></form><p className="req-help">Request updates do not change approvals, signatures or the agreement’s legal workflow.</p></section>}
    </aside></div>
  </>}</div>;
}
