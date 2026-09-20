'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { AgreementWorkspace, ClientRequest, STAGE_LABELS } from '@concord/shared';
import { getAgreementWorkspace } from '@/app/lib/api';
import { RequestError, RequestLoading, TermSheet, errorMessage, requestDate } from '@/components/RequestUI';
import LifecycleRail from '@/components/LifecycleRail';
import RequestActions from '@/components/RequestActions';
import RequestConversation from '@/components/RequestConversation';
import AgreementObligations from '@/components/AgreementObligations';
import AgreementVersions from '@/components/AgreementVersions';
import AgreementAmendments from '@/components/AgreementAmendments';
import ApprovalHistory from '@/components/ApprovalHistory';
const AgreementNegotiation = dynamic(() => import('@/components/AgreementNegotiation'), { loading: () => <RequestLoading /> });
const AgreementDraft = dynamic(() => import('@/components/AgreementDraft'), { loading: () => <RequestLoading /> });
const AgreementReview = dynamic(() => import('@/components/AgreementReview'), { loading: () => <RequestLoading /> });
const AgreementApprovals = dynamic(() => import('@/components/AgreementApprovals'), { loading: () => <RequestLoading /> });
const AgreementSignatures = dynamic(() => import('@/components/AgreementSignatures'), { loading: () => <RequestLoading /> });
const currentPanel = (stage: string) => ({ intake: 'request', drafting: 'draft', review: 'review', negotiation: 'negotiation', agreed: 'approval', approval: 'approval', signature: 'signature', active: 'overview', renewal: 'obligations' } as Record<string,string>)[stage] ?? 'overview';
export default function AgreementPage({ params }: { params: { id: string } }) {
  const [dirty,setDirty] = useState(false);
  const [data,setData] = useState<AgreementWorkspace>(); const [panel,setPanel] = useState(''); const [error,setError] = useState('');
  const load = useCallback(async () => { setError(''); try { const next = await getAgreementWorkspace(params.id); setData(next); setPanel(p => p || currentPanel(next.contract.stage)); } catch(e) { setError(errorMessage(e)); } }, [params.id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (data) setPanel(currentPanel(data.contract.stage)); }, [data?.contract.stage]);
  function switchPanel(key: string) { if (!dirty || window.confirm('Leave without saving this draft?')) { setDirty(false); setPanel(key); } }
  function changed(next: AgreementWorkspace) { setData(next); if (next.contract.stage !== data?.contract.stage) setPanel(currentPanel(next.contract.stage)); }
  function requestChanged(request: ClientRequest) { setData(d => d ? { ...d, request } : d); if (request.contractStage !== data?.contract.stage) void load().then(() => setPanel(currentPanel(request.contractStage))); }
  if (error) return <RequestError message={error} retry={load} />; if (!data) return <RequestLoading />;
  const c = data.contract, executed = !!data.archive, stage = executed ? 'Executed' : STAGE_LABELS[c.stage] ?? c.stage;
  const canWrite = data.permissions.includes('contract:write'), canRoute = data.permissions.includes('approval:route'), canSign = data.permissions.includes('esign:send');
  const tabs = executed ? [['overview','Overview'],['executed','Executed agreement'],['obligations','Obligations & key dates'],['versions','Versions'], ...(canWrite ? [['negotiation','Negotiation & guest access']] : []), ...(data.request ? [['input','Business input']] : []), ...(data.permissions.includes('audit:read') ? [['activity','Activity & audit']] : [])] : [['overview','Overview'], ...(data.request ? [['request','Request']] : []), ...(canWrite ? [['draft','Draft']] : []), ['review','Internal review'], ...(canWrite && ['review','negotiation','agreed','approval','signature'].includes(c.stage) ? [['negotiation','Negotiation']] : []), ...(['review','negotiation','agreed','approval','signature'].includes(c.stage) ? [['approval','Approval']] : []), ...(canSign && c.stage === 'signature' ? [['signature','Signature']] : []), ...(data.request && c.stage !== 'intake' ? [['input','Business input']] : []), ['versions','Versions'], ...(data.permissions.includes('audit:read') ? [['activity','Activity']] : [])];
  const selected = tabs.some(t => t[0] === panel) ? panel : 'overview';
  return <div className="agreement-page agreement-workspace"><Link className="req-back" href={executed ? '/repository' : '/work'}>← {executed ? 'Contracts' : 'Work'}</Link>
  <header className="agreement-header"><div><div className="eyebrow">{c.requestId ?? c.type} · {c.version}</div><h2>{c.title}</h2><p>{c.counterparty}{c.businessUnit ? ` · ${c.businessUnit}` : ''}</p></div><div className="agreement-badges"><span className={`badge ${executed ? 'low' : 'neutral'}`}>{stage}</span><span className={`badge ${c.risk === 'medium' ? 'med' : c.risk}`}>{c.risk} risk</span></div></header>
  <section className="agreement-focus card"><div><span className="section-kicker">{executed ? 'Permanent agreement record' : c.waitingOnClient ? 'Waiting for business input' : 'Next action'}</span><h3>{executed ? 'Signed, preserved and ready to manage.' : c.nextAction}</h3><p>{executed ? `Executed ${requestDate(data.archive!.completedAt)}` : c.waitingOnClient ? `${c.businessOwner ?? 'Requestor'} owns the next response.` : `${c.waitingOn ?? c.ownerName ?? 'Legal team'} owns the next step.`}</p></div><dl><div><dt>Legal owner</dt><dd>{c.ownerName ?? 'Not assigned'}</dd></div><div><dt>{executed ? 'Executed' : 'Target date'}</dt><dd>{executed ? requestDate(data.archive!.completedAt) : c.dueDate ? requestDate(c.dueDate) : 'Not set'}</dd></div></dl></section>
  <LifecycleRail stage={c.stage} executed={executed} />
  <nav className="agreement-tabs" aria-label="Agreement sections">{tabs.map(([key,label]) => <button key={key} aria-current={selected === key ? 'page' : undefined} onClick={() => switchPanel(key)}>{label}</button>)}</nav>
  <div className="agreement-panel" key={selected}>
  {selected === 'overview' && <div className="agreement-layout"><div className="agreement-main"><section className="card card-pad"><h3>Agreement overview</h3><dl className="agreement-facts"><div><dt>Agreement type</dt><dd>{c.type}</dd></div><div><dt>Value</dt><dd>{c.valueDisplay}</dd></div><div><dt>Business owner</dt><dd>{c.businessOwner ?? 'Not recorded'}</dd></div><div><dt>Legal owner</dt><dd>{c.ownerName ?? 'Not assigned'}</dd></div></dl>{data.request && <p className="agreement-scope">{data.request.terms.scope}</p>}<button className="btn btn-gold" onClick={() => setPanel(executed ? 'executed' : currentPanel(c.stage))}>{executed ? 'Open executed agreement' : 'Continue this agreement'} →</button></section>{data.request?.status === 'waiting-on-client' && <RequestConversation item={data.request} onChange={requestChanged} />}</div><aside className="card card-pad"><h3>Continuity of record</h3><p className="req-help">{data.documents.length} document versions are preserved with this agreement.</p>{data.request && <p className="req-help">Business request: {data.request.id}<br />Raised by {data.request.requester.name}</p>}{executed && <p className="req-help">The executed copy is the authoritative record. Earlier drafts remain in Versions.</p>}</aside></div>}
  {selected === 'request' && data.request && <div className="agreement-layout"><div className="agreement-main"><section className="card card-pad"><div className="agreement-section-head"><h3>Request term sheet</h3><span className="req-id">{data.request.requester.name}</span></div><TermSheet terms={data.request.terms} /><RequestActions item={data.request} onChange={requestChanged} /></section>{!!data.request.attachments?.length && <section className="card card-pad"><h3>Supporting documents</h3><ul className="attachment-list">{data.request.attachments.map(a => <li key={a.id}><span><b>{a.filename}</b><small>{a.category}</small></span><a className="btn" href={`/api/request-attachments/${a.id}/file`}>Download</a></li>)}</ul></section>}</div><RequestConversation item={data.request} onChange={requestChanged} /></div>}
  {selected === 'draft' && <AgreementDraft data={data} onChange={changed} onDirtyChange={setDirty} />}
  {selected === 'review' && <><AgreementReview id={c.id} />{canRoute && c.stage === 'review' && <div className="sticky-context req-actions"><button className="btn" onClick={() => setPanel('draft')}>Edit Agreement</button><button className="btn btn-gold" onClick={() => setPanel('negotiation')}>Share with Counterparty →</button><button className="btn" onClick={() => setPanel('approval')}>Request internal approvals</button></div>}</>}
  {selected === 'negotiation' && <AgreementNegotiation data={data} onChange={changed} onEdit={() => switchPanel('draft')} />}
  {selected === 'approval' && <AgreementApprovals id={c.id} canRoute={canRoute && !data.approval} onChange={() => void load()} />}
  {selected === 'signature' && canSign && <div className="embedded-signature"><AgreementSignatures agreementId={c.id} /></div>}
  {selected === 'input' && data.request && <RequestConversation item={data.request} onChange={requestChanged} />}
  {selected === 'executed' && data.archive && <section className="card card-pad executed-record"><span className="confirmation-mark" aria-hidden="true">✓</span><h3>Authoritative executed agreement</h3><p>{data.archive.filename}</p><a className="btn btn-gold" href={`/api/agreements/${encodeURIComponent(c.id)}/executed`}>Download executed PDF</a><details className="workflow-disclosure"><summary>Integrity evidence</summary><dl className="req-terms"><div><dt>Executed</dt><dd>{requestDate(data.archive.completedAt)}</dd></div><div><dt>SHA-256 checksum</dt><dd className="integrity-hash">{data.archive.checksum}</dd></div></dl></details></section>}
  {selected === 'overview' && <AgreementAmendments data={data} />}
  {selected === 'obligations' && <AgreementObligations data={data} onChange={changed} />}
  {selected === 'versions' && <AgreementVersions data={data} />}
  {selected === 'activity' && <section className="card card-pad"><h3>Agreement activity &amp; audit</h3><ol className="conversation-list">{data.activity.map(a => <li key={a.id}><small>{requestDate(a.at)}</small><p>{a.summary}</p><span className="req-id">{a.action}</span></li>)}</ol>{!data.activity.length && <p className="req-help">No recorded activity for this agreement yet.</p>}</section>}
  {selected === 'versions' && <ApprovalHistory rounds={data.approvalHistory ?? []} />}
  </div></div>;
}
