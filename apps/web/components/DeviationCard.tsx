import type { Deviation } from '@concord/shared';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function DeviationCard({ d }: { d: Deviation }) {
  return (
    <div className="dev">
      <div className="dev-top">
        <span className="dev-title">
          {d.clauseNo} · {d.title}
        </span>
        <span className={`badge ${d.severity}`}>
          <span className="d" />
          {cap(d.severity)}
        </span>
      </div>
      <div className="dev-desc">{d.description}</div>
      {d.redline && (
        <div className="diff">
          <div className="d-del">
            <span className="d-lab">Their draft</span>
            <s>{d.redline.original}</s>
          </div>
          <div className="d-ins">
            <span className="d-lab">Suggested redline</span>
            {d.redline.suggested}
          </div>
        </div>
      )}
      <div style={{ marginTop: 11 }}>
        <button className="btn btn-gold" style={{ fontSize: 12, padding: '7px 12px' }}>
          {d.actionLabel}
        </button>
      </div>
    </div>
  );
}
