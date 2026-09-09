'use client';

import { useEffect, useMemo, useState } from 'react';
import type { IntakeRequest } from '@concord/shared';
import { createIntake, getIntake } from '@/app/lib/api';
import { LoadingState } from '@/components/WorkspaceUI';
import { IconCheck, IconDoc, IconSparkle } from '@/components/icons';

const RISK: Record<string, string> = { low: 'low', medium: 'med', high: 'high' };
const STATUS: Record<string, string> = { new: 'neutral', triaged: 'info', converted: 'low' };
const EMPTY = { title: '', counterparty: '', businessUnit: '', requestor: '', contractType: '', description: '' };

export default function IntakePage() {
  const [rows, setRows] = useState<IntakeRequest[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    getIntake().then(setRows).catch((e) => setErr(e instanceof Error ? e.message : 'Could not load requests')).finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => ({
    open: rows.filter((r) => r.status !== 'converted').length,
    high: rows.filter((r) => r.triageRisk === 'high').length,
    converted: rows.filter((r) => r.status === 'converted').length,
  }), [rows]);

  const up = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((current) => ({ ...current, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(''); setSuccess('');
    try {
      const created = await createIntake({ ...form, contractType: form.contractType || undefined });
      setRows((current) => [created, ...current]);
      setForm(EMPTY);
      setSuccess(`${created.id} was triaged and added to the request queue.`);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Request submission failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="view-head">
        <div className="vh-left"><div className="eyebrow">Business-to-legal front door</div><h2>Contract requests</h2><p>Capture the commercial context once, route it consistently, and let Concord suggest the contract path and preliminary risk for legal review.</p></div>
      </div>

      <div className="metric-strip compact-metrics">
        <div><span>Open requests</span><b>{loading ? '—' : counts.open}</b><small>awaiting conversion</small></div>
        <div><span>High-risk triage</span><b>{loading ? '—' : counts.high}</b><small>priority attention</small></div>
        <div><span>Converted</span><b>{loading ? '—' : counts.converted}</b><small>entered lifecycle</small></div>
      </div>

      <div className="intake-layout">
        <section className="card intake-form-card">
          <div className="form-card-head"><span className="document-avatar"><IconDoc /></span><div><h3>New contract request</h3><p>Required fields are marked. Add enough context for meaningful triage.</p></div></div>
          <form className="premium-form" onSubmit={submit}>
            <label><span>Request title *</span><input placeholder="e.g. FY27 payroll services agreement" value={form.title} onChange={up('title')} required maxLength={160} /></label>
            <label><span>Counterparty *</span><input placeholder="Legal entity or supplier" value={form.counterparty} onChange={up('counterparty')} required maxLength={160} /></label>
            <label><span>Business unit *</span><input placeholder="e.g. People, Procurement, Digital" value={form.businessUnit} onChange={up('businessUnit')} required maxLength={120} /></label>
            <label><span>Requestor email *</span><input type="email" placeholder="name@company.com" value={form.requestor} onChange={up('requestor')} required autoComplete="email" /></label>
            <label className="span-2"><span>Known contract type <small>optional</small></span><select value={form.contractType} onChange={up('contractType')}><option value="">Let Concord suggest</option><option>MSA</option><option>NDA</option><option>SOW</option><option>Vendor Agreement</option><option>Employment</option><option>Lease</option><option>Other</option></select></label>
            <label className="span-2"><span>Commercial context *</span><textarea placeholder="Describe scope, commercial objective, timing, data involved, negotiation constraints and anything legal should know." value={form.description} onChange={up('description')} required maxLength={4000} /></label>
            <div className="form-submit span-2"><button className="btn btn-gold" disabled={busy}>{busy ? 'Triaging request…' : 'Submit & triage'}</button><span><IconSparkle />Preliminary triage supports—not replaces—legal judgment.</span></div>
          </form>
          <div aria-live="polite">{success && <div className="form-message success"><IconCheck />{success}</div>}{err && <div className="form-message error">{err}</div>}</div>
        </section>

        <aside className="card intake-guide">
          <div className="section-kicker">What happens next</div>
          <ol className="guided-steps"><li><span>1</span><div><b>Request validation</b><p>Required commercial context is captured and normalized.</p></div></li><li><span>2</span><div><b>AI-assisted triage</b><p>Contract type, template fit and preliminary risk are suggested.</p></div></li><li><span>3</span><div><b>Legal ownership</b><p>The request moves into the controlled contract lifecycle.</p></div></li></ol>
        </aside>
      </div>

      <section className="card request-table">
        <div className="section-table-head"><div><span className="section-kicker">Request queue</span><h3>Recent intake</h3></div><span className="result-count">{rows.length} request{rows.length === 1 ? '' : 's'}</span></div>
        <div className="tbl-wrap"><table className="tbl tbl-responsive" role="table" aria-label="Contract request queue"><thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Request</th><th scope="col" role="columnheader">Counterparty</th><th scope="col" role="columnheader">Unit</th><th scope="col" role="columnheader">Type</th><th scope="col" role="columnheader">Template</th><th scope="col" role="columnheader">Risk</th><th scope="col" role="columnheader">Status</th></tr></thead><tbody role="rowgroup">
          {loading && <tr role="row"><td role="cell" colSpan={7}><LoadingState compact label="Loading request queue" /></td></tr>}
          {rows.map((r) => <tr role="row" key={r.id}><td role="cell" data-label="Request"><span className="t-strong">{r.title}</span><br /><span className="t-id">{r.id}</span></td><td role="cell" data-label="Counterparty">{r.counterparty}</td><td role="cell" data-label="Unit">{r.businessUnit}</td><td role="cell" data-label="Type">{r.contractType}</td><td role="cell" data-label="Template" className="t-id">{r.suggestedTemplateId ?? '—'}</td><td role="cell" data-label="Risk">{r.triageRisk ? <span className={`badge ${RISK[r.triageRisk]}`}><span className="d" />{r.triageRisk}</span> : '—'}</td><td role="cell" data-label="Status"><span className={`badge ${STATUS[r.status]}`}><span className="d" />{r.status}</span></td></tr>)}
          {!loading && rows.length === 0 && <tr role="row"><td role="cell" colSpan={7}><div className="table-empty"><IconDoc /><span>No requests yet. The next submission will appear here.</span></div></td></tr>}
        </tbody></table></div>
      </section>

      <p className="page-note">Triage output is advisory. Material decisions and lifecycle transitions remain attributable to an authenticated user and the audit trail.</p>
    </>
  );
}
