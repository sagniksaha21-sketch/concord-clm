'use client';

import { useRef, useState } from 'react';
import type { IngestResult } from '@concord/shared';
import { API_BASE, getSampleIngest, uploadFiles } from '@/app/lib/api';
import { IconAlert, IconCheck, IconDoc, IconShield, IconUpload } from '@/components/icons';

const MAX_FILES = 20;
const MAX_BYTES = 25 * 1024 * 1024;
const DEMO_SAMPLES = process.env.NEXT_PUBLIC_DEMO_SAMPLES === 'true';

const STATUS_BADGE: Record<string, string> = {
  parsed: 'low',
  'needs-review': 'med',
  quarantined: 'high',
  failed: 'high',
};
const STATUS_LABEL: Record<string, string> = {
  parsed: 'Parsed',
  'needs-review': 'Needs review',
  quarantined: 'Quarantined',
  failed: 'Failed',
};

export default function IngestPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<IngestResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    const oversized = incoming.find((file) => file.size > MAX_BYTES);
    if (oversized) {
      setError(`${oversized.name} exceeds the 25 MB per-file limit.`);
      return;
    }
    setError('');
    setFiles((current) => {
      const seen = new Set(current.map((f) => `${f.name}:${f.size}:${f.lastModified}`));
      const unique = incoming.filter((f) => !seen.has(`${f.name}:${f.size}:${f.lastModified}`));
      return [...current, ...unique].slice(0, MAX_FILES);
    });
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, i) => i !== index));
  }

  async function run() {
    if (!files.length && !DEMO_SAMPLES) return;
    setRunning(true);
    setResults(null);
    setError('');
    try {
      const out = files.length ? await uploadFiles(files) : await getSampleIngest();
      setResults(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ingestion failed. Please try again.');
    } finally {
      setRunning(false);
    }
  }

  const parsed = results?.filter((r) => r.status === 'parsed').length ?? 0;
  const review = results?.filter((r) => r.status === 'needs-review').length ?? 0;
  const quarantined = results?.filter((r) => r.status === 'quarantined' || r.status === 'failed').length ?? 0;

  return (
    <>
      <div className="view-head">
        <div className="vh-left">
          <div className="eyebrow">Secure intake pipeline</div>
          <h2>Ingest agreements</h2>
          <p>
            Upload up to {MAX_FILES} agreements at once. Concord verifies the file, scans it,
            extracts text, validates identifiers and prepares structured contract data for counsel review.
          </p>
        </div>
        <div className="trust-inline"><IconShield /><span>Malware scan · content validation · AI isolation</span></div>
      </div>

      <div className="process-rail" aria-label="Ingestion pipeline">
        {['Secure upload', 'OCR & extraction', 'AI structuring', 'PAN / GSTIN validation', 'Human review'].map((step, i) => (
          <div className="process-step" key={step}><span>{i + 1}</span><b>{step}</b></div>
        ))}
      </div>

      <div
        className={`dropzone premium-dropzone${drag ? ' drag' : ''}`}
        onClick={() => !running && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !running) inputRef.current?.click();
        }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
        role="button"
        tabIndex={0}
        aria-label="Choose or drop contract documents"
      >
        <div className="upload-orb"><IconUpload /></div>
        <h3>{files.length ? `${files.length} agreement${files.length === 1 ? '' : 's'} ready` : 'Drop agreements here'}</h3>
        <p>PDF, Word and supported scanned images · 25 MB each · {MAX_FILES} files per batch</p>
        <span className="btn upload-select">Choose files</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.tif,.tiff"
          style={{ display: 'none' }}
          onChange={(e) => { addFiles(e.target.files); e.currentTarget.value = ''; }}
        />
      </div>

      {files.length > 0 && (
        <section className="upload-queue card" aria-label="Files ready to ingest">
          <div className="upload-queue-head"><b>Ready for secure processing</b><span>{files.length}/{MAX_FILES}</span></div>
          <div className="upload-files">
            {files.map((file, i) => (
              <div className="upload-file" key={`${file.name}-${file.lastModified}-${i}`}>
                <span className="upload-file-icon"><IconDoc /></span>
                <div><b>{file.name}</b><small>{(file.size / 1024 / 1024).toFixed(2)} MB</small></div>
                <button type="button" onClick={(e) => { e.stopPropagation(); removeFile(i); }} aria-label={`Remove ${file.name}`} disabled={running}>×</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="action-row">
        <button className="btn btn-gold" onClick={run} disabled={running || (!files.length && !DEMO_SAMPLES)}>
          {running ? 'Processing agreements…' : files.length ? `Process ${files.length} agreement${files.length === 1 ? '' : 's'}` : 'Run demo sample batch'}
        </button>
        {files.length > 0 && <button className="btn" onClick={() => setFiles([])} disabled={running}>Clear batch</button>}
        {!files.length && !DEMO_SAMPLES && <span className="action-hint">Choose at least one agreement to begin.</span>}
      </div>

      {running && (
        <div className="card processing-state" role="status" aria-live="polite">
          <span className="processing-spinner" />
          <div><b>Securely processing this batch</b><p>Large scans and OCR may take longer. Keep this page open until processing finishes.</p></div>
        </div>
      )}

      {error && <div className="card state-card error-state" role="alert"><IconAlert /><b>Ingestion could not complete</b><p>{error}</p></div>}

      {results && !running && (
        <>
          <div className="metric-strip compact-metrics">
            <div><span>Processed</span><b>{results.length}</b><small>documents returned</small></div>
            <div><span>Clean extraction</span><b>{parsed}</b><small>ready to continue</small></div>
            <div><span>Needs counsel</span><b>{review}</b><small>validation or confidence flag</small></div>
            <div><span>Blocked</span><b>{quarantined}</b><small>quarantined / failed</small></div>
          </div>

          <div className="ingest-results">
            {results.map((r, i) => (
              <article className="card ingest-result" key={`${r.filename}-${i}`}>
                <div className="xdoc-head">
                  <span className="document-avatar"><IconDoc /></span>
                  <div className="xdoc-title"><b>{r.filename}</b><span className="id">{r.documentType ?? r.model}{r.pages ? ` · ${r.pages} pp` : ''}</span></div>
                  <span className={`badge ${STATUS_BADGE[r.status] ?? 'neutral'}`}><span className="d" />{STATUS_LABEL[r.status] ?? r.status}</span>
                  <span className="xconf"><span className="confbar"><i style={{ width: `${r.confidence}%` }} /></span>{r.confidence}%</span>
                </div>

                {r.security && (
                  <div className={`security-verdict ${r.security.scan === 'clean' ? 'ok' : 'warn'}`}>
                    {r.security.scan === 'clean' ? <IconCheck /> : <IconAlert />}
                    <span><b>{r.security.scan === 'clean' ? 'Security checks passed' : `Security status: ${r.security.scan}`}</b> · {r.security.detectedType} · {r.security.scanEngine}</span>
                  </div>
                )}

                <div className="dates">
                  <div className="dfield"><div className="k">Effective date</div><div className="v">{r.extraction.effectiveDate ?? '—'}</div></div>
                  <div className="dfield"><div className="k">Term / period</div><div className="v">{r.extraction.term ?? '—'}</div></div>
                  <div className="dfield"><div className="k">Expiry</div><div className="v">{r.extraction.expiryDate ?? '—'}</div></div>
                </div>

                <div className="parties">
                  {r.extraction.parties.map((party, j) => (
                    <div className="party" key={`${party.name}-${j}`}>
                      <div className="p-role">Party {String.fromCharCode(65 + j)} · {party.role}</div>
                      <div className="p-name">{party.name}</div>
                      <div className="p-addr">{party.address}</div>
                      <div>
                        {party.pan && <span className={`idchip ${party.panValid ? 'ok' : 'bad'}`}>{party.panValid ? '✓' : '✕'}<span className="lab">PAN</span> {party.pan}</span>}
                        {party.gstin ? <span className={`idchip ${party.gstinValid ? 'ok' : 'bad'}`}>{party.gstinValid ? '✓' : '✕'}<span className="lab">GSTIN</span> {party.gstin}{party.gstinState ? ` · ${party.gstinState}` : ''}</span> : <span className="idchip"><span className="lab">GSTIN</span> not on record</span>}
                      </div>
                    </div>
                  ))}
                </div>

                {r.notes.map((note, k) => <div className="reviewnote" key={k}><IconAlert />{note}</div>)}
                {r.documentId && <div className="result-actions"><a className="btn" href={`${API_BASE}/api/documents/${encodeURIComponent(r.documentId)}/file`} target="_blank" rel="noopener noreferrer">Open original</a></div>}
              </article>
            ))}
          </div>
        </>
      )}

      <p className="page-note">Originals remain protected by contract permissions; AI extraction is advisory and validation exceptions stay in the human-review path.</p>
    </>
  );
}
