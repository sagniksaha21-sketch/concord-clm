'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { PipelineBoard } from '@concord/shared';
import { getPipeline, getPermissions } from '@/app/lib/api';
import { IconAlert, IconSearch } from '@/components/icons';

import { agreementHref } from '@/components/workspace-navigation';
import { EmptyState } from '@/components/WorkspaceUI';

const TONE: Record<string, string> = { neutral: 'var(--line-2)', info: 'var(--info)', med: 'var(--med)', low: 'var(--low)', high: 'var(--high)' };

export default function PipelinePage() {
  const [board, setBoard] = useState<PipelineBoard | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [view, setView] = useState<'list' | 'board'>('list');
  const [stage, setStage] = useState('all');
  const [canRequest, setCanRequest] = useState(false);
  const [risk, setRisk] = useState<'all' | 'high' | 'medium' | 'low'>('all');

  useEffect(() => { getPermissions().then(p => setCanRequest(p.permissions.includes('request:write'))).catch(() => undefined); getPipeline().then(setBoard).catch((e) => setErr(e instanceof Error ? e.message : 'Could not load the pipeline')); }, []);

  const lanes = useMemo(() => (board?.lanes ?? []).map((lane) => ({ ...lane, cards: lane.cards.filter((c) => {
    const term = q.trim().toLowerCase();
    return (stage === 'all' || lane.stage === stage) && (risk === 'all' || c.risk === risk) && (!term || `${c.title} ${c.counterparty} ${c.id}`.toLowerCase().includes(term));
  }) })), [board, q, risk, stage]);
  const visibleCount = lanes.reduce((total, lane) => total + lane.cards.length, 0);

  if (err) return <div className="card state-card error-state"><IconAlert /><b>The pipeline could not be loaded.</b><p>{err}</p></div>;
  if (!board) return <div className="pipeline-loading">{[0,1,2,3].map((i) => <div className="skeleton lane-skeleton" key={i} />)}</div>;

  return (
    <>
      {board.sampleData && <div className="demo-note"><IconAlert /><span><b>Illustrative data.</b> This board is showing sample contracts, not a verified live portfolio.</span></div>}
      <div className="view-head"><div className="vh-left"><div className="eyebrow">Your legal workspace</div><h2>Agreements</h2><p>Find an agreement, see where it stands and pick up the next step.</p></div>{canRequest && <div className="view-actions"><Link className="btn btn-gold" href="/requests/new">Request an agreement</Link></div>}</div>
      <div className="toolbar card pipeline-toolbar">
        <label className="toolbar-search"><IconSearch /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Name, counterparty or reference" aria-label="Find an agreement" /></label>
        <label className="req-field"><span className="sr-only">Agreement stage</span><select value={stage} onChange={e => setStage(e.target.value)}><option value="all">All stages</option>{board.lanes.map(lane => <option value={lane.stage} key={lane.stage}>{lane.label}</option>)}</select></label>
        <label className="req-field"><span className="sr-only">Recorded risk</span><select value={risk} onChange={e => setRisk(e.target.value as typeof risk)}><option value="all">All risk levels</option><option value="high">High risk</option><option value="medium">Medium risk</option><option value="low">Low risk</option></select></label>
        <div className="segmented" role="group" aria-label="Agreement view">{(['list','board'] as const).map(v => <button key={v} aria-pressed={view === v} className={view === v ? 'is-active' : ''} onClick={() => setView(v)}>{v === 'list' ? 'List' : 'Board'}</button>)}</div>
      </div>
      <p className="req-count" role="status">{visibleCount} of {board.total} agreements</p>
      {view === 'list' ? <div className="agreement-list">
        {lanes.flatMap(lane => lane.cards.map(c => <Link key={c.id} href={agreementHref(c.id)} className="card agreement-list-row"><div className="agreement-list-copy"><b>{c.title}</b><small>{c.counterparty}</small></div><div className="agreement-list-meta"><span className="agreement-value">{c.valueDisplay}</span><span className="badge neutral">{lane.label}</span></div></Link>))}
        {!visibleCount && <div className="card"><EmptyState title={board.total ? 'No matching agreements' : 'Your agreements will appear here'} action={board.total ? <button className="btn" onClick={() => { setQ(''); setRisk('all'); setStage('all'); }}>Clear filters</button> : undefined}>{board.total ? 'Try a different name or clear the filters.' : 'Start with an agreement request to bring the instructions and legal work together.'}</EmptyState></div>}
      </div> :
      <div className="pipeline premium-pipeline">
        {lanes.map((lane) => (
          <section className="lane" key={lane.stage}>
            <div className="lane-head"><span className="lh-dot" style={{ background: TONE[lane.tone] ?? 'var(--line-2)' }} /><h4>{lane.label}</h4><span className="lh-count">{lane.cards.length}</span></div>
            <div className="lane-body">
              {lane.cards.map((c) => <Link className="kcard" key={c.id} href={agreementHref(c.id)}><div className="kc-top"><div className="kc-title">{c.title}</div><span className={`badge ${c.risk === 'medium' ? 'med' : c.risk}`}><i className="bd" />{c.risk}</span></div><div className="kc-cp"><span className="cpav">{c.counterparty.slice(0, 1).toUpperCase()}</span>{c.counterparty}</div><div className="kc-foot"><span className="kc-val">{c.valueDisplay}</span>{c.versionLabel && <span className="kc-days">{c.versionLabel}</span>}</div><div className="kc-id">{c.id}</div></Link>)}
              {!lane.cards.length && <div className="lane-empty">No matching work</div>}
            </div>
          </section>
        ))}
      </div>}
    </>
  );
}
