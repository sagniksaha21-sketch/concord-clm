import type { ReactNode } from 'react';
import { IconAlert, IconDoc } from './icons';

/** Shared presentation primitives. Data and permission decisions stay at the call site. */
export function EmptyState({ title, children, icon, action }: {
  title: string; children?: ReactNode; icon?: ReactNode; action?: ReactNode;
}) {
  return <div className="workspace-empty">
    <span className="empty-symbol" aria-hidden="true">{icon ?? <IconDoc />}</span>
    <h3>{title}</h3>
    {children && <p>{children}</p>}
    {action && <div className="empty-action">{action}</div>}
  </div>;
}

export function LoadingState({ label = 'Loading workspace', compact = false }: { label?: string; compact?: boolean }) {
  return <div className={`workspace-loading${compact ? ' is-compact' : ''}`} role="status" aria-label={label}>
    <span className="sr-only">{label}</span>
    <div aria-hidden="true" className="loading-lines">
      <div className="skeleton sk-row w-70" />
      <div className="skeleton sk-row w-90" />
      <div className="skeleton sk-row w-45" />
    </div>
  </div>;
}

export function ErrorState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="workspace-error" role="alert">
    <IconAlert /><div><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>
  </div>;
}
