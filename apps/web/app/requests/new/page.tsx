'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AgreementTermSheet, ClientRequestOptions, CreateClientRequest, RequestAttachment } from '@concord/shared';
import { createClientRequest, getRequestOptions, uploadRequestAttachment } from '@/app/lib/api';
import { AGREEMENT_TYPES, errorMessage, RequestError, RequestHeader, RequestLoading, requestDate, TermSheet } from '@/components/RequestUI';
import { IconArrowRight, IconDoc } from '@/components/icons';

const STEPS = ['Basics', 'Commercials', 'Legal & risk', 'Documents', 'Legal assignment', 'Review'];
const CATEGORIES = ['Counterparty paper', 'Proposal', 'Scope', 'Purchase order', 'Previous contract', 'Correspondence', 'Supporting document'];
const INITIAL: CreateClientRequest = { submissionKey: '', title: '', counterparty: '', businessUnit: '', contractType: 'NDA', assignedLegalUserId: 'auto', requestedByDate: '', urgency: 'standard', terms: { scope: '', currency: 'INR', dataInvolved: 'unsure' } };
export default function NewRequestPage() {
  const router = useRouter();
  const [options, setOptions] = useState<ClientRequestOptions>();
  const [data, setData] = useState<CreateClientRequest>(INITIAL);
  const [attachments, setAttachments] = useState<RequestAttachment[]>([]);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [optionError, setOptionError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const submissionKey = useRef('');
  async function load() { setOptionError(''); try { setOptions(await getRequestOptions()); } catch (e) { setOptionError(errorMessage(e)); } }
  useEffect(() => { submissionKey.current = crypto.randomUUID(); void load(); }, []);
  function field<K extends keyof CreateClientRequest>(key: K, value: CreateClientRequest[K]) { setData(d => ({ ...d, [key]: value })); }
  function term<K extends keyof AgreementTermSheet>(key: K, value: AgreementTermSheet[K]) { setData(d => ({ ...d, terms: { ...d.terms, [key]: value === '' ? undefined : value } })); }
  function go(next: number) { setError(''); setStep(next); requestAnimationFrame(() => { headingRef.current?.focus(); headingRef.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' }); }); }
  async function upload(files: FileList | null) {
    if (!files || uploading) return;
    if (attachments.length + files.length > 10) { setError('Attach up to 10 supporting documents.'); return; }
    setUploading(true); setError('');
    try { for (const file of Array.from(files)) { const saved = await uploadRequestAttachment(file, category); setAttachments(a => [...a, saved]); } }
    catch (e) { setError(errorMessage(e)); } finally { setUploading(false); }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy || uploading || !formRef.current?.reportValidity()) return;
    if (data.terms.startDate && data.terms.endDate && data.terms.endDate < data.terms.startDate) { setError('The end date must be on or after the start date.'); return; }
    if (step < 5) { setFurthest(Math.max(furthest, step + 1)); go(step + 1); return; }
    if (!data.title.trim() || !data.counterparty.trim() || !data.businessUnit.trim() || !data.terms.scope.trim()) { go(0); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.requestedByDate)) { go(2); return; }
    setBusy(true); setError('');
    try { const result = await createClientRequest({ ...data, submissionKey: submissionKey.current, attachmentIds: attachments.map(a => a.id) }); window.dispatchEvent(new Event('concord:inbox')); router.push(`/requests/${result.id}?submitted=1`); }
    catch (e) { setError(errorMessage(e)); setBusy(false); }
  }
  const commercial = data.contractType !== 'NDA';
  const selected = options?.legalTeam.find(p => p.id === data.assignedLegalUserId);
  const text = (key: keyof AgreementTermSheet, label: string, placeholder?: string) => <label className="req-field wide" key={key}>{label}<textarea maxLength={2000} rows={3} value={String(data.terms[key] ?? '')} onChange={e => term(key, e.target.value as never)} placeholder={placeholder} /></label>;
  return <div className="req-page req-wizard"><Link href="/requests" className="req-back">← My Requests</Link><RequestHeader kicker="Legal Contract Requests" title="Request a Contract" description="Tell us what you need. Your legal team will take it from here." />
    {optionError ? <RequestError message={optionError} retry={load} /> : !options ? <RequestLoading /> : <>
    <div className="wizard-layout"><aside className="wizard-guide"><ol aria-label="Request progress">{STEPS.map((label, i) => <li key={label} aria-current={step === i ? 'step' : undefined} data-complete={i < step}><button type="button" disabled={i > furthest || busy || uploading} onClick={() => { if (i < step || formRef.current?.reportValidity()) go(i); }}><span>{i < step ? '✓' : i + 1}</span><b>{label}</b></button></li>)}</ol><p>One request.<br />One continuous journey.</p></aside>
    <section className="req-panel"><form ref={formRef} className="req-form" onSubmit={submit} onInvalidCapture={e => { const details = (e.target as HTMLElement).closest('details'); if (details) details.open = true; }} aria-busy={busy || uploading}>
    <fieldset disabled={busy || uploading}><div key={step} className="req-step-view"><span className="section-kicker">Step {step + 1} of 6</span><h3 ref={headingRef} tabIndex={-1}>{STEPS[step]}</h3>
    {step === 0 && <div className="req-fields">
      <label className="req-field wide">Request title *<input required maxLength={160} value={data.title} onChange={e => field('title', e.target.value)} placeholder="e.g. MSA — ABC Technologies" /></label>
      <label className="req-field">Business unit *<input required maxLength={120} value={data.businessUnit} onChange={e => field('businessUnit', e.target.value)} placeholder="e.g. Marketing" /></label>
      <label className="req-field">Requestor<input readOnly value={options.requester.name} /><small>From your signed-in account</small></label>
      <label className="req-field">Counterparty *<input required maxLength={180} value={data.counterparty} onChange={e => field('counterparty', e.target.value)} placeholder="Registered legal name" /></label>
      <label className="req-field">Agreement type *<select value={data.contractType} onChange={e => field('contractType', e.target.value as CreateClientRequest['contractType'])}>{AGREEMENT_TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
      <label className="req-field wide">Business purpose *<textarea required rows={4} maxLength={5000} value={data.terms.scope} onChange={e => term('scope', e.target.value)} placeholder="What should this agreement achieve?" /></label>
      <details className="workflow-disclosure"><summary>Counterparty contact details <span>Optional</span></summary><div className="req-fields"><label className="req-field">Contact email<input type="email" maxLength={254} value={data.terms.counterpartyContactEmail ?? ''} onChange={e => term('counterpartyContactEmail', e.target.value)} /></label>{text('counterpartyAddress', 'Address')}</div></details>
    </div>}
    {step === 1 && <div className="req-fields">
      <p className="req-help wide">{commercial ? 'Share the terms already discussed. Leave undecided items blank.' : 'For an NDA, start with the confidentiality term. Commercial details are optional.'}</p>
      <label className="req-field wide">Term<input maxLength={240} value={data.terms.term ?? ''} onChange={e => term('term', e.target.value)} placeholder={commercial ? 'e.g. 3 years from execution' : 'e.g. Confidentiality continues for 2 years'} /></label>
      <label className="req-field">Effective date<input type="date" max="9999-12-31" value={data.terms.startDate ?? ''} onChange={e => term('startDate', e.target.value)} /></label>
      <label className="req-field">Expiry date<input type="date" max="9999-12-31" min={data.terms.startDate} value={data.terms.endDate ?? ''} onChange={e => term('endDate', e.target.value)} /></label>
      <details className="workflow-disclosure" open={commercial || undefined}><summary>Value, payment &amp; deliverables</summary><div className="req-fields"><label className="req-field">Contract value<input type="number" inputMode="decimal" min="0" max="999999999999.99" step="0.01" value={data.terms.amount ?? ''} onChange={e => term('amount', e.target.value)} /></label><label className="req-field">Currency<select value={data.terms.currency} onChange={e => term('currency', e.target.value)}>{['INR','USD','EUR','GBP','SGD','AED','AUD'].map(c => <option key={c}>{c}</option>)}</select></label><label className="req-field wide">Payment / commercial structure{Number(data.terms.amount) > 0 ? ' *' : ''}<textarea required={Number(data.terms.amount) > 0} maxLength={2000} value={data.terms.paymentTerms ?? ''} onChange={e => term('paymentTerms', e.target.value)} /></label>{text('deliverables','Deliverables & milestones')}</div></details>
      <details className="workflow-disclosure"><summary>Renewal &amp; exit terms</summary><div className="req-fields">{text('renewalTerms','Renewal mechanism')}<label className="req-field">Notice period (days)<input type="number" min="0" max="3650" step="1" value={data.terms.noticePeriodDays ?? ''} onChange={e => term('noticePeriodDays', e.target.value === '' ? undefined : Number(e.target.value))} /></label>{text('terminationTerms','Termination terms')}</div></details>
    </div>}
    {step === 2 && <div className="req-fields"><label className="req-field">Personal data / privacy<select value={data.terms.dataInvolved} onChange={e => term('dataInvolved', e.target.value as AgreementTermSheet['dataInvolved'])}><option value="unsure">Unsure — Legal can advise</option><option value="none">No personal data</option><option value="personal">Personal data</option><option value="sensitive">Sensitive personal data</option></select></label><label className="req-field">Confidential information<select value={data.terms.confidentialInformation ?? 'unsure'} onChange={e => term('confidentialInformation', e.target.value as 'yes' | 'no' | 'unsure')}><option value="unsure">Unsure</option><option value="yes">Yes</option><option value="no">No</option></select></label><label className="req-field">Territory / jurisdiction<input maxLength={240} value={data.terms.governingLaw ?? ''} onChange={e => term('governingLaw', e.target.value)} placeholder="Leave blank for Legal to advise" /></label><label className="req-field">Priority<select value={data.urgency} onChange={e => field('urgency', e.target.value as CreateClientRequest['urgency'])}><option value="standard">Standard</option><option value="urgent">Urgent</option></select></label><label className="req-field wide">When do you need Legal’s first draft or review? *<input type="date" max="9999-12-31" required value={data.requestedByDate} onChange={e => field('requestedByDate', e.target.value)} /><small>Legal will confirm the target date.</small></label><details className="workflow-disclosure"><summary>Known risks &amp; non-standard requirements <span>Share any concerns already identified</span></summary><div className="req-fields">{text('intellectualProperty','Intellectual property')}{text('exclusivity','Exclusivity')}{text('indemnityConcerns','Indemnity / liability concerns')}{text('regulatoryConsiderations','Regulatory considerations')}{text('specialInstructions','Other instructions or deviations')}</div></details></div>}
    {step === 3 && <div className="req-fields"><p className="req-help wide">Add counterparty paper or supporting context. You can continue without attachments.</p><label className="req-field wide">Document category<select value={category} onChange={e => setCategory(e.target.value)}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label><label className="request-dropzone"><IconDoc /><b>{uploading ? 'Saving documents…' : 'Choose supporting documents'}</b><span>Up to 10 files · 25 MB each · PDF, Word, Office, images or text</span><input type="file" multiple accept=".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.tif,.tiff,.txt" onChange={e => { void upload(e.target.files); e.currentTarget.value = ''; }} /></label><ul className="attachment-list">{attachments.map(a => <li key={a.id}><span><b>{a.filename}</b><small>{a.category} · {(a.size / 1024).toFixed(0)} KB</small></span><button type="button" className="btn" aria-label={`Remove ${a.filename} from this request`} onClick={() => setAttachments(v => v.filter(x => x.id !== a.id))}>Remove</button></li>)}</ul></div>}
    {step === 4 && <div className="req-fields"><label className="req-field wide">Preferred Legal Counsel<select value={data.assignedLegalUserId} onChange={e => field('assignedLegalUserId', e.target.value)}><option value="auto">No preference — assign for me</option>{options.legalTeam.map(p => <option key={p.id} value={p.id}>{p.name} — {p.roleLabel}</option>)}</select><small>{selected ? `${selected.name} will receive your request.` : 'Concord will assign an available lawyer based on their current request workload.'}</small></label>{selected && <div className="assignment-preview"><span className="req-avatar" aria-hidden="true">{selected.name.split(/\s+/).map(n => n[0]).slice(0,2).join('')}</span><div><b>{selected.name}</b><p>{selected.email}</p></div></div>}{!options.legalTeam.length && <RequestError message="No legal resources are available yet. An administrator needs to add the legal team before requests can be submitted." />}</div>}
    {step === 5 && <div className="request-summary"><div className="agreement-section-head"><h3>{data.title}</h3><button className="btn" type="button" onClick={() => go(0)}>Edit basics</button></div><p>{data.counterparty} · {data.contractType} · {data.businessUnit}</p><dl className="agreement-facts"><div><dt>Requestor</dt><dd>{options.requester.name}</dd></div><div><dt>Legal counsel</dt><dd>{selected?.name ?? 'Assign by current workload'}</dd></div><div><dt>Requested by</dt><dd>{requestDate(data.requestedByDate)}</dd></div><div><dt>Priority</dt><dd>{data.urgency}</dd></div></dl><TermSheet terms={data.terms} /><div className="req-actions"><button className="btn" type="button" onClick={() => go(1)}>Edit terms</button><button className="btn" type="button" onClick={() => go(2)}>Edit legal &amp; risk</button></div><div className="agreement-section-head"><h4>{attachments.length} supporting documents</h4><button className="btn" type="button" onClick={() => go(3)}>Edit documents</button></div>{attachments.map(a => <p key={a.id}>{a.filename} · {a.category}</p>)}<p className="req-help">Your request and notification will be saved in Concord. {options.outlookConfigured ? 'Your lawyer will also be notified through Outlook.' : 'Outlook notifications will start once Microsoft is connected.'}</p></div>}
    </div></fieldset>{error && <RequestError message={error} />}<div className="req-actions wizard-actions">{step > 0 ? <button type="button" className="btn" disabled={busy || uploading} onClick={() => go(step - 1)}>← Back</button> : <Link className="btn" href="/requests">Cancel</Link>}<button className="btn btn-gold" disabled={busy || uploading || !options.persistenceAvailable || (step === 5 && !options.legalTeam.length)}>{busy ? 'Submitting…' : uploading ? 'Saving documents…' : step === 5 ? 'Submit Contract Request' : 'Continue'}{!busy && <IconArrowRight />}</button></div></form></section></div></>}
  </div>;
}
