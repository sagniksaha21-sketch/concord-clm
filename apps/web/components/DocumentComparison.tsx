import { compareSections, DraftSection } from '@concord/shared';
export default function DocumentComparison({ before, after, onRestore }: { before: DraftSection[]; after: DraftSection[]; onRestore?: (id: string) => void }) {
  const changes = compareSections(before, after);
  return <div className="document-comparison"><p className="req-help">{changes.length ? `${changes.length} clause changes. Review both versions before proceeding.` : 'No clause changes.'}</p>{changes.map(change => <section key={change.id} className="comparison-change"><header><b>{change.heading}</b><span className="badge neutral">{change.kind}</span></header><div className="comparison-columns"><div><small>Previous language</small><p>{change.before || 'No previous language'}</p></div><div><small>Proposed language</small><p>{change.after || 'Clause removed'}</p></div></div>{onRestore && <button className="btn" onClick={() => onRestore(change.id)}>Restore previous language</button>}</section>)}</div>;
}
