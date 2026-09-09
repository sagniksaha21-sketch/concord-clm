'use client';

import { useState } from 'react';
import type { Deviation } from '@concord/shared';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function DeviationCard({ d }: { d: Deviation }) {
  const [feedback, setFeedback] = useState('');

  async function copySuggestion() {
    if (!d.redline) return;
    try {
      await navigator.clipboard.writeText(d.redline.suggested);
      setFeedback('Suggested language copied.');
    } catch {
      setFeedback('Copy unavailable. Select the suggested language above to copy it.');
    }
  }

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
      <div className="deviation-action">
        <span className="page-note">Suggested action: {d.actionLabel}</span>
        {d.redline && <button className="btn btn-ghost btn-sm" onClick={copySuggestion}>Copy suggested language</button>}
        {feedback && <span className="page-note" role="status">{feedback}</span>}
      </div>
    </div>
  );
}
