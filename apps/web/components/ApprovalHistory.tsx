import { AgreementWorkspace } from '@concord/shared';
import { requestDate } from './RequestUI';
export default function ApprovalHistory({ rounds }: { rounds: NonNullable<AgreementWorkspace['approvalHistory']> }) {
  if (!rounds.length) return null;
  return <section className="card card-pad"><h3>Previous approval rounds</h3>{rounds.map(r => <details className="workflow-disclosure" key={r.id}><summary>{r.version} · {r.decision.replaceAll('-', ' ')}<span>{requestDate(r.archivedAt)}</span></summary><ol className="approval-timeline">{r.steps.map((s,i) => <li key={i}><b>{s.approverName}</b><span>{s.decision.replaceAll('-', ' ')}</span>{s.comment && <p>{s.comment}</p>}</li>)}</ol><p className="req-help">Preserved approval evidence checksum</p><code className="integrity-hash">{r.evidenceSha256}</code></details>)}</section>;
}
