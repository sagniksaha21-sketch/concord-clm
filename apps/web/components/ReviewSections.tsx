'use client';

import { useEffect, useState } from 'react';
import { IconDoc } from './icons';

export default function ReviewSections({ deviations, canRouteApproval = false }: { deviations: number; canRouteApproval?: boolean }) {
  const [active, setActive] = useState('document');
  useEffect(() => {
    const sync = () => setActive(window.location.hash.slice(1) || 'document');
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  return <nav className="section-tabs" aria-label="Review sections">
    {[
      { id: 'document', label: 'Contract findings' },
      { id: 'terms', label: 'Key terms' },
      { id: 'deviations', label: 'Playbook deviations' },
      ...(canRouteApproval ? [{ id: 'approval', label: 'Approval' }] : []),
    ].map((item) => <a key={item.id} href={`#${item.id}`} aria-current={active === item.id ? 'location' : undefined}
      onClick={() => setActive(item.id)}>
      {item.id === 'document' && <IconDoc />}{item.label}{item.id === 'deviations' && <span>{deviations}</span>}
    </a>)}
  </nav>;
}
