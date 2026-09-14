'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getMyApprovals } from '@/app/lib/api';
import { errorMessage, RequestError, RequestLoading, requestDate } from '@/components/RequestUI';
export default function ApproverHome() {
  const [items,setItems] = useState<Awaited<ReturnType<typeof getMyApprovals>>>(), [error,setError] = useState(''), [showCompleted,setShowCompleted] = useState(false);
  const load = useCallback(async () => { setError(''); try { setItems(await getMyApprovals()); } catch(e) { setError(errorMessage(e)); } },[]);
  useEffect(() => { void load(); },[load]);
  const rows = items?.filter(r => showCompleted ? r.decision !== 'pending' : r.decision === 'pending');
  return <div className="work-page approver-portal"><header className="view-head"><div className="vh-left"><span className="eyebrow">Your decisions</span><h2>My Approvals</h2><p>The agreement, Legal’s recommendation and one clear decision.</p></div></header><nav className="lifecycle-filters" aria-label="Approval status"><button aria-pressed={!showCompleted} onClick={() => setShowCompleted(false)}>Awaiting my decision <span>{items?.filter(r => r.decision === 'pending').length ?? '—'}</span></button><button aria-pressed={showCompleted} onClick={() => setShowCompleted(true)}>My decisions</button></nav>{error ? <RequestError message={error} retry={load} /> : !items ? <RequestLoading /> : <div className="approver-card-list">{rows?.map(c => <Link className="card card-pad approver-card-link" key={c.id} href={`/approvals/${c.id}`}><div className="agreement-section-head"><span className={`badge ${c.risk === 'high' ? 'high' : c.risk === 'medium' ? 'med' : 'low'}`}>{c.risk} risk</span><small>{requestDate(c.requestedAt)}</small></div><h3>{c.title}</h3><p>{c.counterparty} · {c.valueDisplay}</p><p className="req-help">{c.reason}</p><span className="btn">{c.decision === 'pending' ? 'Review approval' : 'View my decision'} →</span></Link>)}{!rows?.length && <div className="req-empty"><h3>{showCompleted ? 'No decisions in this view.' : 'You’re up to date.'}</h3><p>{showCompleted ? 'Your recorded decisions will appear here.' : 'When Legal needs your approval, your card will appear here and in notifications.'}</p></div>}</div>}</div>;
}
