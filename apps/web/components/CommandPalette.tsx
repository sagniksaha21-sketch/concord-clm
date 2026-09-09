'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { search as searchApi } from '@/app/lib/api';
import type { SearchHit } from '@concord/shared';
import {
  IconArrowRight,
  IconBox,
  IconCalendar,
  IconCommand,
  IconDoc,
  IconFlow,
  IconGrid,
  IconInbox,
  IconSearch,
  IconShield,
  IconSign,
  IconSparkle,
  IconUpload,
} from '@/components/icons';

export type PaletteCommand = {
  href: string;
  label: string;
  description?: string;
  group?: string;
};

type PaletteRow = {
  key: string;
  section: string;
  href: string;
  title: string;
  subtitle: string;
  badge?: string;
  badgeTone?: string;
  kind: 'command' | 'search';
};

const GROUP_LABEL: Record<string, string> = {
  contract: 'Contracts',
  template: 'Templates',
  clause: 'Clauses',
  intake: 'Intake requests',
  document: 'Ingested documents',
  signature: 'Signature requests',
  obligation: 'Obligations & renewals',
};

const QUICK_ORDER = ['/intake', '/authoring', '/review', '/repository', '/ingest', '/esign'];

const DEFAULT_DESCRIPTIONS: Record<string, string> = {
  '/': 'Portfolio overview, risk and work queues',
  '/intake': 'Capture a new legal request',
  '/pipeline': 'Move work through the contract lifecycle',
  '/review': 'Open the AI-assisted review queue',
  '/authoring': 'Draft from approved language and templates',
  '/templates': 'Browse approved legal templates',
  '/ingest': 'Upload and extract agreement documents',
  '/repository': 'Search the portfolio or ask Concord AI',
  '/obligations': 'Track commitments, renewals and deadlines',
  '/esign': 'Prepare signature and e-stamp workflows',
  '/notifications': 'Review legal workflow notifications',
  '/audit': 'Inspect immutable lifecycle evidence',
};

function Glyph({ href }: { href: string }) {
  if (href === '/') return <IconGrid />;
  if (href.startsWith('/intake')) return <IconInbox />;
  if (href.startsWith('/pipeline')) return <IconFlow />;
  if (href.startsWith('/review')) return <IconSparkle />;
  if (href.startsWith('/authoring') || href.startsWith('/templates')) return <IconDoc />;
  if (href.startsWith('/ingest')) return <IconUpload />;
  if (href.startsWith('/repository')) return <IconBox />;
  if (href.startsWith('/obligations')) return <IconCalendar />;
  if (href.startsWith('/esign')) return <IconSign />;
  if (href.startsWith('/audit')) return <IconShield />;
  return <IconCommand />;
}

/**
 * Concord's command centre.
 *
 * Empty state = recent destinations + permission-filtered quick actions.
 * Query state = local navigation matches immediately, followed by server-side
 * portfolio search. That makes Cmd/Ctrl-K useful even before the search API
 * responds, while preserving server authorization for contract data.
 */
