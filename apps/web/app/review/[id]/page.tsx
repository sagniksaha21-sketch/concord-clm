import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getContract, getReview } from '@/app/lib/api';
import RiskGauge from '@/components/RiskGauge';
import ReviewSections from '@/components/ReviewSections';
import DeviationCard from '@/components/DeviationCard';
import ApproveBar from '@/components/ApproveBar';
import { IconDoc, IconShield, IconSparkle } from '@/components/icons';

export const dynamic = 'force-dynamic';

export default async function ReviewPage({ params }: { params: { id: string } }) {
  const token = cookies().get('concord_token')?.value;
  if (!token) redirect('/login');

  const [contract, review] = await Promise.all([
    getContract(params.id, token),
    getReview(params.id, token),
  ]);
  const exampleReview = review.model === 'built-in';
  const metadataReview = review.model === 'synthesized';
  const reviewBasis = exampleReview ? 'Example findings' : metadataReview ? 'Metadata overview' : 'Document findings';

  return (
    <>
      <div className="review-breadcrumb"><Link href="/review">AI Review</Link><span>/</span><span>{contract.id}</span></div>

      <section className="review-hero">
        <div className="review-hero-main">
          <div className="eyebrow">AI-assisted contract review</div>
          <h2>{contract.title}</h2>
          <p>{contract.counterparty} · {contract.type} · {contract.valueDisplay}</p>
          <div className="review-meta-row">
            <span className={`badge ${review.riskLevel === 'medium' ? 'med' : review.riskLevel}`}><i className="bd" />{review.riskLevel} risk · {review.riskScore}/100</span>
            <span className="meta-chip">Stage · {contract.stage}</span>
            <span className="meta-chip">Version · {contract.version}</span>
            <span className="meta-chip">Source · {contract.source}</span>
          </div>
        </div>
        <div className="review-hero-score">
          <RiskGauge score={review.riskScore} level={review.riskLevel} />
        </div>
      </section>

      <div className="ai-advisory" role="note">
        <IconShield />
        <div><b>{exampleReview ? 'Illustrative review' : metadataReview ? 'Document review is not available yet' : 'AI is advisory, not dispositive.'}</b><span>{exampleReview ? 'These are built-in example findings. They are not a live AI assessment of an uploaded agreement.' : metadataReview ? 'This overview uses contract metadata. Link an extracted agreement for a document-based assessment.' : 'Findings must be checked against the linked agreement by counsel before approval or signature.'}</span></div>
        <span className="ai-model"><IconSparkle />{review.model}</span>
      </div>

      <ReviewSections deviations={review.deviations.length} />

      <div className="review-layout">
        <section className="card review-document" id="document">
          <div className="card-head review-doc-head">
            <div><b>{contract.title}</b><span className="id">{contract.id} · {review.clausesParsed} clauses parsed</span></div>
            <span className="ai-tag"><IconSparkle />{reviewBasis}</span>
          </div>
          <div className="doc review-doc-body">
            {review.clauses.length === 0 && (
              <div className="state-card compact-state">
                <IconDoc />
                <b>No clause-level findings are available yet.</b>
                <p>Link an OCR/extracted contract document to this record and run the review again.</p>
              </div>
            )}
            {review.clauses.map((c) => (
              <article className="clause-block" key={c.id}>
                <div className="clause-heading-row">
                  <h5>{c.clauseNo}. {c.heading}</h5>
                  <span className={`badge ${c.risk === 'medium' ? 'med' : c.risk}`}>{c.risk}</span>
                </div>
                <p><span className={`clause ${c.risk}`}>{c.excerpt}<sup>{c.pin}</sup></span></p>
              </article>
            ))}
          </div>
        </section>

          <section className="card card-pad" id="terms">
            <div className="section-kicker">{exampleReview ? 'Example key terms' : metadataReview ? 'Contract metadata' : 'AI-extracted key terms'}</div>
            <p className="section-summary">{review.summary}</p>
            <div className="kv premium-kv">
              {review.extractedTerms.map((t) => (
                <div key={t.key}>
                  <div className="k">{t.key}</div>
                  <div className={`v${t.flagged ? ' flag' : ''}`}>{t.value}{t.flagged ? ' ⚑' : ''}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="card card-pad" id="deviations">
            <div className="section-title-row"><div><div className="section-kicker">Playbook deviations</div><h3>{review.deviations.length ? `${review.deviations.length} item${review.deviations.length === 1 ? '' : 's'} need attention` : 'No deviations found'}</h3></div><span className="ai-tag">AI</span></div>
            {review.deviations.length > 0 ? review.deviations.map((d) => <DeviationCard key={d.id} d={d} />) : <p className="section-summary">No material deviations were returned for this agreement.</p>}
          </section>

          <section className="card" id="approval">
            <div className="card-head"><div><b>Approval routing</b><span className="id">Outlook · controlled decision path</span></div><span className="ai-tag">Graph</span></div>
            <ApproveBar contractId={contract.id} />
          </section>
      </div>

      <p className="page-note">Verify the source agreement, review findings and approval authority before making a legal decision.</p>
    </>
  );
}
