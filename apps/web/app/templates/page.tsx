'use client';

import { useEffect, useState } from 'react';
import type { Clause, Template } from '@concord/shared';
import {
  createTemplate,
  deleteTemplate,
  getClauses,
  getTemplates,
  updateTemplate,
} from '@/app/lib/api';

type Form = { id?: string; name: string; contractType: string; description: string; clauseIds: string[] };
const EMPTY: Form = { name: '', contractType: '', description: '', clauseIds: [] };

const input: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)',
  background: 'var(--surface-2)', color: 'var(--ink)', fontFamily: 'inherit',
  fontSize: 13, width: '100%',
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [clauses, setClauses] = useState<Clause[]>([]);
  const [form, setForm] = useState<Form>({ ...EMPTY });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function refresh() {
    setTemplates(await getTemplates().catch(() => []));
  }
  useEffect(() => {
    refresh();
    getClauses().then(setClauses).catch(() => {});
  }, []);

  function toggleClause(id: string) {
    setForm((f) => ({
      ...f,
      clauseIds: f.clauseIds.includes(id) ? f.clauseIds.filter((x) => x !== id) : [...f.clauseIds, id],
    }));
  }
  function edit(t: Template) {
    setForm({ id: t.id, name: t.name, contractType: t.contractType, description: t.description, clauseIds: [...t.clauseIds] });
  }
  function reset() {
    setForm({ ...EMPTY });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(''); setSuccess('');
    try {
      if (form.id) await updateTemplate(form.id, form);
      else await createTemplate(form);
      reset();
      await refresh();
      setSuccess(form.id ? 'Template updated.' : 'Template created.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Template save failed.');
    }
    setBusy(false);
  }
  async function remove(id: string) {
    setError(''); setSuccess('');
    try { await deleteTemplate(id); setSuccess('Template deleted.'); } catch (e) { setError(e instanceof Error ? e.message : 'Template deletion failed.'); return; }
    if (form.id === id) reset();
    await refresh();
  }

  return (
    <>
      <div className="view-head">
        <div className="vh-left">
          <h2>Template storage</h2>
          <p>
            Govern reusable templates and their approved clause composition from the persisted legal playbook.
          </p>
        </div>
      </div>

      <div aria-live="polite">{success && <div className="form-message success">{success}</div>}{error && <div className="form-message error">{error}</div>}</div>
      <div className="grid">
        <div className="card">
          <div className="card-head"><b>Templates</b><span className="chip">{templates.length}</span></div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Name</th><th>Type</th><th>Clauses</th><th></th></tr></thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id}>
                    <td><span className="t-strong">{t.name}</span><br /><span className="t-id">{t.id}</span></td>
                    <td>{t.contractType}</td>
                    <td className="tnum">{t.clauseIds.length}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => edit(t)}>Edit</button>{' '}
                      <button className="btn" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => remove(t.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
                {templates.length === 0 && (
                  <tr><td colSpan={4} style={{ color: 'var(--muted)' }}>No templates.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card card-pad">
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>{form.id ? `Edit ${form.id}` : 'New template'}</b>
          <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            <input style={input} placeholder="Name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            <input style={input} placeholder="Contract type *" value={form.contractType} onChange={(e) => setForm((f) => ({ ...f, contractType: e.target.value }))} required />
            <textarea style={{ ...input, minHeight: 56, resize: 'vertical' }} placeholder="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-2)' }}>Clauses</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
              {clauses.map((c) => (
                <label key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
                  <input type="checkbox" checked={form.clauseIds.includes(c.id)} onChange={() => toggleClause(c.id)} />
                  {c.title} <span className="t-id">{c.id}</span>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-gold" disabled={busy}>{busy ? 'Saving…' : form.id ? 'Update' : 'Create'}</button>
              {form.id && <button type="button" className="btn" onClick={reset}>Cancel</button>}
            </div>
          </form>
        </div>
      </div>

      <p className="page-note">Template changes are permission-controlled and should follow your legal playbook governance and approval process.</p>
    </>
  );
}
