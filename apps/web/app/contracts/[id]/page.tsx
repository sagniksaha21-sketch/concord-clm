import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { LifecycleStage } from '@concord/shared';
import { getClientRequest, getContract, getPermissions } from '@/app/lib/api';
import { requestDate, RequestStatus, TermSheet } from '@/components/RequestUI';
import { IconArrowRight, IconCalendar, IconDoc, IconSign, IconSparkle } from '@/components/icons';

export const dynamic = 'force-dynamic';
const STAGES: Record<LifecycleStage, string> = { intake: 'Intake', drafting: 'Drafting', review: 'Legal review', approval: 'Approval', signature: 'Signing', active: 'Active', renewal: 'Renewal' };

export default async function AgreementPage({ params }: { params: { id: string } }) {
  const token = cookies().get('concord_token')?.value;
  if (!token) redirect('/login');
  const [contract, access] = await Promise.all([getContract(params.id, token), getPermissions(token)]);
  const request = contract.requestId && access.permissions.includes('request:read') ? await getClientRequest(contract.requestId, token).catch(() => null) : null;
  const id = encodeURIComponent(contract.id);
  const reviewHref = `/review/${id}`;
  const datesHref = `/obligations?contract=${id}`;
  const signingHref = `/esign?contract=${id}`;
  const early = ['intake', 'drafting'].includes(contract.stage);
  const canDraft = access.permissions.includes('contract:write');
  const next = early
    ? { title: request ? 'Start with the client’s instructions' : 'Prepare the agreement for review', body: request ? 'Check the saved term sheet and confirm any missing details with the department before preparing the draft.' : 'Your legal team can prepare the draft using approved templates. Existing findings are available in the review workspace.', label: request ? 'Open client request' : canDraft ? 'Open drafting tools' : 'View legal review', href: request ? `/requests/${request.id}` : canDraft ? '/authoring' : reviewHref }
    : contract.stage === 'approval'
    ? { title: 'Coordinate the approval', body: 'Review the agreement and route the decision to the authorised approvers.', label: access.permissions.includes('approval:route') ? 'Open review & approval' : 'Open legal review', href: access.permissions.includes('approval:route') ? `${reviewHref}#approval` : reviewHref }
    : contract.stage === 'signature'
    ? { title: 'Follow the signing process', body: 'Confirm signing authority and track the agreement’s signature requests.', label: access.permissions.includes('esign:send') ? 'Open signatures' : 'View agreement review', href: access.permissions.includes('esign:send') ? signingHref : reviewHref }
    : ['active', 'renewal'].includes(contract.stage)
    ? { title: contract.stage === 'renewal' ? 'Plan the renewal' : 'Keep track of commitments', body: 'Review the dates and obligations recorded for this agreement.', label: 'View obligations', href: datesHref }
    : { title: 'Review the agreement', body: 'Check the findings against the document and resolve any material deviations before approval.', label: 'Open legal review', href: reviewHref };

  return <div className="agreement-page">
    <Link className="req-back" href="/pipeline">← Agreements</Link>
    <div className="view-head"><div className="vh-left"><div className="eyebrow">{contract.id}</div><h2>{contract.title}</h2><p>{contract.counterparty}</p></div><span className="badge neutral">{STAGES[contract.stage] ?? contract.stage}</span></div>
    <div className="agreement-layout">
      <div className="agreement-main">
        <section className="card agreement-next" aria-labelledby="agreement-next"><span className="section-kicker">Suggested next step</span><h3 id="agreement-next">{next.title}</h3><p>{next.body}</p><Link className="btn btn-gold" href={next.href}>{next.label}<IconArrowRight /></Link></section>
        <section className="card card-pad"><h3>Agreement details</h3><dl className="agreement-facts"><div><dt>Agreement type</dt><dd>{contract.type}</dd></div><div><dt>Value</dt><dd>{contract.valueDisplay}</dd></div><div><dt>Version</dt><dd>{contract.version}</dd></div><div><dt>Source</dt><dd>{contract.source}</dd></div></dl></section>
        {request && <section className="card card-pad"><div className="agreement-section-head"><h3>Client instructions</h3><Link href={`/requests/${request.id}`} className="ch-act">Full request →</Link></div><p className="agreement-scope">{request.terms.scope}</p><details className="workflow-disclosure"><summary>Commercial terms &amp; details</summary><TermSheet terms={request.terms} /></details></section>}
        <details className="card workflow-disclosure agreement-tools"><summary>More agreement tools<span>Review, drafting and signatures</span></summary><div className="agreement-tool-links">
          <Link href={reviewHref}><IconSparkle /><span>AI findings &amp; legal review</span><IconArrowRight /></Link>
          {canDraft && <Link href="/authoring"><IconDoc /><span>Draft from an approved template</span><IconArrowRight /></Link>}
          {access.permissions.includes('esign:send') && <Link href={signingHref}><IconSign /><span>Signatures &amp; stamps</span><IconArrowRight /></Link>}
          <Link href={datesHref}><IconCalendar /><span>Obligations &amp; renewals</span><IconArrowRight /></Link>
        </div></details>
      </div>
      <aside className="card card-pad agreement-contact"><h3>{request ? 'Your legal contact' : 'At a glance'}</h3>{request ? <><div className="req-person"><span className="req-avatar" aria-hidden="true">{request.assignedLegal.name.split(/\s+/).map(n => n[0]).slice(0,2).join('')}</span><div><b>{request.assignedLegal.name}</b><a href={`mailto:${request.assignedLegal.email}`}>{request.assignedLegal.email}</a></div></div><dl className="req-meta"><div><dt>Department</dt><dd>{request.businessUnit}</dd></div><div><dt>Requested by</dt><dd>{request.requester.name}</dd></div><div><dt>Requested date</dt><dd>{requestDate(request.requestedByDate)}</dd></div><div><dt>Client request status</dt><dd><RequestStatus status={request.status} /></dd></div></dl>{request.legalNote && <p className="agreement-scope">{request.legalNote}</p>}</> : <dl className="req-meta"><div><dt>Current stage</dt><dd>{STAGES[contract.stage] ?? contract.stage}</dd></div><div><dt>Recorded risk</dt><dd><span className={`badge ${contract.risk}`}>{contract.risk}</span></dd></div></dl>}</aside>
    </div>
  </div>;
}
