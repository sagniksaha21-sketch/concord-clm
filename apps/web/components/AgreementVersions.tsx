'use client';
import { useState } from 'react';
import { AgreementWorkspace } from '@concord/shared';
import DocumentComparison from './DocumentComparison';
export default function AgreementVersions({ data }: { data: AgreementWorkspace }) {
  const [selected,setSelected] = useState('');
  const versions = data.versionHistory ?? [], current = versions[0], previous = versions.find(v => v.documentId === selected);
  return <section className="card card-pad"><div className="agreement-section-head"><h3>Version history</h3><span className="req-id">{versions.length} preserved revisions</span></div>{data.archive && <p className="editor-notice">The executed PDF is authoritative. Drafts, decisions and negotiation evidence remain preserved below.</p>}
    {current?.sections && <label className="req-field">Compare with the current saved draft<select value={selected} onChange={e => setSelected(e.target.value)}><option value="">Choose an earlier version</option>{versions.filter(v => v.documentId !== current.documentId && v.sections).map(v => <option key={v.documentId} value={v.documentId}>{v.label} · {v.authorName}</option>)}</select></label>}
    {previous?.sections && current?.sections && <DocumentComparison before={previous.sections} after={current.sections} />}
    <ol className="version-timeline">{versions.map((v,i) => <li key={v.documentId}><span className="version-marker" aria-hidden="true">{String(v.number).padStart(2,'0')}</span><div className="version-copy"><div className="agreement-section-head"><h4>{v.label} · {v.authorName}</h4><span className="badge neutral">{v.executedAt ? 'Executed' : v.approvedAt ? 'Approval recorded' : v.agreedAt ? 'Agreed form recorded' : v.sharedAt ? 'Externally shared' : i === 0 ? 'Current source' : 'Preserved'}</span></div><p>{v.reason}</p><small>{new Date(v.createdAt).toLocaleString()} · {v.organisation || 'Source not recorded'}{v.round ? ` · Round ${v.round}` : ''}</small><details className="workflow-disclosure"><summary>Version evidence</summary><dl className="req-terms"><div><dt>Source</dt><dd>{v.source}</dd></div><div><dt>Stage at save</dt><dd>{v.stage}</dd></div><div><dt>SHA-256</dt><dd className="integrity-hash">{v.sha256 || 'Not recorded'}</dd></div></dl></details><a className="btn" href={`/api/documents/${v.documentId}/file`}>Download this version</a></div></li>)}</ol>
    <ul className="attachment-list">{data.documents.filter(d => !versions.some(v => v.documentId === d.id)).map(d => <li key={d.id}><span><b>{d.filename}</b><small>{d.status} · {new Date(d.createdAt).toLocaleString()}</small></span>{d.hasFile && <a className="btn" href={`/api/documents/${d.id}/file`}>Download</a>}</li>)}</ul>{!data.documents.length && <p className="req-help">Saved drafts and uploaded versions will appear here.</p>}
  </section>;
}
