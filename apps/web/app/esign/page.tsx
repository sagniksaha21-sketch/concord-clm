'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ArchivedDocument, Contract, Signatory, SignatureRequest, SignatureStatus } from '@concord/shared';
import { archiveFileUrl, createSignature, getArchive, getContracts, getSignatures, advanceSignature } from '@/app/lib/api';
import { EmptyState, LoadingState } from '@/components/WorkspaceUI';
import { IconAlert, IconCheck, IconDoc, IconPlus, IconShield, IconSign } from '@/components/icons';

const BADGE: Record<SignatureStatus, { c: string; label: string }> = {
  draft: { c: 'neutral', label: 'Draft' }, sent: { c: 'info', label: 'Sent' }, viewed: { c: 'info', label: 'Viewed' },
  'partially-signed': { c: 'med', label: 'Partially signed' }, signed: { c: 'low', label: 'Signed' }, completed: { c: 'low', label: 'Completed' },
  declined: { c: 'high', label: 'Declined' }, expired: { c: 'high', label: 'Expired' },
};
const emptySigner = (): Signatory => ({ name: '', email: '', role: '' });
const fmtINR = (n?: number) => (n == null ? '—' : `₹${n.toLocaleString('en-IN')}`);
const ALLOW_SIMULATOR = process.env.NEXT_PUBLIC_DEMO_ESIGN_ADVANCE === 'true';

