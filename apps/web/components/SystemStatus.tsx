'use client';

import { useEffect, useState } from 'react';
import { getHealthReady } from '@/app/lib/api';
import { IconCheck, IconAlert } from '@/components/icons';

type State = 'checking' | 'ready' | 'degraded' | 'offline';

export default function SystemStatus() {
  const [state, setState] = useState<State>('checking');
  const [detail, setDetail] = useState('Checking platform status');

  useEffect(() => {
    let live = true;
    const check = () => {
      getHealthReady()
        .then((r) => {
          if (!live) return;
          if (r.status === 'ready') {
            setState('ready');
            setDetail('Platform readiness check passed');
          } else {
            setState('degraded');
            setDetail(r.degradedModes[0] ?? 'A required integration needs attention');
          }
        })
        .catch(() => {
          if (!live) return;
          setState('offline');
          setDetail('Platform status could not be verified');
        });
    };
    check();
    const id = window.setInterval(check, 60_000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, []);

  const ok = state === 'ready';
  return (
    <span className={`system-status ${state}`} title={detail} aria-label={`System status: ${detail}`}>
      <span className="system-status-dot">{ok ? <IconCheck /> : state === 'checking' ? null : <IconAlert />}</span>
      <span className="system-status-label">
        {state === 'checking' ? 'Checking' : ok ? 'Services available' : state === 'degraded' ? 'Degraded' : 'Offline'}
      </span>
    </span>
  );
}
