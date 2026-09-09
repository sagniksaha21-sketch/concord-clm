'use client';

import { useEffect, useState } from 'react';
import type { Clause, DraftResult, Template } from '@concord/shared';
import { generateDraft, getClauses, getTemplates } from '@/app/lib/api';

const input: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)',
  background: 'var(--surface-2)', color: 'var(--ink)', fontFamily: 'inherit',
  fontSize: 13,
};

export default function AuthoringPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [clauses, setClauses] = useState<Clause[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getTemplates().then((t) => { setTemplates(t); if (t[0]) setTemplateId(t[0].id); }).catch(() => {});
    getClauses().then(setClauses).catch(() => {});
  }, []);

  async function gen() {
    if (!templateId || !counterparty.trim()) return;
    setBusy(true);
    setDraft(null);
    setError('');
    try {
      setDraft(await generateDraft({ templateId, counterparty }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Draft generation failed.');
    }
    setBusy(false);
  }

  return (
    <>
      <div className="view-head">
        <div className="vh-left">
          <h2>Templates &amp; clause library</h2>
          <p>
            Generate a first draft from a template and the playbook-standard clause
            library. Wire Azure OpenAI to enrich each section.
          </p>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select style={input} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name} · {t.contractType}</option>
            ))}
          </select>
          <input style={{ ...input, flex: 1, minWidth: 200 }} placeholder="Counterparty name" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
          <button className="btn btn-gold" onClick={gen} disabled={busy}>{busy ? 'Drafting…' : 'Generate draft'}</button>
        </div>
      </div>

      {error && <div className="card state-card error-state" role="alert"><b>Draft generation unavailable</b><p>{error}</p></div>}

      <div className="grid">
        <div>
          {draft ? (
            <div className="card">
              <div className="card-head">
                <b>{draft.title}</b>
                <span className="ai-tag" style={{ marginLeft: 'auto' }}>{draft.model}</span>
              </div>
              <div className="doc">
                {draft.sections.map((s, i) => (
                  <div key={i}>
                    <h5>{s.heading}</h5>
                    <p>{s.body}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="card card-pad" style={{ color: 'var(--muted)', fontSize: 13 }}>
              Pick a template and counterparty, then generate a draft.
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head"><b>Clause library</b><span className="chip">{clauses.length}</span></div>
          <div style={{ padding: '4px 0' }}>
            {clauses.map((c) => (
              <div key={c.id} style={{ padding: '12px 18px', borderTop: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <b style={{ fontSize: 12.5 }}>{c.title}</b>
                  <span className="chip" style={{ marginLeft: 'auto' }}>{c.category}</span>
                </div>
                <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 5, lineHeight: 1.5 }}>{c.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="page-note">Generated language is advisory and must be reviewed against the approved template, playbook and current commercial instructions before use.</p>
    </>
  );
}
