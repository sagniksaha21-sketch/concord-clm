'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Contract } from '@concord/shared';
import { getContracts } from '@/app/lib/api';
import { IconFilter, IconSearch, IconSparkle } from '@/components/icons';

const STAGE_WEIGHT: Record<string, number> = { review: 0, approval: 1, drafting: 2, intake: 3, signature: 4, active: 5, renewal: 6 };
const RISK_WEIGHT: Record<string, number> = { high: 0, medium: 1, low: 2 };

export default function ReviewQueuePage() {
  const [contracts, setContracts] = useState<Contract[] | null>(null);
  const [q, setQ] = useState('');
  const [risk, setRisk] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [err, setErr] = useState('');

  useEffect(() => {
    getContracts().then(setContracts).catch((e) => setErr(e instanceof Error ? e.message : 'Could not load contracts'));
  }, []);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return [...(contracts ?? [])]
      .filter((c) => risk === 'all' || c.risk === risk)
      .filter((c) => !term || `${c.title} ${c.counterparty} ${c.id} ${c.type}`.toLowerCase().includes(term))
      .sort((a, b) => (STAGE_WEIGHT[a.stage] ?? 99) - (STAGE_WEIGHT[b.stage] ?? 99) || (RISK_WEIGHT[a.risk] ?? 99) - (RISK_WEIGHT[b.risk] ?? 99));
  }, [contracts, q, risk]);

  const reviewReady = (contracts ?? []).filter((c) => ['review', 'approval'].includes(c.stage)).length;
  const high = (contracts ?? []).filter((c) => c.risk === 'high').length;

  return (
    <>
      <div className="view-head">
        <div className="vh-left">
          <div className="eyebrow">AI workbench</div>
          <h2>Review queue</h2>
          <p>Prioritise agreements that need legal attention, then open a grounded AI review with playbook deviations and approval routing.</p>
        </div>
      </div>

      <div className="metric-strip">
        <div><span>Ready for review</span><b>{contracts ? reviewReady : '—'}</b><small>review + approval stages</small></div>
        <div><span>High-risk portfolio</span><b>{contracts ? high : '—'}</b><small>senior-counsel attention</small></div>
        <div><span>Total contracts</span><b>{contracts?.length ?? '—'}</b><small>system of record</small></div>
      </div>

      <div className="toolbar card">
        <label className="toolbar-search">
          <IconSearch />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, counterparty, ID or type" aria-label="Search review queue" />
        </label>
        <div className="segmented" role="group" aria-label="Filter by risk">
          <IconFilter />
          {(['all', 'high', 'medium', 'low'] as const).map((r) => (
            <button key={r} className={risk === r ? 'is-active' : ''} aria-pressed={risk === r} onClick={() => setRisk(r)}>{r}</button>
          ))}
        </div>
      </div>

      {err && <div className="card state-card error-state"><b>Review queue unavailable</b><p>{err}</p></div>}
      {!err && !contracts && <div className="review-grid">{[0,1,2,3,4,5].map((i) => <div className="skeleton review-card-skeleton" key={i} />)}</div>}
      {contracts && !rows.length && <div className="card state-card"><IconSearch /><b>No contracts match these filters.</b><p>Clear the search or choose another risk level.</p></div>}

      {rows.length > 0 && (
        <div className="review-grid">
          {rows.map((c) => (
            <Link className="review-queue-card" data-risk={c.risk} href={`/review/${encodeURIComponent(c.id)}`} key={c.id}>
              <div className="rqc-top">
                <span className={`badge ${c.risk === 'medium' ? 'med' : c.risk}`}><i className="bd" />{c.risk}</span>
                <span className="rqc-stage">{c.stage}</span>
              </div>
              <div className="rqc-icon"><IconSparkle /></div>
              <h3>{c.title}</h3>
              <p>{c.counterparty}</p>
              <div className="rqc-meta"><span>{c.type}</span><span>{c.valueDisplay}</span><span>{c.version}</span></div>
              <div className="rqc-foot"><span className="t-id">{c.id}</span><b>Open review →</b></div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
