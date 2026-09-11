'use client';

import type { CSSProperties, FormEvent } from 'react';
import { REPORT_FOCUSES, REPORT_THEMES, type ReportFocus, type ReportOptions, type ReportTheme } from '@concord/shared';
import { IconArrowRight, IconCheck } from './icons';

interface Props {
  options: Required<ReportOptions>;
  onChange: (options: Required<ReportOptions>) => void;
  onGenerate: () => void;
  building: boolean;
  disabled: boolean;
  dirty: boolean;
  aiStatus?: string;
  signaturesRestricted: boolean;
}

const EXAMPLES: Array<{ label: string; focus: ReportFocus; prompt: string }> = [
  { label: 'Leadership brief', focus: 'portfolio', prompt: 'Prepare a concise leadership brief. Prioritise the highest risks and decisions needed, cite supporting agreements, and flag missing information.' },
  { label: 'Renewal priorities', focus: 'renewals', prompt: 'Explain the upcoming obligations and renewal decisions. Distinguish overdue items from future commitments and cite the relevant records.' },
  { label: 'Approval priorities', focus: 'approvals', prompt: 'Summarise the review and approval queue, highlighting high-risk agreements. Do not infer delays or bottlenecks when stage timestamps are unavailable.' },
];

export function ReportComposer({ options, onChange, onGenerate, building, disabled, dirty, aiStatus, signaturesRestricted }: Props) {
  const submit = (event: FormEvent) => { event.preventDefault(); if (!disabled) onGenerate(); };
  return (
    <form className="card report-composer" onSubmit={submit} aria-labelledby="report-composer-title">
      <div className="report-composer-heading"><div><span className="eyebrow">Your perspective</span><h3 id="report-composer-title">Make the report yours</h3><p>Choose a visual style, select your records and tell Concord what matters for this conversation.</p></div><span className="report-composer-tag">Editable PowerPoint</span></div>
      <fieldset className="report-composer-fields" disabled={disabled}>
        <legend className="sr-only">Personalise the report</legend>
        <fieldset className="report-theme-fieldset">
          <legend>Presentation style</legend>
          <div className="report-theme-choices">
            {(Object.entries(REPORT_THEMES) as Array<[ReportTheme, typeof REPORT_THEMES[ReportTheme]]>).map(([key, theme]) => (
              <label className={`report-theme-choice${options.theme === key ? ' is-selected' : ''}`} key={key}>
                <input type="radio" name="report-theme" value={key} checked={options.theme === key} onChange={() => onChange({ ...options, theme: key })} />
                <span className="report-theme-art" aria-hidden="true" style={{ '--deck-bg': `#${theme.background}`, '--deck-ink': `#${theme.ink}`, '--deck-gold': `#${theme.gold}`, '--deck-line': `#${theme.line}` } as CSSProperties}>
                  <span className="report-theme-wordmark">Concord</span><strong>Portfolio<br />intelligence</strong><span className="report-theme-rule" /><span className="report-theme-bars"><i /><i /><i /></span>
                </span>
                <span className="report-theme-label"><span>{theme.label}</span><span className="report-theme-check" aria-hidden="true">{options.theme === key && <IconCheck />}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="report-brief-fields">
          <div className="report-filter-grid">
            <label>Report cut<select value={options.focus} onChange={(e) => onChange({ ...options, focus: e.target.value as ReportFocus })}>{Object.entries(REPORT_FOCUSES).map(([value, item]) => <option key={value} value={value} disabled={value === 'signatures' && signaturesRestricted}>{item.label}{value === 'signatures' && signaturesRestricted ? ' (restricted)' : ''}</option>)}</select></label>
            <label>Agreement filter<input type="search" maxLength={160} value={options.query} onChange={(e) => onChange({ ...options, query: e.target.value })} placeholder="Counterparty, title or type" /></label>
            <label>Date horizon<select value={options.horizonDays} onChange={(e) => onChange({ ...options, horizonDays: Number(e.target.value) })}>{[30, 90, 180, 365].map((days) => <option value={days} key={days}>{days} days</option>)}</select></label>
          </div>
          <p className="report-filter-hint">{options.focus === 'renewals' ? 'Includes overdue obligations and dates within the selected horizon.' : 'The date horizon sets the upcoming-obligations metric for this cut.'}</p>
          <label className="report-prompt-label" htmlFor="report-prompt">What should the presentation focus on?</label>
          <textarea id="report-prompt" value={options.prompt} maxLength={1500} rows={4} onChange={(e) => onChange({ ...options, prompt: e.target.value })} placeholder="For example: Prepare a leadership brief on high-risk vendor agreements. Highlight decisions needed and the next recorded obligations." aria-describedby="report-prompt-help report-ai-availability" />
          <div className="report-prompt-meta"><span id="report-prompt-help">The brief guides AI commentary. Filters define the records in scope.</span><span>{options.prompt.length.toLocaleString()} / 1,500</span></div>
          <div className="report-prompt-examples" aria-label="Example reporting briefs">{EXAMPLES.map((example) => <button type="button" className="report-example" key={example.label} onClick={() => onChange({ ...options, focus: example.focus, prompt: example.prompt })}>{example.label}<IconArrowRight /></button>)}</div>
          <p className="report-ai-availability" id="report-ai-availability">{aiStatus === 'generated' ? 'AI will use the selected metadata and cite supporting records. Figures and dates come from the database.' : aiStatus === 'fallback' ? 'AI is currently unavailable. Filters and themes work; a custom AI narrative cannot be generated until the provider recovers.' : 'Report AI is not connected yet. Filters and themes work now; custom AI commentary becomes available after connection.'}</p>
        </div>
      </fieldset>
      <div className="report-composer-actions"><span>{dirty ? 'Apply your brief and filters before downloading.' : 'Theme changes apply to your next PowerPoint download.'}</span><button className="btn btn-gold" type="submit" disabled={disabled}>{building ? <span className="button-spinner" aria-hidden="true" /> : <IconArrowRight />}<span>{building ? 'Building report' : dirty ? 'Apply brief & filters' : 'Refresh report'}</span></button></div>
    </form>
  );
}
