
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getPermissions } from '@/app/lib/api';
export default function ContractsNavigation() {
  const path = usePathname(); const [upload,setUpload] = useState(false);
  useEffect(() => { getPermissions().then(p => setUpload(p.permissions.includes('ingest:write'))).catch(() => undefined); }, []);
  return <nav className="contracts-navigation" aria-label="Contracts"><Link href="/repository" aria-current={path === '/repository' ? 'page' : undefined}>Repository & search</Link><Link href="/templates" aria-current={path === '/templates' ? 'page' : undefined}>Templates & clauses</Link>{upload && <Link href="/ingest" aria-current={path === '/ingest' ? 'page' : undefined}>Upload agreements</Link>}</nav>;
}
