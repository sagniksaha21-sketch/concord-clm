import { LIFECYCLE } from '@concord/shared';
export default function LifecycleRail({ stage, requestor = false, waiting = false, executed = false }: { stage: string; requestor?: boolean; waiting?: boolean; executed?: boolean }) {
  const steps = requestor ? [['intake','Submitted'],['assigned','Assigned'],['drafting','Drafting'],['review','Business input'],['approval','Approval'],['signature','Signature'],['active','Completed']] : LIFECYCLE;
  const active = requestor && waiting ? 3 : requestor && stage === 'intake' ? 1 : steps.findIndex(s => s[0] === (stage === 'renewal' ? 'active' : stage));
  return <ol className={`lifecycle-rail${requestor ? ' client-lifecycle' : ''}`} aria-label="Agreement lifecycle">{steps.map(([key, label], i) => <li key={key} className={i < active || (executed && i === active) ? 'is-complete' : i === active ? 'is-current' : ''} aria-current={i === active ? 'step' : undefined}><span aria-hidden="true">{i < active || (executed && i === active) ? '✓' : i + 1}</span><b>{label}</b></li>)}</ol>;
}
