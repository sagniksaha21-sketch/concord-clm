'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { DashboardSummary } from '@concord/shared';
import { getDashboard } from '@/app/lib/api';
import { CountUp, Gauge, Skeleton } from '@/components/Motion';
import {
  IconAlert, IconArrowDown, IconArrowUp, IconCalendar, IconClock, IconDoc,
  IconFlow, IconRupee, IconSparkle,
} from '@/components/icons';

const STAT_ICON: Record<string, (p: { className?: string }) => JSX.Element> = {
  contracts: IconDoc,
  obligations: IconCalendar,
  signature: IconClock,
  risk: IconAlert,
};

function Trend({ t }: { t: NonNullable<DashboardSummary['stats'][number]['trend']> }) {
  const Icon = t.direction === 'up' ? IconArrowUp : t.direction === 'down' ? IconArrowDown : null;
  return (
    <span className={`trend ${t.direction}`}>
      {Icon ? <Icon /> : null}
      {t.label}
    </span>
  );
}

export default function CommandCenter() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Could not load the portfolio'));
  }, []);

  if (err) {
    return (
      <div className="card card-pad">
        <b>The portfolio could not be loaded.</b>
        <p style={{ color: 'var(--muted)', marginTop: 6, fontSize: 13 }}>{err}</p>
      </div>
    );
  }
  if (!data) {
    // A skeleton rather than the word "Loading": the shell, the sidebar counts
    // and the page frame are already on screen, so a bare centred word reads as
    // a broken page. The placeholders are deliberately shapeless — mimicking
    // rows would imply a row count nothing has counted yet.
    return (
      <>
        <div className="skeleton" style={{ height: 78, marginBottom: 18 }} />
        <div className="bento" style={{ marginBottom: 18 }}>
          {[0, 1, 2, 3].map((i) => (
            <div className="skeleton sk-card col-3" key={i} />
          ))}
        </div>
        <div className="card card-pad"><Skeleton lines={4} /></div>
      </>
    );
  }

  const maxStage = Math.max(1, ...data.pipeline.map((p) => p.count));
  const riskTotal = Math.max(1, data.risk.low + data.risk.medium + data.risk.high);
  // Look stats up by KEY, never by position. The e-signature stat is omitted
  // for roles without `esign:send`, so the array is a different length per role
  // — `stats[3]` was the risk figure for a lead and `undefined` for a viewer,
  // who would have been told "0 carrying high playbook risk" no matter how many
  // there were.
  const stat = (key: string) => data.stats.find((s) => s.key === key)?.value ?? '0';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const reviewHref = data.attention.find((a) => a.href?.startsWith('/review/'))?.href ?? '/review';

  return (
    <>
      {data.sampleData && (
        <div className="demo-note">
          <IconAlert style={{ width: 15, height: 15, stroke: 'var(--gold)', flex: 'none' }} />
          <span>
            <b>Illustrative data.</b> No database is configured (or demo fixtures are on), so the
            figures below include sample records. With a live database every number here is computed
            from real contracts, obligations and signature requests.
          </span>
        </div>
      )}

      <div className="view-head">
        <div className="vh-left">
          <h2>
            {greeting}
            {data.greetingName ? `, ${data.greetingName.split(' ')[0]}` : ''}.
          </h2>
          <p>
            {stat('contracts')} contracts in the portfolio ·{' '}
            {stat('obligations')} key dates inside 90 days ·{' '}
            {stat('risk')} carrying high playbook risk.
          </p>
        </div>
        <div className="view-actions">
          <Link className="btn" href="/intake">New request</Link>
          <Link className="btn btn-gold" href={reviewHref}>
            <IconSparkle />
            Open AI Review
          </Link>
        </div>
      </div>

      {/* KPI row */}
      <div className="bento" style={{ marginBottom: 18 }}>
        {data.stats.map((s) => {
          const Icon = STAT_ICON[s.key] ?? IconRupee;
          return (
            <div className="card stat col-3" key={s.key}>
              <div className="s-top">
                <span className="s-label">{s.label}</span>
                <span className="s-ico"><Icon /></span>
              </div>
              <div className="s-val">
                {/* Counts up to the real figure and lands exactly on it. A
                    non-numeric value (a currency string, an em dash) is printed
                    as-is rather than coerced — animating something that is not
                    a number is how a dashboard starts inventing one. */}
                {Number.isFinite(Number(s.value)) && s.value.trim() !== ''
                  ? <CountUp value={Number(s.value)} />
                  : s.value}
                {s.unit ? <small>{s.unit}</small> : null}
              </div>
              {s.trend ? <Trend t={s.trend} /> : null}
            </div>
          );
        })}
      </div>

      <div className="bento" style={{ marginBottom: 18 }}>
        {/* In-flight pipeline */}
        <div className="card col-5">
          <div className="card-head">
            <h3><IconFlow />In-flight pipeline</h3>
            <Link className="ch-act" href="/pipeline">Open board →</Link>
          </div>
          <div className="funnel">
            {data.pipeline.map((p) => (
              <div className="fbar" key={p.stage}>
                <span className="fb-label">{p.label}</span>
                <div className="fb-track">
                  <div
                    className="fb-fill"
                    style={{ ['--sx' as string]: String(p.count / maxStage) }}
                  />
                </div>
                <span className="fb-val">{p.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Risk distribution */}
        <div className="card col-4">
          <div className="card-head"><h3><IconAlert />Risk distribution</h3></div>
          <div className="card-pad">
            {/*
              The Xcelerate speedometer, wired to the SAME numbers the legend
              below prints. It shows high-risk contracts as a share of the
              portfolio — one real quantity, labelled. A dial that sweeps to a
              position nothing computed would be a chart that lies, which is
              worse on a legal dashboard than having no dial at all.
            */}
            <Gauge
              tone="risk"
              value={data.risk.high}
              max={riskTotal}
              display={`${Math.round((data.risk.high / riskTotal) * 100)}%`}
              caption="Share at high playbook risk"
            />
            <div className="segbar" style={{ marginTop: 14 }}>
              <span style={{ flexGrow: data.risk.low, background: 'var(--low)' }} />
              <span style={{ flexGrow: data.risk.medium, background: 'var(--med)' }} />
              <span style={{ flexGrow: data.risk.high, background: 'var(--high)' }} />
            </div>
            <div className="seg-leg">
              <span className="lg"><i className="sw" style={{ background: 'var(--low)' }} />Low <b>{data.risk.low}</b></span>
              <span className="lg"><i className="sw" style={{ background: 'var(--med)' }} />Medium <b>{data.risk.medium}</b></span>
              <span className="lg"><i className="sw" style={{ background: 'var(--high)' }} />High <b>{data.risk.high}</b></span>
            </div>
            <p style={{ marginTop: 16, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55 }}>
              {Math.round((data.risk.high / riskTotal) * 100)}% of the portfolio is flagged high
              risk against the LLPL playbook. Those are recommended for senior-counsel sign-off
              before approval.
            </p>
          </div>
        </div>

        {/* Insights */}
        <div className="card col-3">
          <div className="card-head">
            <h3><IconSparkle />Insights</h3>
            <span className="live-dot" title="Derived live from the portfolio" />
          </div>
          <div className="insight-feed">
          {data.insights.map((i) => (
            <div className="insight" key={i.id}>
              <span className="i-ico"><IconSparkle /></span>
              <div className="i-body">
                {i.body}
                <span className="i-time">derived just now · no model call</span>
              </div>
            </div>
          ))}
          </div>
        </div>
      </div>

      <div className="bento">
        {/* Needs attention */}
        <div className="card col-8">
          <div className="card-head">
            <h3><IconAlert />Needs attention</h3>
            <Link className="ch-act" href="/pipeline">View all →</Link>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Contract</th><th>Counterparty</th><th>Value</th>
                  <th>Stage</th><th>Risk</th><th>Key date</th>
                </tr>
              </thead>
              <tbody>
                {data.attention.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link href={a.href ?? '#'} className="t-strong">{a.title}</Link>
                      <div className="t-id">{a.id}</div>
                    </td>
                    <td>{a.counterparty}</td>
                    <td>{a.valueDisplay}</td>
                    <td><span className="badge neutral">{a.stage}</span></td>
                    <td>
                      <span className={`badge ${a.risk === 'medium' ? 'med' : a.risk}`}>
                        <i className="bd" />{a.risk}
                      </span>
                    </td>
                    <td className="t-id">{a.keyDate}</td>
                  </tr>
                ))}
                {!data.attention.length && (
                  <tr><td colSpan={6}><div className="empty">Nothing needs attention.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Next renewals */}
        <div className="card col-4">
          <div className="card-head">
            <h3><IconCalendar />Next key dates</h3>
            <Link className="ch-act" href="/obligations">Calendar →</Link>
          </div>
          <div className="rowlist">
            {data.renewals.map((o) => (
              <div className="row" key={o.id}>
                <span className="avatar-cp">{o.ownerInitials}</span>
                <div className="r-main">
                  <div className="r-title">{o.contractTitle}</div>
                  <div className="r-sub">{o.title}</div>
                </div>
                <span className={`badge ${o.status === 'at-risk' ? 'high' : o.status === 'due-soon' ? 'med' : 'low'}`}>
                  {o.dueDate}
                </span>
              </div>
            ))}
            {!data.renewals.length && <div className="empty">No key dates in the next 90 days.</div>}
          </div>
        </div>
      </div>
    </>
  );
}
