'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AgreementWorkspace, STAGE_LABELS } from '@concord/shared';
import { createAgreementAmendment } from '@/app/lib/api';
import { errorMessage, RequestError } from './RequestUI';
export default function AgreementAmendments({ data }: { data: AgreementWorkspace }) {
  const router = useRouter(), [title,setTitle] = useState(`Amendment — ${data.contract.title}`.slice(0,160)), [reason,setReason] = useState(''), [error,setError] = useState(''), [busy,setBusy] = useState(false), [submissionId] = useState(() => crypto.randomUUID());
  if (!data.archive && !data.parentAgreement && !data.amendments?.length) return null;
  return <section className="card card-pad"><h3>Related agreements</h3>{data.parentAgreement && <p className="req-help">Amendment to <Link href={`/contracts/${data.parentAgreement.id}`}>{data.parentAgreement.title}</Link>. The original executed agreement remains unchanged.</p>}<ul className="attachment-list">{data.amendments?.map(a => <li key={a.id}><Link href={`/contracts/${a.id}`}>{a.title}</Link><span className="badge neutral">{STAGE_LABELS[a.stage]}</span></li>)}</ul>{data.archive && data.permissions.includes('contract:write') && <details className="workflow-disclosure"><summary>Create Amendment <span>Begin a linked lifecycle</span></summary><form className="req-form" onSubmit={async e => { e.preventDefault(); if (busy) return; setBusy(true); setError(''); try { const result = await createAgreementAmendment(data.contract.id,{ id: submissionId, title, reason }); router.push(`/contracts/${result.id}`); } catch(e) { setError(errorMessage(e)); setBusy(false); } }}><label className="req-field">Amendment title<input required maxLength={160} value={title} onChange={e => setTitle(e.target.value)} /></label><label className="req-field">What is changing?<textarea required maxLength={2000} rows={3} value={reason} onChange={e => setReason(e.target.value)} /></label>{error && <RequestError message={error} />}<button className="btn btn-gold" disabled={busy}>{busy ? 'Creating amendment…' : 'Create linked amendment'}</button></form></details>}</section>;
}
