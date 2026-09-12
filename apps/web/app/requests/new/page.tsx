'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AgreementTermSheet, ClientRequestOptions, CreateClientRequest } from '@concord/shared';
import { createClientRequest, getRequestOptions } from '@/app/lib/api';
import { AGREEMENT_TYPES, errorMessage, RequestError, RequestHeader, RequestLoading, requestDate, TermSheet } from '@/components/RequestUI';
import { IconArrowRight } from '@/components/icons';

const INITIAL: CreateClientRequest = { submissionKey: '', title: '', counterparty: '', businessUnit: '', contractType: 'NDA', assignedLegalUserId: '', requestedByDate: '', urgency: 'standard', terms: { scope: '', currency: 'INR', dataInvolved: 'unsure' } };
export default function NewRequestPage() {
  const router = useRouter();
  const [options, setOptions] = useState<ClientRequestOptions>();
  const [data, setData] = useState<CreateClientRequest>(INITIAL);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [optionError, setOptionError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const submissionKey = useRef('');
  async function load() { setOptionError(''); try { setOptions(await getRequestOptions()); } catch (e) { setOptionError(errorMessage(e)); } }
  useEffect(() => { submissionKey.current = crypto.randomUUID(); void load(); }, []);
  function field<K extends keyof CreateClientRequest>(key: K, value: CreateClientRequest[K]) { setData(d => ({ ...d, [key]: value })); }
  function term<K extends keyof AgreementTermSheet>(key: K, value: AgreementTermSheet[K]) { setData(d => ({ ...d, terms: { ...d.terms, [key]: value || undefined } })); }
  function go(next: number) { setError(''); setStep(next); requestAnimationFrame(() => { headingRef.current?.focus(); headingRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' }); }); }
  function validateTerms() {
    if (data.terms.startDate && data.terms.endDate && data.terms.endDate < data.terms.startDate) { setError('The end date must be on or after the start date.'); return false; }
    return true;
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy || !formRef.current?.reportValidity()) return;
    if (!validateTerms()) return;
    if (step === 2 && !/^\d{4}-\d{2}-\d{2}$/.test(data.requestedByDate)) { setError('Choose a valid date for Legal’s first draft or review.'); return; }
    if (step < 2) { go(step + 1); return; }
    setBusy(true); setError('');
    try {
      const result = await createClientRequest({ ...data, submissionKey: submissionKey.current });
      window.dispatchEvent(new Event('concord:inbox'));
      router.push(`/requests/${result.id}`);
    } catch (e) { setError(errorMessage(e)); setBusy(false); }
  }
  const selected = options?.legalTeam.find(p => p.id === data.assignedLegalUserId);
  return <div className="req-page"><Link href="/requests" className="req-back">← Agreement requests</Link><RequestHeader title="Tell Legal what you need." description="A clear term sheet gives your chosen lawyer the context to start. Fields marked * are required." />
    {optionError ? <RequestError message={optionError} retry={load} /> : !options ? <RequestLoading /> : <>
      {!options.persistenceAvailable && <RequestError message="The database is unavailable. Please try again before submitting a request." retry={load} />}
      {!options.legalTeam.length && <div className="req-notice">No legal team members are available yet. Ask a Concord administrator to add your lawyers in Team &amp; access.</div>}
      <section className="req-panel"><ol className="req-steps" aria-label="Request progress">{['The agreement', 'Commercial terms', 'Your legal contact'].map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined}><span>{index + 1}</span>{label}</li>)}</ol>
        <form ref={formRef} className="req-form" onSubmit={submit} onInvalidCapture={e => { const details = (e.target as HTMLElement).closest('details'); if (details) details.open = true; }} aria-busy={busy}><fieldset disabled={busy}><div key={step} className="req-step-view"><h3 ref={headingRef} tabIndex={-1}>{['Start with the essentials', 'Set out the terms', 'Choose who you work with'][step]}</h3><p className="req-help">{['Your request will be raised as ' + options.requester.name + '.', 'Add what you know. Your lawyer can advise on details that are still being agreed.', 'Choose a legal team member from your organisation. They will receive this request in Concord.'][step]}</p>
          {step === 0 && <div className="req-fields">
            <label className="req-field wide">Agreement title *<input required maxLength={160} value={data.title} onChange={e => field('title', e.target.value)} placeholder="e.g. Annual salon equipment supply" /></label>
            <label className="req-field">Your department *<input required maxLength={120} value={data.businessUnit} onChange={e => field('businessUnit', e.target.value)} placeholder="e.g. Procurement" /></label>
            <label className="req-field">Agreement type *<select value={data.contractType} onChange={e => field('contractType', e.target.value as CreateClientRequest['contractType'])}>{AGREEMENT_TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
            <label className="req-field">Counterparty legal name *<input required maxLength={180} value={data.counterparty} onChange={e => field('counterparty', e.target.value)} placeholder="Registered name of the other party" /></label>

            <label className="req-field wide">Scope &amp; purpose *<textarea required maxLength={5000} rows={5} value={data.terms.scope} onChange={e => term('scope', e.target.value)} placeholder="What are we agreeing to, and what should this agreement achieve?" /></label>
            <details className="workflow-disclosure"><summary>Counterparty contact details <span>Optional · add an email or address if available</span></summary><div className="req-fields">
            <label className="req-field">Counterparty contact email<input type="email" maxLength={254} value={data.terms.counterpartyContactEmail ?? ''} onChange={e => term('counterpartyContactEmail', e.target.value)} /></label>
            <label className="req-field wide">Counterparty address<textarea maxLength={1500} rows={2} value={data.terms.counterpartyAddress ?? ''} onChange={e => term('counterpartyAddress', e.target.value)} /></label>
            </div></details>
          </div>}
          {step === 1 && <div className="req-fields">
            <label className="req-field wide">Deliverables &amp; milestones<textarea maxLength={2500} value={data.terms.deliverables ?? ''} onChange={e => term('deliverables', e.target.value)} placeholder="What must be delivered, by whom and when?" /></label>
            <label className="req-field">Agreement value<input type="number" min="0" max="999999999999.99" step="0.01" inputMode="decimal" value={data.terms.amount ?? ''} onChange={e => term('amount', e.target.value)} /><small>Leave blank if the value is not yet agreed.</small></label>
            <label className="req-field">Currency<select value={data.terms.currency} onChange={e => term('currency', e.target.value)}>{['INR','USD','EUR','GBP','SGD','AED','AUD'].map(c => <option key={c}>{c}</option>)}</select></label>
            <label className="req-field wide">Payment terms{Number(data.terms.amount) > 0 ? ' *' : ''}<textarea required={Number(data.terms.amount) > 0} maxLength={2000} value={data.terms.paymentTerms ?? ''} onChange={e => term('paymentTerms', e.target.value)} placeholder="Payment schedule, credit period, taxes and any advance" /></label>
            <label className="req-field">Proposed start date<input type="date" max="9999-12-31" value={data.terms.startDate ?? ''} onChange={e => term('startDate', e.target.value)} /></label>
            <label className="req-field">Proposed end date<input type="date" max="9999-12-31" min={data.terms.startDate} value={data.terms.endDate ?? ''} onChange={e => term('endDate', e.target.value)} /></label>
            <label className="req-field">Will personal data be shared? *<select value={data.terms.dataInvolved} onChange={e => term('dataInvolved', e.target.value as AgreementTermSheet['dataInvolved'])}><option value="unsure">Unsure — please advise</option><option value="none">No personal data</option><option value="personal">Personal data</option><option value="sensitive">Sensitive personal data</option></select></label>
            <details className="workflow-disclosure"><summary>Renewal, exit &amp; legal terms <span>Optional · leave these to Legal if not yet agreed</span></summary><div className="req-fields">
            <label className="req-field">Renewal terms<textarea maxLength={2000} value={data.terms.renewalTerms ?? ''} onChange={e => term('renewalTerms', e.target.value)} placeholder="Renewal period and notice, if agreed" /></label>
            <label className="req-field">Termination terms<textarea maxLength={2000} value={data.terms.terminationTerms ?? ''} onChange={e => term('terminationTerms', e.target.value)} placeholder="Exit rights and notice, if agreed" /></label>
            <label className="req-field">Governing law / jurisdiction<input maxLength={240} value={data.terms.governingLaw ?? ''} onChange={e => term('governingLaw', e.target.value)} placeholder="Leave blank for Legal to advise" /></label>
            </div></details>
          </div>}
          {step === 2 && <><div className="req-fields">
            <label className="req-field wide">Preferred legal team member *<select required value={data.assignedLegalUserId} onChange={e => field('assignedLegalUserId', e.target.value)}><option value="">Choose your legal contact</option>{options.legalTeam.map(p => <option key={p.id} value={p.id}>{p.name} · {p.email}</option>)}</select><small>This assigns your request to the selected person.</small></label>
            <label className="req-field">When do you need Legal’s first draft or review? *<input type="date" max="9999-12-31" required value={data.requestedByDate} onChange={e => field('requestedByDate', e.target.value)} /><small>This is your requested date; Legal will confirm timing.</small></label>
            <label className="req-field">Priority<select value={data.urgency} onChange={e => field('urgency', e.target.value as CreateClientRequest['urgency'])}><option value="standard">Standard</option><option value="urgent">Urgent</option></select></label>
            <label className="req-field wide">Additional instructions<textarea maxLength={4000} value={data.terms.specialInstructions ?? ''} onChange={e => term('specialInstructions', e.target.value)} placeholder="Key concerns, context or reasons for urgency" /></label>
          </div><details className="req-review"><summary>Review your term sheet before submitting</summary><p><b>{data.title}</b><br />{data.counterparty} · {data.contractType} · {data.businessUnit}</p><TermSheet terms={data.terms} /></details><p className="req-help">{selected ? `${selected.name} will receive your request` : 'Your selected lawyer will receive your request'}{data.requestedByDate ? ` with a requested date of ${requestDate(data.requestedByDate)}` : ''}. {options.outlookConfigured ? 'An Outlook notification will also be queued for delivery.' : 'Outlook email is awaiting Microsoft setup; the notification will be saved in Concord immediately.'}</p></>}
        </div></fieldset>
        {error && <RequestError message={error} />}
        <div className="req-actions">{step > 0 ? <button type="button" className="btn" disabled={busy} onClick={() => go(step - 1)}>← Back</button> : <Link className="btn" href="/requests">Cancel</Link>}<button className="btn btn-gold" type="submit" disabled={busy || !options.persistenceAvailable || !options.legalTeam.length}>{busy ? 'Saving your request…' : step === 2 ? 'Submit agreement request' : 'Continue'}{!busy && <IconArrowRight />}</button></div>
      </form></section><p className="req-help">Submitting saves your term sheet with a linked agreement. It does not approve or sign the agreement.</p>
    </>}
  </div>;
}
