'use client';

import { useEffect, useId, useRef } from 'react';

export default function ConfirmDialog({ title, description, confirmLabel, busy, onConfirm, onClose }: {
  title: string; description: string; confirmLabel: string; busy?: boolean;
  onConfirm: () => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => { dialog?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="confirm-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`}
    onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }}
    onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <div className="confirm-body">
      <span className="section-kicker">Template library</span>
      <h2 id={`${id}-title`}>{title}</h2>
      <p id={`${id}-body`}>{description}</p>
      <div className="view-actions">
        <button className="btn" autoFocus disabled={busy} onClick={onClose}>Keep template</button>
        <button className="btn btn-danger" disabled={busy} onClick={onConfirm}>{busy ? 'Deleting…' : confirmLabel}</button>
      </div>
    </div>
  </dialog>;
}
