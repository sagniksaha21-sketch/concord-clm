'use client';
import { useCallback, useEffect, useState } from 'react';
import type { AiReview } from '@concord/shared';
import { getReview } from '@/app/lib/api';
import { errorMessage, RequestError, RequestLoading } from './RequestUI';
import DeviationCard from './DeviationCard';
import RiskGauge from './RiskGauge';
export default function AgreementReview({ id }: { id: string }) {
  const [review,setReview] = useState<AiReview>(); const [error,setError] = useState(''); const load = useCallback(async () => { setError(''); try { setReview(await getReview(id)); } catch(e) { setError(errorMessage(e)); } }, [id]); useEffect(() => { void load(); }, [load]);
  if (error) return <RequestError message={error} retry={load} />; if (!review) return <RequestLoading />;
  const grounded = !['synthesized','built-in'].includes(review.model) && !!review.documentId;
  return <div className="agreement-review"><section className="card card-pad"><div className="agreement-section-head"><div><span className="section-kicker">{grounded ? 'Document-grounded review' : 'Document review pending'}</span><h3>{grounded ? 'A clear view of the risks.' : 'Add an extracted source to review.'}</h3></div><RiskGauge score={review.riskScore} level={review.riskLevel} /></div><p className="section-summary">{review.summary}</p><p className="req-help">{grounded ? 'Verify findings against the source. AI recommendations remain advisory.' : 'The current overview uses metadata or illustrative findings. It cannot support document approval.'}</p>{review.documentId && <a className="btn" href={`/api/documents/${review.documentId}/file`}>Open source document</a>}</section>
  <section className="card card-pad"><h3>{review.deviations.length} playbook deviations</h3>{review.deviations.map(d => <DeviationCard key={d.id} d={d} />)}{!review.deviations.length && <p className="req-help">No deviations were returned. This does not replace counsel’s review.</p>}</section><details className="card card-pad workflow-disclosure"><summary>Source clauses &amp; extracted terms</summary><div className="req-terms">{review.extractedTerms.map(t => <div key={t.key}><b>{t.key}</b><p>{t.value}</p></div>)}</div>{review.clauses.map(c => <article className="clause-block" key={c.id}><h4>{c.clauseNo}. {c.heading}</h4><p>{c.excerpt}</p></article>)}</details></div>;
}