export default function CommandPalette({
  onClose,
  commands,
}: {
  onClose: () => void;
  commands: PaletteCommand[];
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    inputRef.current?.focus();
    try {
      const raw = localStorage.getItem('concord_recent_routes');
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) setRecent(parsed.filter((x): x is string => typeof x === 'string'));
    } catch {
      /* optional convenience only */
    }
    return () => {
      document.body.style.overflow = previousOverflow;
      requestAnimationFrame(() => {
        if (previousFocus?.isConnected) previousFocus.focus();
      });
    };
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      setErr('');
      setBusy(false);
      return;
    }
    let cancelled = false;
    setBusy(true);
    const t = setTimeout(() => {
      searchApi(term)
        .then((r) => {
          if (cancelled) return;
          setHits(r.hits);
          setErr('');
        })
        .catch((e) => {
          if (!cancelled) setErr(e instanceof Error ? e.message : 'Search failed');
        })
        .finally(() => {
          if (!cancelled) setBusy(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const rows = useMemo<PaletteRow[]>(() => {
    const term = q.trim().toLowerCase();
    const out: PaletteRow[] = [];

    if (term.length < 2) {
      const recentCommands = recent
        .map((href) => commands.find((c) => c.href === href))
        .filter((c): c is PaletteCommand => Boolean(c))
        .slice(0, 4);
      for (const c of recentCommands) {
        out.push({
          key: `recent:${c.href}`,
          section: 'Recent',
          href: c.href,
          title: c.label,
          subtitle: c.description ?? DEFAULT_DESCRIPTIONS[c.href] ?? 'Open workspace',
          kind: 'command',
        });
      }

      for (const href of QUICK_ORDER) {
        const c = commands.find((item) => item.href === href);
        if (!c) continue;
        out.push({
          key: `quick:${c.href}`,
          section: 'Quick actions',
          href: c.href,
          title: c.label,
          subtitle: c.description ?? DEFAULT_DESCRIPTIONS[c.href] ?? 'Open workspace',
          badge: 'Open',
          badgeTone: 'neutral',
          kind: 'command',
        });
      }

      for (const c of commands) {
        if (recentCommands.some((r) => r.href === c.href) || QUICK_ORDER.includes(c.href)) continue;
        out.push({
          key: `nav:${c.href}`,
          section: c.group ?? 'Navigate',
          href: c.href,
          title: c.label,
          subtitle: c.description ?? DEFAULT_DESCRIPTIONS[c.href] ?? 'Open workspace',
          kind: 'command',
        });
      }
      return out;
    }

    for (const c of commands) {
      const hay = `${c.label} ${c.description ?? ''} ${DEFAULT_DESCRIPTIONS[c.href] ?? ''}`.toLowerCase();
      if (!hay.includes(term)) continue;
      out.push({
        key: `navmatch:${c.href}`,
        section: 'Navigate',
        href: c.href,
        title: c.label,
        subtitle: c.description ?? DEFAULT_DESCRIPTIONS[c.href] ?? 'Open workspace',
        badge: 'Go',
        badgeTone: 'neutral',
        kind: 'command',
      });
    }

    for (const h of hits) {
      if (!h.href) continue;
      out.push({
        key: `hit:${h.kind}:${h.id}`,
        section: GROUP_LABEL[h.kind] ?? h.kind,
        href: h.href,
        title: h.title,
        subtitle: h.subtitle,
        badge: h.badge,
        badgeTone: h.badgeTone,
        kind: 'search',
      });
    }
    return out;
  }, [commands, hits, q, recent]);

  const sections = useMemo(() => {
    const out: Array<{ label: string; items: PaletteRow[] }> = [];
    for (const row of rows) {
      const existing = out.find((x) => x.label === row.section);
      if (existing) existing.items.push(row);
      else out.push({ label: row.section, items: [row] });
    }
    return out;
  }, [rows]);

  // Search hits can arrive in mixed categories; keyboard order follows the
  // grouped list the user actually sees.
  const displayedRows = useMemo(() => sections.flatMap((section) => section.items), [sections]);

  useEffect(() => {
    if (document.activeElement === inputRef.current) {
      resultsRef.current?.querySelector<HTMLElement>('.is-sel')?.scrollIntoView({ block: 'nearest' });
    }
  }, [sel, displayedRows]);

  useEffect(() => {
    setSel(0);
  }, [q]);

  useEffect(() => {
    if (sel >= rows.length) setSel(Math.max(rows.length - 1, 0));
  }, [rows.length, sel]);

  function go(row: PaletteRow) {
    onClose();
    router.push(row.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') return onClose();
    if (e.key === 'Tab') {
      const focusable = Array.from(
        e.currentTarget.querySelectorAll<HTMLElement>('input,button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])'),
      ).filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
      return;
    }
    // Tabbed buttons keep their native Enter/Space behavior.
    if (e.target !== inputRef.current) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => rows.length ? (s + 1) % rows.length : 0);
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => rows.length ? (s - 1 + rows.length) % rows.length : 0);
    }
    if (e.key === 'Enter' && displayedRows[sel]) {
      e.preventDefault();
      go(displayedRows[sel]);
    }
  }

  let index = -1;
  const searching = q.trim().length >= 2;

  return (
    <div
      className="palette-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Search and navigate Concord"
    >
      <div className="palette palette-premium" onKeyDown={onKeyDown}>
        <div className="palette-input palette-input-premium">
          <span className="palette-search-glyph"><IconSearch /></span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search or jump to anything…"
            aria-label="Search or jump to anything"
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-controls="concord-command-results"
            aria-activedescendant={displayedRows[sel] ? `concord-command-result-${sel}` : undefined}
            autoComplete="off"
            aria-describedby="command-keyboard-hint"
          />
          {busy && <span className="palette-live" role="status"><i />Searching</span>}
          <button className="palette-close" onClick={onClose} aria-label="Close search">×</button>
        </div>

        {!searching && (
          <div className="palette-hintbar">
            <span><IconCommand /> Command centre</span>
            <span>Type a contract, counterparty or destination</span>
          </div>
        )}

        <div className="palette-results palette-results-premium" ref={resultsRef} id="concord-command-results" role="listbox" aria-label="Search results and destinations" aria-busy={busy}>
          {err && <div className="palette-error">{err}</div>}
          {!err && searching && !busy && !rows.length && (
            <div className="empty palette-empty">
              <span className="e-ico">⌕</span>
              No matches for “{q.trim()}”.
              <small>Try a contract title, counterparty, obligation or workspace name.</small>
            </div>
          )}

          {sections.map((section) => (
            <div className="palette-section" key={section.label} role="group" aria-label={section.label}>
              <div className="palette-group">{section.label}</div>
              {section.items.map((row) => {
                index += 1;
                const mine = index;
                return (
                  <button
                    key={row.key}
                    id={`concord-command-result-${mine}`}
                    role="option"
                    aria-selected={mine === sel}
                    className={`palette-item palette-item-premium${mine === sel ? ' is-sel' : ''}`}
                    onFocus={() => setSel(mine)}
                    onMouseEnter={() => setSel(mine)}
                    onClick={() => go(row)}
                  >
                    <span className="palette-row-icon"><Glyph href={row.href} /></span>
                    <span className="pi-main">
                      <span className="pi-title">{row.title}</span>
                      <span className="pi-sub">{row.subtitle}</span>
                    </span>
                    {row.badge ? <span className={`badge ${row.badgeTone ?? 'neutral'}`}>{row.badge}</span> : null}
                    <IconArrowRight className="palette-arrow" />
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="palette-foot palette-foot-premium" id="command-keyboard-hint">
          <span><span className="kbd">↑↓</span> navigate</span>
          <span><span className="kbd">↵</span> open</span>
          <span><span className="kbd">/</span> search</span>
          <span className="palette-foot-right">Concord · permission-aware search</span>
        </div>
      </div>
    </div>
  );
}
