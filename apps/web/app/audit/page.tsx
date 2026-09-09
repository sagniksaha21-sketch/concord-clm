'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuditPage, verifyAudit } from '@/app/lib/api';
import type { AuditPage, AuditVerifyResult } from '@/app/lib/api';
import { EmptyState, ErrorState, LoadingState } from '@/components/WorkspaceUI';
import { IconShield } from '@/components/icons';

const PAGE = 50;

/**
 * The immutable audit trail, and the attestation that it has not been altered.
 *
 * Restricted to `audit:read` (lead and admin) — the sidebar hides the entry for
 * everyone else, and the API enforces the same rule regardless.
 */
export default function AuditPage() {
  const [page, setPage] = useState<AuditPage | null>(null);
  const [verify, setVerify] = useState<AuditVerifyResult | null>(null);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(true);
  const requestId = useRef(0);

  const load = useCallback(
    async (off: number, action: string) => {
      const request = ++requestId.current;
      setBusy(true);
      setErr('');
      try {
        const result = await getAuditPage({ limit: PAGE, offset: off, action });
        if (request === requestId.current) setPage(result);
      } catch (e) {
        if (request !== requestId.current) return;
        setErr(e instanceof Error ? e.message : 'Failed to load');
        setPage(null);
      } finally {
        if (request === requestId.current) setBusy(false);
      }
    },
    [],
  );

  // The filter is bound to an input, so firing on every keystroke means one
  // request per character — nine round trips to type "approval", each one a
  // full page query against the trail, with the answers able to arrive out of
  // order. Debounced, and only the last response in flight is allowed to win.
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      if (live) load(offset, filter);
    }, filter ? 250 : 0);
    return () => {
      live = false;
      clearTimeout(t);
      requestId.current += 1;
    };
  }, [load, offset, filter]);

  // Typing a new filter must return to the first page — otherwise a search made
  // while on page 5 shows "no events" for a filter that has fewer than 250
  // matches, which reads as "nothing was recorded".
  useEffect(() => {
    setOffset(0);
  }, [filter]);

  useEffect(() => {
    let live = true;
    verifyAudit()
      .then((v) => live && setVerify(v))
      .catch(() => live && setVerify(null));
    return () => {
      live = false;
    };
  }, []);

  return (
    <>
      <div className="view-head">
        <div className="vh-left">
          <div className="eyebrow">Evidence &amp; accountability</div><h2>Audit trail</h2>
          <p>
            Append-only and hash-chained: every event carries the hash of the one before it, so an
            altered or removed entry breaks the chain. Verification recomputes it end to end.
          </p>
        </div>
      </div>

      {verify && (
        <div
          className="card card-pad"
          style={{
            marginBottom: 18,
            borderColor: verify.ok ? 'var(--low)' : 'var(--high)',
            background: verify.ok ? 'var(--low-bg)' : 'var(--high-bg)',
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
          }}
        >
          <IconShield
            style={{
              width: 20,
              height: 20,
              stroke: verify.ok ? 'var(--low)' : 'var(--high)',
              flex: 'none',
              marginTop: 1,
            }}
          />
          <div>
            <b>{verify.ok ? 'Chain intact' : 'Chain NOT verified'}</b>
            <div style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.55 }}>{verify.message}</div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h3><IconShield />Events</h3>
          <span className="ch-act">
            {page ? page.count ? `${page.offset + 1}–${page.offset + page.count} of ${page.total}` : `0 of ${page.total}` : ''}
          </span>
        </div>

        <div className="card-pad" style={{ borderBottom: '1px solid var(--line)' }}>
          <label className="fld">
            <span>Filter by action prefix (e.g. approval, esign, auth)</span>
            <input
              value={filter}
              onChange={(e) => {
                setOffset(0);
                setFilter(e.target.value);
              }}
              placeholder="all actions"
            />
          </label>
        </div>

        {err && <ErrorState title="Audit events unavailable" action={<button className="btn" onClick={() => load(offset, filter)}>Try again</button>}>{err}</ErrorState>}
        {!err && busy && !page && <LoadingState label="Loading audit events" />}
        {!busy && page && !page.events.length && <EmptyState title={filter ? "No matching events" : "No events recorded"} icon={<IconShield />} action={filter ? <button className="btn" onClick={() => setFilter('')}>Clear filter</button> : undefined}>{filter ? "Try a broader action prefix to search the audit trail." : "Recorded activity will appear here with its actor, timestamp and integrity hash."}</EmptyState>}

        {page && page.events.length > 0 && (
          <div className="tbl-wrap">
            <table className="tbl tbl-responsive" role="table" aria-label="Audit events">
              <thead role="rowgroup">
                <tr role="row"><th scope="col" role="columnheader">Seq</th><th scope="col" role="columnheader">When</th><th scope="col" role="columnheader">Action</th><th scope="col" role="columnheader">Actor</th><th scope="col" role="columnheader">Summary</th><th scope="col" role="columnheader">Hash</th></tr>
              </thead>
              <tbody role="rowgroup">
                {page.events.map((e) => (
                  <tr role="row" key={e.id}>
                    <td role="cell" data-label="Sequence" className="t-id">{e.seq}</td>
                    <td role="cell" data-label="When" className="t-id">{new Date(e.at).toLocaleString()}</td>
                    <td role="cell" data-label="Action"><span className="badge neutral">{e.action}</span></td>
                    <td role="cell" data-label="Actor" className="t-id">{e.actor?.email ?? '—'}</td>
                    <td role="cell" data-label="Summary" style={{ maxWidth: 420 }}>{e.summary}</td>
                    <td role="cell" data-label="Hash" className="t-id" title={e.hash}>{e.hash.slice(0, 10)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {page && page.total > PAGE && (
          <div className="card-pad" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              className="btn btn-sm"
              disabled={busy || offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE))}
            >
              ← Newer
            </button>
            <button
              className="btn btn-sm"
              disabled={busy || offset + PAGE >= page.total}
              onClick={() => setOffset(offset + PAGE)}
            >
              Older →
            </button>
          </div>
        )}
      </div>
    </>
  );
}
