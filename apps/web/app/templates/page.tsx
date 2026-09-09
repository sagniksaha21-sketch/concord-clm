'use client';

import { useEffect, useRef, useState } from 'react';
import type { Clause, Template } from '@concord/shared';
import { createTemplate, deleteTemplate, getClauses, getTemplates, updateTemplate } from '@/app/lib/api';
import { EmptyState, ErrorState, LoadingState } from '@/components/WorkspaceUI';
import ConfirmDialog from '@/components/ConfirmDialog';
import { IconDoc, IconPlus } from '@/components/icons';

type Form = { id?: string; name: string; contractType: string; description: string; clauseIds: string[] };
const EMPTY: Form = { name: '', contractType: '', description: '', clauseIds: [] };

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [clauses, setClauses] = useState<Clause[]>([]);
  const [form, setForm] = useState<Form>({ ...EMPTY });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleting, setDeleting] = useState<Template | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  async function refresh() { setTemplates(await getTemplates()); }
  async function load() {
    setLoading(true); setLoadError('');
    try {
      const [nextTemplates, nextClauses] = await Promise.all([getTemplates(), getClauses()]);
      setTemplates(nextTemplates); setClauses(nextClauses);
    } catch (e) { setLoadError(e instanceof Error ? e.message : 'The template library could not be loaded.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  function toggleClause(id: string) { setForm((f) => ({ ...f, clauseIds: f.clauseIds.includes(id) ? f.clauseIds.filter((x) => x !== id) : [...f.clauseIds, id] })); }
  function edit(t: Template) {
    setForm({ id: t.id, name: t.name, contractType: t.contractType, description: t.description, clauseIds: [...t.clauseIds] });
    nameRef.current?.focus();
  }
  function reset() { setForm({ ...EMPTY }); }
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setSuccess('');
    try {
      if (form.id) await updateTemplate(form.id, form); else await createTemplate(form);
      reset(); await refresh(); setSuccess(form.id ? 'Template updated.' : 'Template created.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Template save failed.'); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    setBusy(true); setError(''); setSuccess('');
    try {
      await deleteTemplate(id); setDeleting(null);
      if (form.id === id) reset();
      await refresh(); setSuccess('Template deleted.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Template deletion failed.'); setDeleting(null); }
    finally { setBusy(false); }
  }
  return <>
    <div className="view-head"><div className="vh-left"><div className="eyebrow">Approved knowledge</div><h2>Template library</h2><p>Maintain reusable agreements and the clause composition that defines your legal playbook.</p></div></div>
    <div aria-live="polite">{success && <div className="form-message success">{success}</div>}{error && <div className="form-message error">{error}</div>}</div>
    {loadError && <ErrorState title="Template library unavailable" action={<button className="btn" onClick={load}>Try again</button>}>{loadError}</ErrorState>}
    <div className="grid">
      <section className="card">
        <div className="card-head"><h3><IconDoc />Your templates</h3><span className="chip">{loading ? '—' : templates.length}</span></div>
        {loading ? <LoadingState label="Loading templates" /> : !loadError && !templates.length ? <EmptyState title="Build your approved starting point" action={<button className="btn" onClick={() => nameRef.current?.focus()}><IconPlus />New template</button>}>Create a reusable template and select its playbook clauses. It will be available in Authoring.</EmptyState> : !!templates.length && <div className="tbl-wrap">
          <table className="tbl tbl-responsive" role="table" aria-label="Template library"><thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Name</th><th scope="col" role="columnheader">Type</th><th scope="col" role="columnheader">Clauses</th><th scope="col" role="columnheader">Actions</th></tr></thead><tbody role="rowgroup">
            {templates.map((t) => <tr role="row" key={t.id}><td role="cell" data-label="Name"><span className="t-strong">{t.name}</span><br /><span className="t-id">{t.id}</span></td><td role="cell" data-label="Type">{t.contractType}</td><td role="cell" data-label="Clauses" className="tnum">{t.clauseIds.length}</td><td role="cell" data-label="Actions"><div className="view-actions"><button className="btn btn-sm" onClick={() => edit(t)}>Edit</button><button className="btn btn-sm" onClick={() => setDeleting(t)}>Delete</button></div></td></tr>)}
          </tbody></table>
        </div>}
      </section>
      <section className="card card-pad">
        <div className="form-card-head"><span className="document-avatar"><IconDoc /></span><div><h3>{form.id ? 'Edit template' : 'New template'}</h3><p>{form.id || 'Create an approved starting point for your team.'}</p></div></div>
        <form onSubmit={save} className="stack">
          <label className="premium-field"><span>Template name *</span><input ref={nameRef} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Mutual non-disclosure agreement" required /></label>
          <label className="premium-field"><span>Contract type *</span><input value={form.contractType} onChange={(e) => setForm((f) => ({ ...f, contractType: e.target.value }))} placeholder="e.g. NDA, MSA or SOW" required /></label>
          <label className="premium-field"><span>Description <small>optional</small></span><textarea className="field-control" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="When should this template be used?" /></label>
          <fieldset className="clause-fieldset"><legend>Include clauses <span className="chip">{form.clauseIds.length} selected</span></legend>
            {loading ? <LoadingState compact label="Loading available clauses" /> : <div className="clause-checklist">{clauses.map((c) => <label key={c.id}><input type="checkbox" checked={form.clauseIds.includes(c.id)} onChange={() => toggleClause(c.id)} /><span>{c.title} <span className="t-id">{c.id}</span></span></label>)}</div>}
            {!loading && !clauses.length && <p className="section-summary">{loadError ? 'Clauses could not be loaded.' : 'No playbook clauses are available yet.'}</p>}
          </fieldset>
          <div className="view-actions"><button className="btn btn-gold" disabled={busy || loading}>{busy ? 'Saving…' : form.id ? 'Save changes' : 'Create template'}</button>{form.id && <button type="button" className="btn" onClick={reset}>Cancel</button>}</div>
        </form>
      </section>
    </div>
    {deleting && <ConfirmDialog title={`Delete ${deleting.name}?`} description="This removes the template from the reusable library. This action cannot be undone." confirmLabel="Delete template" busy={busy} onClose={() => setDeleting(null)} onConfirm={() => void remove(deleting.id)} />}
    <p className="page-note">Template changes are permission-controlled. Follow your legal playbook governance and approval process.</p>
  </>;
}
