'use client';

import Link from 'next/link';
import { EmptyState, ErrorState, LoadingState } from '@/components/WorkspaceUI';
import { useEffect, useState } from 'react';
import type { RepositoryAnswer, RepositoryHit, ArchivedDocument } from '@concord/shared';
import { askRepository, searchRepository, getRepositoryDocuments, archiveFileUrl } from '@/app/lib/api';
import { IconCopy, IconDoc, IconSearch, IconShield, IconSparkle } from '@/components/icons';
import { ConcordWordmark } from '@/components/ConcordBrand';

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
  const [loading, setLoading] = useState(true);
  const [searchError, setSearchError] = useState('');

  useEffect(() => {
    let live = true;
    setLoading(true); setSearchError('');
    const t = setTimeout(() => {
      Promise.all([searchRepository(q), getRepositoryDocuments(q)])
        .then(([nextHits, nextDocs]) => { if (live) { setHits(nextHits); setDocs(nextDocs); } })
        .catch((e) => { if (live) setSearchError(e instanceof Error ? e.message : 'Repository search is unavailable.'); })
        .finally(() => { if (live) setLoading(false); });
    }, 180);
    return () => { live = false; clearTimeout(t); };
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
    try { await navigator.clipboard.writeText(`${answer.answer}${citations ? `\n\nSources: ${citations}` : ''}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
    } catch { setError('The answer could not be copied. Select the answer text to copy it manually.'); }
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
        <div className="ask-workbench-head"><span className="ai-orb"><IconSparkle /></span><div><b><ConcordWordmark /> AI</b><p>Ask about clauses, obligations, governing law, data terms, exposure or portfolio patterns.</p></div></div>
        <form className="askrow premium-ask" onSubmit={(e) => { e.preventDefault(); ask(); }}>
          <IconSearch />
          <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask across every contract…" aria-label="Ask Concord AI about the contract repository" />
          <button className="btn btn-gold" disabled={asking || !question.trim()}>{asking ? 'Reasoning…' : <span>Ask <ConcordWordmark /> AI</span>}</button>
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
        <label className="searchbar premium-search"><IconSearch /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by contract, counterparty or type…" aria-label="Filter contract repository" /></label>
        <span className="result-count" aria-live="polite">{loading ? 'Searching…' : searchError ? 'Search unavailable' : <>{hits.length} contract{hits.length === 1 ? '' : 's'} · {docs.length} executed cop{docs.length === 1 ? 'y' : 'ies'}</>}</span>
      </div>

      {!loading && !searchError && docs.length > 0 && (
        <section className="card archive-panel">
          <div className="archive-head"><div><span className="section-kicker">Document archive</span><h3>Executed &amp; signed copies</h3></div><span className="badge low"><span className="d" />{docs.length}</span></div>
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

      {searchError && <ErrorState title="Repository search unavailable">{searchError}</ErrorState>}
      <section className="card repository-table" aria-busy={loading}>
        <div className="tbl-wrap">
          <table className="tbl tbl-responsive" role="table" aria-label="Contract repository">
            <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Contract</th><th scope="col" role="columnheader">Counterparty</th><th scope="col" role="columnheader">Type</th><th scope="col" role="columnheader">Value</th><th scope="col" role="columnheader">Risk</th><th scope="col" role="columnheader">Stage</th></tr></thead>
            <tbody role="rowgroup">
              {loading && <tr role="row"><td role="cell" colSpan={6}><LoadingState label="Searching contract records" /></td></tr>}
              {!loading && !searchError && hits.map((h) => (
                <tr role="row" key={h.contract.id}>
                  <td role="cell" data-label="Contract"><Link className="t-strong" href={`/review/${encodeURIComponent(h.contract.id)}`}>{h.contract.title}</Link><br /><span className="t-id">{h.contract.id}</span></td>
                  <td role="cell" data-label="Counterparty">{h.contract.counterparty}</td><td role="cell" data-label="Type">{h.contract.type}</td><td role="cell" data-label="Value">{h.contract.valueDisplay}</td>
                  <td role="cell" data-label="Risk"><span className={`badge ${h.contract.risk === 'medium' ? 'med' : h.contract.risk}`}><span className="d" />{h.contract.risk}</span></td><td role="cell" data-label="Stage">{h.contract.stage}</td>
                </tr>
              ))}
              {!loading && !searchError && hits.length === 0 && <tr role="row"><td role="cell" colSpan={6}><EmptyState title={q ? "No matching contracts" : "Your repository is ready"} icon={<IconSearch />} action={q ? <button className="btn" onClick={() => setQ('')}>Clear search</button> : <Link href="/intake" className="btn">Open intake</Link>}>{q ? "Try a contract name, counterparty or broader search." : "Contracts and executed copies available to your account will appear here."}</EmptyState></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {!loading && !searchError && !q.trim() && !docs.length && hits.length > 0 && <section className="card archive-panel" aria-label="Executed document archive">
        <EmptyState title="No executed copies yet" icon={<IconDoc />}>Completed signature requests will appear here with their signed documents and file checksums.</EmptyState>
      </section>}
      <p className="page-note">Use the cited records to verify an answer. Retrieval and model details show how each response was produced.</p>
    </>
  );
}
