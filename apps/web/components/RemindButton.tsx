'use client';

import { useState } from 'react';
import type { NotificationResult } from '@concord/shared';
import { remindObligation } from '@/app/lib/api';

export default function RemindButton({ id }: { id: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>(
    'idle',
  );
  const [res, setRes] = useState<NotificationResult | null>(null);

  async function remind() {
    setState('sending');
    try {
      // Via the API client — a bare fetch() sent no Authorization header and
      // this route carries @Roles('contract:write'), so it answered 401.
      setRes(await remindObligation(id));
      setState('done');
    } catch {
      setState('error');
    }
  }

  const label =
    state === 'sending'
      ? 'Sending…'
      : state === 'done'
        ? res?.dryRun
          ? 'Drafted ✓'
          : 'Sent ✓'
        : state === 'error'
          ? 'Retry'
          : 'Remind via Outlook';

  return (
    <button
      className="btn"
      onClick={remind}
      disabled={state === 'sending'}
      style={{ padding: '6px 11px', fontSize: 12 }}
      title="Fire an Outlook reminder via Microsoft Graph"
    >
      {label}
    </button>
  );
}
