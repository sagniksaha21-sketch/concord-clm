'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAuditPage, verifyAudit } from '@/app/lib/api';
import type { AuditPage, AuditVerifyResult } from '@/app/lib/api';
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
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (off: number, action: string) => {
      setBusy(true);
      setErr('');
      try {
        setPage(await getAuditPage({ limit: PAGE, offset: off, action }));
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed to load');
        setPage(null);
      } finally {
        setBusy(false);
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
          <h2>Audit trail</h2>
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
            {page ? `${page.offset + 1}–${page.offset + page.count} of ${page.total}` : ''}
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

        {err && <div className="empty">{err}</div>}
        {!err && busy && !page && <div className="empty">Loading…</div>}
        {page && !page.events.length && <div className="empty">No events match.</div>}

        {page && page.events.length > 0 && (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Seq</th><th>When</th><th>Action</th><th>Actor</th><th>Summary</th><th>Hash</th></tr>
              </thead>
              <tbody>
                {page.events.map((e) => (
                  <tr key={e.id}>
                    <td className="t-id">{e.seq}</td>
                    <td className="t-id">{new Date(e.at).toLocaleString()}</td>
                    <td><span className="badge neutral">{e.action}</span></td>
                    <td className="t-id">{e.actor?.email ?? '—'}</td>
                    <td style={{ maxWidth: 420 }}>{e.summary}</td>
                    <td className="t-id" title={e.hash}>{e.hash.slice(0, 10)}…</td>
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
