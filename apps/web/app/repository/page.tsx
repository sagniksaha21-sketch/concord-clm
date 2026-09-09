'use client';

import { useEffect, useState } from 'react';
import type { RepositoryAnswer, RepositoryHit, ArchivedDocument } from '@concord/shared';
import { askRepository, searchRepository, getRepositoryDocuments, archiveFileUrl } from '@/app/lib/api';
import { IconCopy, IconDoc, IconSearch, IconShield, IconSparkle } from '@/components/icons';

const SUGGESTED = [
  'Where do we have Singapore governing law?',
  'Which contracts lack a DPDP addendum?',
  'Summarise our exposure on the HGS payroll deal',
];

export default function RepositoryPage() {
  const [q, setQ] = useState('');
  const [question, setQuestion] = useState('');
  const [hits, setHits] = useState<RepositoryHit[]>([]);
  const [docs, setDocs] = useState<ArchivedDocument[]>([]);
  const [answer, setAnswer] = useState<RepositoryAnswer | null>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      Promise.all([searchRepository(q), getRepositoryDocuments(q)])
        .then(([nextHits, nextDocs]) => { setHits(nextHits); setDocs(nextDocs); })
        .catch((e) => setError(e instanceof Error ? e.message : 'Repository search is unavailable.'));
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  async function ask(nextQuestion = question) {
    const prompt = nextQuestion.trim();
    if (!prompt || asking) return;
    setQuestion(prompt);
    setAsking(true);
    setAnswer(null);
    setError('');
    try {
      setAnswer(await askRepository(prompt));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Concord AI could not answer this question.');
    } finally {
      setAsking(false);
    }
  }

  async function copyAnswer() {
    if (!answer) return;
    const citations = answer.citations.map((c) => c.label).join('; ');
    await navigator.clipboard.writeText(`${answer.answer}${citations ? `\n\nSources: ${citations}` : ''}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <>
      <div className="view-head">
        <div className="vh-left">
          <div className="eyebrow">Grounded portfolio intelligence</div>
          <h2>Ask your contracts</h2>
          <p>Search the system of record or ask a natural-language question. Answers expose their retrieval provenance and contract citations.</p>
        </div>
        <div className="trust-inline"><IconShield /><span>Permission-aware · cited · auditable</span></div>
      </div>

      <section className="ask-workbench card">
        <div className="ask-workbench-head"><span className="ai-orb"><IconSparkle /></span><div><b>Concord AI</b><p>Ask about clauses, obligations, governing law, data terms, exposure or portfolio patterns.</p></div></div>
        <form className="askrow premium-ask" onSubmit={(e) => { e.preventDefault(); ask(); }}>
          <IconSearch />
          <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask across every contract…" aria-label="Ask Concord AI about the contract repository" />
          <button className="btn btn-gold" disabled={asking || !question.trim()}>{asking ? 'Reasoning…' : 'Ask Concord AI'}</button>
        </form>
        <div className="suggest">
          {SUGGESTED.map((s) => <button type="button" key={s} onClick={() => ask(s)} disabled={asking}>{s}</button>)}
        </div>

        {asking && (
          <div className="answer answer-loading" role="status"><span className="processing-spinner" /><div><b>Searching relevant passages</b><p>Retrieving permitted contract text and composing a grounded response.</p></div></div>
        )}
        {answer && !asking && (
          <div className="answer premium-answer">
            <div className="answer-head"><div><span className="ai-tag"><IconSparkle /> grounded answer</span><h3>{answer.question}</h3></div><button className="icon-text-btn" onClick={copyAnswer}><IconCopy />{copied ? 'Copied' : 'Copy'}</button></div>
            <p className="answer-copy">{answer.answer}</p>
            {answer.citations.length > 0 && <div className="cites" aria-label="Answer citations">{answer.citations.map((c, i) => <span className="cite" key={`${c.contractId}-${i}`}>{c.label}</span>)}</div>}
            {answer.retrieval && (
              <div className="provenance-row"><span><b>{answer.retrieval.matched}</b> passage{answer.retrieval.matched === 1 ? '' : 's'}</span><span>store <b>{answer.retrieval.store}</b></span><span>embeddings <b>{answer.retrieval.provider}</b></span><span>answer <b>{answer.retrieval.model}</b></span></div>
            )}
            {answer.matches && answer.matches.length > 0 && (
              <details className="retrieval-details"><summary>Inspect retrieved evidence ({answer.matches.length})</summary><div className="retrieval-list">{answer.matches.map((m) => <div className="retrieval-passage" key={m.id}><span>Similarity {(m.score * 100).toFixed(1)}%</span><p>{m.text}</p></div>)}</div></details>
            )}
            <div className="ai-footnote"><IconShield />Verify material conclusions against the cited agreement before taking legal or commercial action.</div>
          </div>
        )}
      </section>

      {error && <div className="card state-card error-state" role="alert"><b>Repository unavailable</b><p>{error}</p></div>}

      <div className="repository-toolbar">
        <label className="searchbar premium-search"><IconSearch /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by contract, counterparty or type…" /></label>
        <span className="result-count">{hits.length} contract{hits.length === 1 ? '' : 's'} · {docs.length} executed cop{docs.length === 1 ? 'y' : 'ies'}</span>
      </div>

      {docs.length > 0 && (
        <section className="card archive-panel">
          <div className="archive-head"><div><span className="section-kicker">Immutable archive</span><h3>Executed &amp; signed copies</h3></div><span className="badge low"><span className="d" />{docs.length}</span></div>
          <div className="archive-list">
            {docs.map((a) => (
              <article className="archive-row" key={a.id}>
                <span className="document-avatar secure"><IconDoc /></span>
                <div className="archive-copy"><b>{a.contractTitle}</b><span>{a.contractId} · signed by {a.signatories.map((s) => s.name).join(', ')}{a.stampCertificateNo ? ` · e-stamp ${a.stampCertificateNo}` : ''} · {new Date(a.completedAt).toLocaleDateString('en-IN')}</span></div>
                <span className="mono-badge" title={a.checksum}>sha256 {a.checksum.slice(0, 10)}…</span>
                <a className="btn" href={archiveFileUrl(a.id)} target="_blank" rel="noreferrer">Open signed copy</a>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="card repository-table">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Contract</th><th>Counterparty</th><th>Type</th><th>Value</th><th>Risk</th><th>Stage</th></tr></thead>
            <tbody>
              {hits.map((h) => (
                <tr key={h.contract.id}>
                  <td><span className="t-strong">{h.contract.title}</span><br /><span className="t-id">{h.contract.id}</span></td>
                  <td>{h.contract.counterparty}</td><td>{h.contract.type}</td><td>{h.contract.valueDisplay}</td>
                  <td><span className={`badge ${h.contract.risk === 'medium' ? 'med' : h.contract.risk}`}><span className="d" />{h.contract.risk}</span></td><td>{h.contract.stage}</td>
                </tr>
              ))}
              {hits.length === 0 && <tr><td colSpan={6}><div className="table-empty"><IconSearch /><span>No contracts match this filter.</span></div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <p className="page-note">Search and answers respect the signed-in user’s permissions. Retrieval/model provenance is surfaced so counsel can distinguish evidence from generated synthesis.</p>
    </>
  );
}
