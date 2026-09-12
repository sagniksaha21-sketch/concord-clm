'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { InboxResult } from '@concord/shared';
import { getInbox, readInbox } from '@/app/lib/api';
import { errorMessage, OutlookStatus, requestDate, RequestError, RequestHeader, RequestLoading } from '@/components/RequestUI';
import { IconBell } from '@/components/icons';
export default function InboxPage() {
  const [data, setData] = useState<InboxResult>(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setError(''); try { setData(await getInbox()); } catch (e) { setError(errorMessage(e)); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function mark(id?: string) { if (busy) return; setBusy(true); try { await readInbox(id); await load(); window.dispatchEvent(new Event('concord:inbox')); } catch(e) { setError(errorMessage(e)); } finally { setBusy(false); } }
  return <div className="req-page"><RequestHeader kicker="Your workspace" title="Your inbox" description={data ? `${data.unreadCount} unread ${data.unreadCount === 1 ? 'notification' : 'notifications'}. Agreement requests and client updates, addressed to you.` : 'Agreement requests and client updates, addressed to you.'} action={<button className="btn" disabled={busy || !data?.unreadCount} onClick={() => void mark()}>Mark all as read</button>} />{error && <RequestError message={error} retry={load} />}{!data && !error ? <RequestLoading /> : data && <>{data.items.length ? <section className="req-panel req-inbox-list" aria-label="Your notifications">{data.items.map(item => <article key={item.id} className={`req-inbox-item${item.readAt ? '' : ' unread'}`}><div className="req-card-top"><span className="req-id">{requestDate(item.createdAt)} · {item.requestId}{!item.readAt ? ' · Unread' : ''}</span>{item.emailStatus !== 'not-requested' && <OutlookStatus status={item.emailStatus} />}</div><h3>{item.title}</h3><p>{item.body}</p><div className="req-inline"><Link className="btn btn-gold" href={`/requests/${item.requestId}`}>Open request →</Link>{!item.readAt && <button className="btn" disabled={busy} onClick={() => void mark(item.id)}>Mark as read<span className="sr-only">: {item.title}</span></button>}</div></article>)}</section> : <div className="req-empty"><IconBell /><h3>You’re all caught up</h3><p>New assignments and updates to your requests will appear here.</p><Link href="/requests" className="btn">View agreement requests</Link></div>}<p className="req-help">Showing your latest {data.items.length} notifications. Only notifications addressed to your account are shown.</p></>}</div>;
}
