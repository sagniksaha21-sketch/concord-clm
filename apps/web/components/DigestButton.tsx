'use client';

import { useState } from 'react';
import type { DigestResult } from '@concord/shared';
import { sendObligationsDigest } from '@/app/lib/api';

/**
 * Fires the scheduled obligations digest on demand — the same email the cron
 * sends weekly, dispatched now (dry-run until Microsoft Graph is configured).
 */
export default function DigestButton() {
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [res, setRes] = useState<DigestResult | null>(null);

  async function send() {
    setState('sending');
    try {
      // Via the API client — a bare fetch() sent no Authorization header and
      // this route carries @Roles('contract:write'), so it answered 401.
      setRes(await sendObligationsDigest(90));
      setState('done');
    } catch {
      setState('error');
    }
  }

  const label =
    state === 'sending'
      ? 'Sending…'
      : state === 'done'
        ? res?.notification?.dryRun
          ? `Digest drafted ✓ (${res?.count} items)`
          : `Digest sent ✓ (${res?.count} items)`
        : state === 'error'
          ? 'Retry digest'
          : '📅 Send weekly digest now';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <button
        className="btn btn-gold"
        onClick={send}
        disabled={state === 'sending'}
        title="Send the obligations & renewals digest via Microsoft Graph"
      >
        {label}
      </button>
      {state === 'done' && res?.notification && (
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {res.notification.dryRun ? 'Dry-run' : 'Sent'} → {res.notification.to.join(', ')}
        </span>
      )}
    </div>
  );
}
