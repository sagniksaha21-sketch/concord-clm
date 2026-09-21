'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getGuestAccess, GuestAccessRecord, actOnNegotiation } from '@/app/lib/api';
import GuestAccessEditor from './GuestAccessEditor';
import { errorMessage, RequestError, RequestLoading, requestDate } from './RequestUI';
export default function GuestAdministration() {
  const [rows,setRows] = useState<GuestAccessRecord[]>(), [query,setQuery] = useState(''), [error,setError] = useState(''), [busy,setBusy] = useState(false);
  async function load() { try { setRows(await getGuestAccess()); } catch(e) { setError(errorMessage(e)); } }
  useEffect(() => { void load(); },[]);
  async function revoke(row: GuestAccessRecord) { setBusy(true); setError(''); try { await actOnNegotiation(row.contractId,`invitations/${row.id}/revoke`); await load(); } catch(e) { setError(errorMessage(e)); } finally { setBusy(false); } }
  const filtered = rows?.filter(r => `${r.name} ${r.email} ${r.organisation} ${r.contract.title}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="req-page"><div className="view-head"><div className="vh-left"><div className="eyebrow">More · Governance</div><h2>Guest access</h2><p>See who can access each negotiation, control permissions and share signed copies deliberately.</p></div></div><label className="req-field">Find a participant or agreement<input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label>{error && <RequestError message={error} retry={load} />}{!rows && !error && <RequestLoading />}{rows && <><p className="req-help">{rows.length} most recent invitations · Each invitation is limited to one agreement.</p><div className="guest-admin-grid">{filtered?.map(r => <article className="card card-pad" key={r.id}><span className={`badge ${r.revokedAt || Date.parse(r.expiresAt) <= Date.now() ? 'neutral' : 'low'}`}>{r.revokedAt ? 'Revoked' : Date.parse(r.expiresAt) <= Date.now() ? 'Expired' : 'Active'}</span><h3>{r.name}</h3><p>{r.email}<br />{r.organisation}</p><Link href={`/contracts/${r.contractId}`}>{r.contract.title}</Link><p className="req-help">Expires {requestDate(r.expiresAt)}{r.executedArchiveId ? ' · Executed copy shared' : ''}</p>{!r.revokedAt && <><GuestAccessEditor invitation={r} contractId={r.contractId} executed={!!r.contract.executedAt} onChange={() => void load()} /><button className="btn" disabled={busy} onClick={() => void revoke(r)}>Revoke access</button></>}</article>)}</div>{!filtered?.length && <section className="card card-pad"><h3>{rows.length ? 'No matching invitations' : 'External access starts with an agreement.'}</h3><p>Open an agreement’s Negotiation stage to invite a participant. Their permissions and expiry will appear here.</p></section>}</>}</div>;
}
