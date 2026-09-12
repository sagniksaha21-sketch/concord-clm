'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { ClientRequestList, ClientRequestOptions } from '@concord/shared';
import { getClientRequests, getRequestOptions } from '@/app/lib/api';
import { errorMessage, REQUEST_STATUSES, RequestCard, RequestEmpty, RequestError, RequestHeader, RequestLoading } from '@/components/RequestUI';
import { IconPlus } from '@/components/icons';

export default function RequestsPage() {
  const [data, setData] = useState<ClientRequestList>();
  const [options, setOptions] = useState<ClientRequestOptions>();
  const [view, setView] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const [result, opts] = await Promise.all([getClientRequests(view), getRequestOptions()]); setData(result); setOptions(opts); }
    catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }, [view]);
  useEffect(() => { void load(); }, [load]);
  const filtered = data?.items.filter(item => (!status || item.status === status) && `${item.title} ${item.counterparty} ${item.businessUnit} ${item.id} ${item.assignedLegal.name}`.toLowerCase().includes(query.toLowerCase().trim())) ?? [];
  return <div className="req-page">
    <RequestHeader title={options?.canManage ? 'Every request. A clear next step.' : 'Your agreements, in good hands.'} description="Share your terms with Legal, choose who you want to work with and follow each request from one place." action={<Link className="btn btn-gold" href="/requests/new"><IconPlus />Request an agreement</Link>} />
    <div className="req-toolbar"><label className="req-field">Find a request<input type="search" placeholder="Title, counterparty or request number" value={query} onChange={e => setQuery(e.target.value)} /></label><label className="req-field">Status<select value={status} onChange={e => setStatus(e.target.value)}><option value="">Every status</option>{Object.entries(REQUEST_STATUSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>{options?.canManage && <label className="req-field">Show<select value={view} onChange={e => setView(e.target.value)}><option value="">{options.canSeeAll ? 'All client requests' : 'My workspace'}</option><option value="assigned">Assigned to me</option><option value="mine">Raised by me</option></select></label>}</div>
    {error && <RequestError message={error} retry={load} />}
    {loading ? <RequestLoading /> : !error && <><p className="req-count">{filtered.length} {filtered.length === 1 ? 'request' : 'requests'} shown{data && data.total > data.items.length ? ` · searching the latest ${data.items.length} of ${data.total}` : ''}</p>{filtered.length ? <div className="req-grid">{filtered.map(item => <RequestCard key={item.id} item={item} />)}</div> : <RequestEmpty filtered={!!query || !!status || !!view} />}</>}
    <p className="req-help">Department clients see their own requests. Assigned lawyers and legal leads can review the linked term sheets and agreements.</p>
  </div>;
}