export default function ESignPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [items, setItems] = useState<SignatureRequest[]>([]);
  const [archive, setArchive] = useState<ArchivedDocument[]>([]);
  const [contractId, setContractId] = useState('');
  const [signers, setSigners] = useState<Signatory[]>([emptySigner()]);
  const [message, setMessage] = useState('');
  const [stampOn, setStampOn] = useState(true);
  const [stampState, setStampState] = useState('Maharashtra');
  const [stampDuty, setStampDuty] = useState(0);
  const [stampPaidBy, setStampPaidBy] = useState('Lakmē Lever');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    const [nextContracts, nextItems, nextArchive] = await Promise.all([getContracts(), getSignatures(), getArchive()]);
    setContracts(nextContracts); setItems(nextItems); setArchive(nextArchive);
    const requested = new URLSearchParams(window.location.search).get('contract');
    setContractId(current => current || (requested ? nextContracts.find(c => c.id === requested)?.id ?? '' : nextContracts[0]?.id ?? ''));
    if (requested && !nextContracts.some(c => c.id === requested)) setError('The linked agreement is unavailable. Choose an agreement before creating a signing request.');
  }
  useEffect(() => { load().catch((e) => setError(e instanceof Error ? e.message : 'E-signature workspace unavailable.')).finally(() => setLoading(false)); }, []);

  const selected = useMemo(() => contracts.find((c) => c.id === contractId), [contracts, contractId]);
  const pending = items.filter((r) => !['completed', 'declined', 'expired'].includes(r.status)).length;
  const completed = items.filter((r) => r.status === 'completed').length;

  function updateSigner(index: number, patch: Partial<Signatory>) {
    setSigners((current) => current.map((s, i) => i === index ? { ...s, ...patch } : s));
  }

  async function send() {
    const valid = signers.filter((s) => s.name.trim() && s.email.trim());
    if (!selected) return setError('Choose a persisted contract before sending.');
    if (!valid.length) return setError('Add at least one signatory with a name and email address.');
    setBusy(true); setError(''); setSuccess('');
    try {
      const created = await createSignature({
        contractId: selected.id,
        contractTitle: selected.title, // server re-resolves this from the contract record
        signatories: valid,
        message: message.trim() || undefined,
        stampPaper: stampOn ? { state: stampState.trim(), dutyAmount: Number(stampDuty) || 0, paidBy: stampPaidBy.trim(), article: 'Agreement' } : undefined,
      });
      setSuccess(`${created.id} was created${created.status === 'sent' ? ' and dispatched to the signing provider' : ''}.`);
      setSigners([emptySigner()]); setMessage('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the signing request.');
    } finally { setBusy(false); }
  }

  async function simulate(id: string) {
    setError('');
    try { await advanceSignature(id); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Simulator step failed.'); }
  }

  return (
    <>
      <div className="view-head">
        <div className="vh-left"><div className="eyebrow">Execution control</div><h2>Send &amp; track signatures</h2><p>Choose an agreement, add the signatories and follow its progress. Completed copies are filed in the archive.</p></div>
        <div className="trust-inline"><IconShield /><span>Controlled signing · Execution evidence · File integrity</span></div>
      </div>

      <div className="metric-strip compact-metrics"><div><span>Active envelopes</span><b>{loading ? '—' : pending}</b><small>awaiting completion</small></div><div><span>Completed</span><b>{loading ? '—' : completed}</b><small>execution lifecycle</small></div><div><span>Archived copies</span><b>{loading ? '—' : archive.length}</b><small>sealed records</small></div></div>

      <section className="card esign-compose">
        <div className="form-card-head"><span className="document-avatar"><IconSign /></span><div><h3>New signing request</h3><p>Choose the agreement and confirm who is signing before you send.</p></div></div>
        <div className="esign-grid">
          <label className="premium-field"><span>Contract *</span><select value={contractId} onChange={(e) => setContractId(e.target.value)} disabled={!contracts.length}>{contracts.length ? <><option value="">Choose an agreement</option>{contracts.map((c) => <option value={c.id} key={c.id}>{c.title} — {c.counterparty} · {c.id}</option>)}</> : <option>{loading ? 'Loading contracts…' : 'No persisted contracts available'}</option>}</select></label>
          <label className="premium-field"><span>Message to signatories <small>optional</small></span><input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Please review and sign by the requested date." maxLength={1200} /></label>
        </div>

        <div className="section-table-head signatory-head"><div><span className="section-kicker">Signing order</span><h3>Signatories</h3></div><button className="btn" type="button" onClick={() => setSigners((s) => [...s, emptySigner()])}><IconPlus />Add signatory</button></div>
        <div className="signatory-editor">
          {signers.map((s, i) => <div className="signatory-row" key={i}><span className="sign-order">{i + 1}</span><input aria-label={`Signatory ${i + 1} name`} placeholder="Full legal name" value={s.name} onChange={(e) => updateSigner(i, { name: e.target.value })} /><input aria-label={`Signatory ${i + 1} email`} type="email" placeholder="name@company.com" value={s.email} onChange={(e) => updateSigner(i, { email: e.target.value })} /><input aria-label={`Signatory ${i + 1} role`} placeholder="Role / capacity" value={s.role} onChange={(e) => updateSigner(i, { role: e.target.value })} /><button type="button" aria-label={`Remove signatory ${i + 1}`} onClick={() => setSigners((current) => current.length === 1 ? [emptySigner()] : current.filter((_, j) => j !== i))}>×</button></div>)}
        </div>

        <div className="stamp-panel">
          <label className="stamp-toggle"><input type="checkbox" checked={stampOn} onChange={(e) => setStampOn(e.target.checked)} /><span><b>Digital stamp paper</b><small>Procure and affix through the configured provider.</small></span></label>
          {stampOn && <div className="stamp-fields"><label className="premium-field"><span>State</span><input value={stampState} onChange={(e) => setStampState(e.target.value)} /></label><label className="premium-field"><span>Duty amount (₹)</span><input type="number" min={0} step={1} value={stampDuty} onChange={(e) => setStampDuty(Number(e.target.value))} /></label><label className="premium-field"><span>Paid by</span><input value={stampPaidBy} onChange={(e) => setStampPaidBy(e.target.value)} /></label></div>}
        </div>

        <div className="form-submit"><button className="btn btn-gold" onClick={send} disabled={busy || !selected}>{busy ? 'Creating secure envelope…' : 'Create & send signing request'}</button><span><IconShield />No envelope is sent unless the request is first persisted.</span></div>
        <div aria-live="polite">{success && <div className="form-message success"><IconCheck />{success}</div>}{error && <div className="form-message error"><IconAlert />{error}</div>}</div>
      </section>

      <section className="signature-list">
        <div className="section-table-head"><div><span className="section-kicker">Provider state</span><h3>Signing activity</h3></div><span className="result-count">{items.length} request{items.length === 1 ? '' : 's'}</span></div>
        {items.map((r) => {
          const b = BADGE[r.status] ?? { c: 'neutral', label: r.status };
          const terminal = ['completed', 'declined', 'expired'].includes(r.status);
          return <article className="card signature-card" key={r.id}><div className="signature-card-head"><div><b>{r.contractTitle}</b><span>{r.id} · {r.contractId}{r.envelopeId ? ` · envelope ${r.envelopeId}` : ''}</span></div><span className={`badge ${b.c}`}><i className="d" />{b.label}</span></div><div className="signature-card-body"><div><span className="section-kicker">Signatories</span>{r.signatories.map((s, i) => <div className="signer-state" key={`${s.email}-${i}`}><span className="sign-order">{s.order ?? i + 1}</span><div><b>{s.name}</b><small>{s.email} · {s.role || 'signatory'}</small></div><span className={`badge ${s.status === 'signed' ? 'low' : 'neutral'}`}>{s.status}</span></div>)}</div>{r.stampPaper && <div className="stamp-summary"><span className="section-kicker">e-Stamp</span><b>{r.stampPaper.state} · {fmtINR(r.stampPaper.dutyAmount)}</b><small>{r.stampPaper.certificateNo ?? 'Certificate pending'} · {r.stampPaper.status}</small></div>}</div><details className="audit-details"><summary>Execution events ({r.audit.length})</summary>{r.audit.map((e, i) => <div key={i}><b>{e.event}</b><span>{new Date(e.at).toLocaleString('en-IN')}{e.by ? ` · ${e.by}` : ''}{e.detail ? ` · ${e.detail}` : ''}</span></div>)}</details>{ALLOW_SIMULATOR && !terminal && <button className="btn demo-control" onClick={() => simulate(r.id)}>Simulate next provider event →</button>}</article>;
        })}
        {loading ? <div className="card"><LoadingState label="Loading signing activity" /></div> : !error && !items.length && <div className="card"><EmptyState title="Ready when your agreement is" icon={<IconSign />}>Create a signing request above to track every signatory through completion.</EmptyState></div>}
      </section>

      <section className="archive-panel card">
        <div className="archive-head"><div><span className="section-kicker">Signed &amp; filed</span><h3>Executed-contract archive</h3></div><span className="badge low"><i className="d" />{archive.length}</span></div>
        <div className="archive-list">{archive.map((a) => <article className="archive-row" key={a.id}><span className="document-avatar secure"><IconDoc /></span><div className="archive-copy"><b>{a.contractTitle}</b><span>{a.id} · executed {new Date(a.completedAt).toLocaleDateString('en-IN')} · {a.signatories.length} signator{a.signatories.length === 1 ? 'y' : 'ies'}</span></div><span className="mono-badge" title={a.checksum}>sha256 {a.checksum.slice(0, 12)}…</span><a className="btn" href={archiveFileUrl(a.id)} target="_blank" rel="noreferrer">Download executed copy</a></article>)}</div>
        {loading ? <LoadingState compact label="Loading executed copies" /> : !error && !archive.length && <EmptyState title="No executed copies yet" icon={<IconShield />}>Completed envelopes will be sealed and filed here, with their signature evidence and integrity checksum.</EmptyState>}
      </section>

      <p className="page-note">Confirm approval and signing authority before sending. Completed documents will appear in the executed-contract archive.</p>
    </>
  );
}
