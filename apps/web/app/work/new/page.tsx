'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AGREEMENT_TYPES } from '@concord/shared';
import { createAgreementWorkspace } from '@/app/lib/api';
import { RequestError, errorMessage } from '@/components/RequestUI';
export default function NewAgreement() {
  const router = useRouter(); const [title,setTitle] = useState(''); const [counterparty,setCounterparty] = useState(''); const [type,setType] = useState('Master Services Agreement'); const [busy,setBusy] = useState(false); const [error,setError] = useState('');
  return <div className="req-page"><Link className="req-back" href="/work">← Work</Link><div className="view-head"><div className="vh-left"><div className="eyebrow">New agreement</div><h2>Start with the right foundation.</h2><p>Create the agreement, then choose a template in its drafting workspace.</p></div></div><form className="card card-pad req-form" onSubmit={async e => { e.preventDefault(); if (busy) return; setBusy(true); setError(''); try { const r = await createAgreementWorkspace({ title, counterparty, type }); router.push(`/contracts/${r.id}`); } catch(e) { setError(errorMessage(e)); setBusy(false); } }}><div className="req-fields"><label className="req-field wide">Agreement title<input required maxLength={160} value={title} onChange={e => setTitle(e.target.value)} /></label><label className="req-field">Counterparty<input required maxLength={180} value={counterparty} onChange={e => setCounterparty(e.target.value)} /></label><label className="req-field">Agreement type<select value={type} onChange={e => setType(e.target.value)}>{AGREEMENT_TYPES.map(t => <option key={t}>{t}</option>)}</select></label></div>{error && <RequestError message={error} />}<div className="req-actions"><Link className="btn" href="/work">Cancel</Link><button className="btn btn-gold" disabled={busy}>{busy ? 'Creating…' : 'Create agreement'}</button></div></form></div>;
}
