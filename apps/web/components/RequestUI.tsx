import Link from 'next/link';
import { AGREEMENT_TYPES, OUTLOOK_STATUS_LABELS, REQUEST_STATUSES } from '@concord/shared';
import type { AgreementTermSheet, ClientRequest, OutlookDeliveryStatus } from '@concord/shared';
import { IconDoc, IconArrowRight } from './icons';

export { AGREEMENT_TYPES, REQUEST_STATUSES };
export const requestDate = (value: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value));
export const errorMessage = (e: unknown) => e instanceof Error ? e.message : 'Something went wrong. Please try again.';
export function RequestHeader({ kicker = 'Department portal', title, description, action }: { kicker?: string; title: string; description: string; action?: React.ReactNode }) {
  return <header className="req-header"><div><span className="eyebrow">{kicker}</span><h2>{title}</h2><p>{description}</p></div>{action}</header>;
}
export function RequestLoading() { return <div className="req-loading" role="status" aria-label="Loading your requests"><div /><div /><div /><span>Loading…</span></div>; }
export function RequestError({ message, retry }: { message: string; retry?: () => void }) { return <div className="req-alert" role="alert"><span>{message}</span>{retry && <button type="button" className="btn" onClick={retry}>Try again</button>}</div>; }
export function RequestStatus({ status }: { status: ClientRequest['status'] }) { return <span className={`req-status req-status-${status}`}><i aria-hidden="true" />{REQUEST_STATUSES[status]}</span>; }
export function OutlookStatus({ status }: { status: OutlookDeliveryStatus }) {
  return <span className="req-delivery">{OUTLOOK_STATUS_LABELS[status] ?? status}</span>;
}
export function RequestCard({ item }: { item: ClientRequest }) {
  return <Link href={`/requests/${item.id}`} className="req-card"><div className="req-card-top"><span className="req-id">{item.id} · {item.contractType}</span><RequestStatus status={item.status} /></div><h3>{item.title}</h3><p>{item.counterparty} · {item.businessUnit}</p><div className="req-card-bottom"><span><b>{item.assignedLegal.name}</b><small>Your legal contact</small></span><span><b>{requestDate(item.requestedByDate)}</b><small>{item.urgency === 'urgent' ? 'Urgent · requested by' : 'Requested by'}</small></span><IconArrowRight /></div></Link>;
}
export function RequestEmpty({ filtered = false }: { filtered?: boolean }) { return <div className="req-empty"><IconDoc /><h3>{filtered ? 'No matching requests' : 'Your next agreement starts here'}</h3><p>{filtered ? 'Try a different search or status.' : 'Share the terms, choose your legal contact and follow the request in one place.'}</p>{!filtered && <Link className="btn btn-gold" href="/requests/new">Request an agreement <IconArrowRight /></Link>}</div>; }
export function TermSheet({ terms }: { terms: AgreementTermSheet }) {
  const rows: [string, string | undefined][] = [
    ['Scope & purpose', terms.scope], ['Deliverables', terms.deliverables], ['Agreement value', terms.amount ? `${terms.currency} ${Number(terms.amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : undefined],
    ['Payment terms', terms.paymentTerms], ['Start date', terms.startDate ? requestDate(terms.startDate) : undefined], ['End date', terms.endDate ? requestDate(terms.endDate) : undefined],
    ['Renewal terms', terms.renewalTerms], ['Termination terms', terms.terminationTerms], ['Governing law / jurisdiction', terms.governingLaw],
    ['Counterparty address', terms.counterpartyAddress], ['Counterparty contact', terms.counterpartyContactEmail],
    ['Personal data', ({ none: 'None', personal: 'Personal data', sensitive: 'Sensitive personal data', unsure: 'Please advise' })[terms.dataInvolved]], ['Additional instructions', terms.specialInstructions],
  ];
  return <dl className="req-terms">{rows.filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
