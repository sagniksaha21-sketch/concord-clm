'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Clause, DraftResult, Template } from '@concord/shared';
import { generateDraft, getClauses, getTemplates } from '@/app/lib/api';
import { EmptyState, ErrorState, LoadingState } from '@/components/WorkspaceUI';
import { IconDoc, IconSparkle } from '@/components/icons';

export default function AuthoringPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [clauses, setClauses] = useState<Clause[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true); setLoadError('');
    try {
      const [nextTemplates, nextClauses] = await Promise.all([getTemplates(), getClauses()]);
      setTemplates(nextTemplates); setClauses(nextClauses);
      setTemplateId((current) => current || nextTemplates[0]?.id || '');
    } catch (e) { setLoadError(e instanceof Error ? e.message : 'The authoring library could not be loaded.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function gen() {
    if (!templateId || !counterparty.trim() || busy) return;
    setBusy(true); setDraft(null); setError('');
    try { setDraft(await generateDraft({ templateId, counterparty })); }
    catch (e) { setError(e instanceof Error ? e.message : 'Draft generation failed.'); }
    finally { setBusy(false); }
  }

  return <>
    <div className="view-head"><div className="vh-left">
      <div className="eyebrow">Authoring studio</div>
      <h2>Start with approved language.</h2>
      <p>Choose a template, add the counterparty, and prepare a first draft from your legal playbook.</p>
    </div></div>
    {loadError && <ErrorState title="Authoring library unavailable" action={<button className="btn" onClick={load}>Try again</button>}>{loadError}</ErrorState>}
    <section className="card card-pad" style={{ marginBottom: 20 }}>
      <form className="authoring-controls" onSubmit={(e) => { e.preventDefault(); void gen(); }}>
        <label className="premium-field"><span>Approved template</span>
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} disabled={loading || !templates.length} required>
            {!templates.length && <option value="">{loading ? 'Loading templates…' : loadError ? 'Templates unavailable' : 'No templates available'}</option>}
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.contractType}</option>)}
          </select>
        </label>
        <label className="premium-field"><span>Counterparty</span><input placeholder="Legal entity name" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} required /></label>
        <button className="btn btn-gold" disabled={busy || loading || !templateId || !counterparty.trim()}><IconSparkle />{busy ? 'Drafting…' : 'Generate draft'}</button>
      </form>
    </section>
    {error && <ErrorState title="Draft generation unavailable">{error}</ErrorState>}
    <div className="grid">
      <section className="card" aria-label="Draft workspace" aria-busy={busy}>
        {busy ? <LoadingState label="Preparing your first draft" /> : draft ? <>
          <div className="card-head"><h3><IconDoc />{draft.title}</h3><span className="ai-tag">{draft.model}</span></div>
          <div className="doc">{draft.sections.map((s, i) => <section key={i}><h5>{s.heading}</h5><p>{s.body}</p></section>)}</div>
        </> : <EmptyState title="Your next agreement starts here" action={!loading && !loadError && !templates.length ? <Link className="btn" href="/templates">Open template library</Link> : undefined}>
          {loading ? 'Your authoring library is loading.' : !loadError && !templates.length ? 'Add a template to your library before generating a draft.' : 'Select an approved template and counterparty. Your draft will appear here for counsel review.'}
        </EmptyState>}
      </section>
      <section className="card">
        <div className="card-head"><h3><IconDoc />Clause library</h3><span className="chip">{loading ? '—' : clauses.length}</span></div>
        {loading ? <LoadingState label="Loading clauses" /> : loadError ? <p className="card-pad">Clauses could not be loaded.</p> : !clauses.length ? <EmptyState title="No clauses available">Approved playbook clauses will appear here for reference.</EmptyState> :
          <div className="clause-library">{clauses.map((c) => <details key={c.id}><summary>{c.title}<span className="chip">{c.category}</span></summary><p>{c.text}</p></details>)}</div>}
      </section>
    </div>
    <p className="page-note">Generated language is advisory. Review the draft against the approved template, playbook and commercial instructions before use.</p>
  </>;
}
