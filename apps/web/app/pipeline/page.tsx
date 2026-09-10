'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { PipelineBoard } from '@concord/shared';
import { getPipeline } from '@/app/lib/api';
import { IconAlert, IconFilter, IconFlow, IconSearch } from '@/components/icons';

const TONE: Record<string, string> = { neutral: 'var(--line-2)', info: 'var(--info)', med: 'var(--med)', low: 'var(--low)', high: 'var(--high)' };

export default function PipelinePage() {
  const [board, setBoard] = useState<PipelineBoard | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [risk, setRisk] = useState<'all' | 'high' | 'medium' | 'low'>('all');

  useEffect(() => { getPipeline().then(setBoard).catch((e) => setErr(e instanceof Error ? e.message : 'Could not load the pipeline')); }, []);

  const lanes = useMemo(() => (board?.lanes ?? []).map((lane) => ({ ...lane, cards: lane.cards.filter((c) => {
    const term = q.trim().toLowerCase();
    return (risk === 'all' || c.risk === risk) && (!term || `${c.title} ${c.counterparty} ${c.id}`.toLowerCase().includes(term));
  }) })), [board, q, risk]);
  const visibleCount = lanes.reduce((total, lane) => total + lane.cards.length, 0);
  const highCount = (board?.lanes ?? []).flatMap((l) => l.cards).filter((c) => c.risk === 'high').length;
  const reviewCount = (board?.lanes ?? []).filter((l) => ['review', 'approval'].includes(l.stage)).reduce((n, l) => n + l.cards.length, 0);

  if (err) return <div className="card state-card error-state"><IconAlert /><b>The pipeline could not be loaded.</b><p>{err}</p></div>;
  if (!board) return <div className="pipeline-loading">{[0,1,2,3].map((i) => <div className="skeleton lane-skeleton" key={i} />)}</div>;

  return (
    <>
      {board.sampleData && <div className="demo-note"><IconAlert /><span><b>Illustrative data.</b> This board is showing sample contracts, not a verified live portfolio.</span></div>}
      <div className="view-head"><div className="vh-left"><div className="eyebrow">Lifecycle command board</div><h2>Contract pipeline</h2><p>See work, risk and bottlenecks across every lifecycle stage without creating a second source of truth.</p></div><div className="view-actions"><Link className="btn btn-gold" href="/intake">New request</Link></div></div>

      <div className="metric-strip compact-metrics"><div><span>Portfolio</span><b>{board.total}</b><small>contracts on board</small></div><div><span>In legal review</span><b>{reviewCount}</b><small>review + approval</small></div><div><span>High risk</span><b>{highCount}</b><small>priority exposure</small></div></div>

      <div className="toolbar card pipeline-toolbar"><label className="toolbar-search"><IconSearch /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contract, counterparty or ID" aria-label="Search pipeline" /></label><div className="segmented" role="group" aria-label="Filter pipeline by risk"><IconFilter />{(['all','high','medium','low'] as const).map((r) => <button key={r} className={risk === r ? 'is-active' : ''} aria-pressed={risk === r} onClick={() => setRisk(r)}>{r}</button>)}</div><span className="result-count">{visibleCount} shown</span></div>

      <div className="pipeline premium-pipeline">
        {lanes.map((lane) => (
          <section className="lane" key={lane.stage}>
            <div className="lane-head"><span className="lh-dot" style={{ background: TONE[lane.tone] ?? 'var(--line-2)' }} /><h4>{lane.label}</h4><span className="lh-count">{lane.cards.length}</span></div>
            <div className="lane-body">
              {lane.cards.map((c) => <Link className="kcard" key={c.id} href={c.href ?? '#'}><div className="kc-top"><div className="kc-title">{c.title}</div><span className={`badge ${c.risk === 'medium' ? 'med' : c.risk}`}><i className="bd" />{c.risk}</span></div><div className="kc-cp"><span className="cpav">{c.counterparty.slice(0, 1).toUpperCase()}</span>{c.counterparty}</div><div className="kc-foot"><span className="kc-val">{c.valueDisplay}</span>{c.versionLabel && <span className="kc-days">{c.versionLabel}</span>}</div><div className="kc-id">{c.id}</div></Link>)}
              {!lane.cards.length && <div className="lane-empty">No matching work</div>}
            </div>
          </section>
        ))}
      </div>

      <div className="card card-pad pipeline-note"><IconFlow /><p>Stage is a property of the persisted contract record. Review, approvals and e-signature advance work through controlled actions that remain attributable in the audit trail.</p></div>
    </>
  );
}
