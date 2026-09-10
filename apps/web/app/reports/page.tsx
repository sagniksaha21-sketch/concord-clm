'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PortfolioReport, ReportFormat } from '@concord/shared';
import { downloadPortfolioReport, getPortfolioReport } from '@/app/lib/api';
import { EmptyState, ErrorState, LoadingState } from '@/components/WorkspaceUI';
import { IconAlert, IconArrowRight, IconChart, IconCheck, IconDownload, IconShield } from '@/components/icons';

function labelDate(value?: string): string {
  if (!value) return 'No key date';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const FORMAT_META: Array<{ format: ReportFormat; label: string; detail: string }> = [
  { format: 'xlsx', label: 'Excel register', detail: 'Overview, agreements, obligations and signatures' },
  { format: 'pdf', label: 'PDF brief', detail: 'Three-page legal operations summary' },
  { format: 'pptx', label: 'PowerPoint deck', detail: 'Editable insight slides for leadership review' },
];

export default function ReportsPage() {
  const [report, setReport] = useState<PortfolioReport | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<ReportFormat | null>(null);
  const [downloaded, setDownloaded] = useState<ReportFormat | null>(null);

  useEffect(() => {
    let live = true;
    getPortfolioReport()
      .then((value) => live && setReport(value))
      .catch((reason) => live && setError(reason instanceof Error ? reason.message : 'Could not load the report snapshot'));
    return () => { live = false; };
  }, []);

  const topAgreements = useMemo(() => report?.agreements.slice(0, 5) ?? [], [report]);
  const upcoming = useMemo(() => report?.obligations.slice(0, 5) ?? [], [report]);

  async function exportReport(format: ReportFormat) {
    setBusy(format);
    setDownloaded(null);
    try {
      const response = await downloadPortfolioReport(format);
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') ?? '';
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? `concord-portfolio-report.${format}`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setDownloaded(format);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The report could not be exported');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="view-head reports-head">
        <div className="vh-left">
          <div className="eyebrow">Evidence you can take with you</div>
          <h2>Portfolio reports</h2>
          <p>Turn the current agreement portfolio into a clear register, a board-ready brief or an editable insight deck.</p>
        </div>
        <div className="report-head-mark" aria-hidden="true"><IconChart /></div>
      </div>

      {report?.sampleData && (
        <div className="demo-note"><IconAlert /><span><b>Illustrative data.</b> This snapshot is built from demo fixtures, not verified live agreements.</span></div>
      )}

      {error && <ErrorState title="Reports are unavailable" action={<button className="btn" onClick={() => { setError(''); getPortfolioReport().then(setReport).catch((e) => setError(e instanceof Error ? e.message : 'Could not load the report')); }}>Try again</button>}>{error}</ErrorState>}
      {!error && !report && <LoadingState label="Building the portfolio snapshot" />}

      {report && !error && (
        <>
          <section className="report-hero card">
            <div className="report-hero-copy">
              <span className="eyebrow">{report.dataMode === 'live' ? 'Live snapshot' : 'Illustrative snapshot'}</span>
              <h3>One source for every conversation</h3>
              <p>Concord calculates the findings once from the records your role can see. Every download uses this same snapshot, so the Excel register, PDF brief and PowerPoint deck stay aligned.</p>
              <div className="report-proof"><IconShield /><span>Source text and provider secrets stay out of exports.</span></div>
            </div>
            <div className="report-metrics" aria-label="Report metrics">
              {report.metrics.slice(0, 4).map((metric) => <div className="report-metric" key={metric.key}><span>{metric.label}</span><b>{metric.displayValue}</b><small>{metric.detail}</small></div>)}
            </div>
          </section>

          <section className="report-export-grid" aria-label="Export formats">
            {FORMAT_META.map((item) => (
              <article className={`report-export-card card${busy === item.format ? ' is-busy' : ''}`} key={item.format}>
                <div className="report-export-icon"><span>{item.format === 'xlsx' ? 'XLS' : item.format === 'pdf' ? 'PDF' : 'PPT'}</span></div>
                <div className="report-export-copy"><h3>{item.label}</h3><p>{item.detail}</p></div>
                <button className="btn btn-gold report-download" onClick={() => exportReport(item.format)} disabled={busy !== null}>
                  {busy === item.format ? <span className="button-spinner" aria-hidden="true" /> : downloaded === item.format ? <IconCheck /> : <IconDownload />}
                  <span>{busy === item.format ? 'Preparing' : downloaded === item.format ? 'Downloaded' : 'Download'}</span>
                </button>
              </article>
            ))}
          </section>

          <div className="reports-layout">
            <section className="card report-insights-card">
              <div className="card-head"><h3><IconChart />Derived insights</h3><span className="ch-act">Updated {labelDate(report.generatedAt)}</span></div>
              <div className="report-insights-list">
                {report.insights.map((insight) => <div className={`report-insight report-insight-${insight.tone}`} key={insight.id}><span className="report-insight-dot" /><div><b>{insight.title}</b><p>{insight.body}</p></div></div>)}
              </div>
            </section>

            <section className="card report-method-card">
              <div className="card-head"><h3><IconShield />Scope</h3></div>
              <div className="card-pad report-method-copy">
                <p>{report.agreements.length} agreement rows and {report.obligations.length} obligation rows are in this snapshot.</p>
                <p>Risk is the stored playbook level. Legal review means review or approval stage. Dates come from persisted obligations and extracted agreement records.</p>
                {report.restricted.length > 0 && <p className="report-restricted"><IconAlert /> Signature detail is restricted by your current role.</p>}
              </div>
            </section>
          </div>

          <div className="reports-layout report-registers">
            <section className="card">
              <div className="card-head"><h3>Priority agreements</h3><span className="ch-act">Risk first</span></div>
              {topAgreements.length ? <div className="report-mini-list">{topAgreements.map((row) => <div className="report-mini-row" key={row.id}><span className={`badge ${row.risk === 'medium' ? 'med' : row.risk}`}><i className="bd" />{row.risk}</span><div><b>{row.title}</b><small>{row.counterparty} · {row.stage}</small></div><span className="report-mini-date">{labelDate(row.nextDueDate)}</span></div>)}</div> : <EmptyState title="No agreements in scope" />}
              <a className="report-link" href="/pipeline">Open lifecycle pipeline <IconArrowRight /></a>
            </section>
            <section className="card">
              <div className="card-head"><h3>Upcoming commitments</h3><span className="ch-act">Sorted by due date</span></div>
              {upcoming.length ? <div className="report-mini-list">{upcoming.map((row) => <div className="report-mini-row" key={row.id}><span className={`badge ${row.risk === 'medium' ? 'med' : row.risk}`}><i className="bd" />{row.status}</span><div><b>{row.title}</b><small>{row.contractTitle}</small></div><span className="report-mini-date">{labelDate(row.dueDate)}</span></div>)}</div> : <EmptyState title="No upcoming obligations" />}
              <a className="report-link" href="/obligations">Open obligations <IconArrowRight /></a>
            </section>
          </div>
        </>
      )}
    </>
  );
}

