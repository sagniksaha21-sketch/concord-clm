'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ROLE_LABELS, normalizeRole, requestReturnPath } from '@concord/shared';
import type { Permission, Role } from '@concord/shared';
import { getMe, getInboxCount, getPermissions, logout as apiLogout } from '@/app/lib/api';
import CommandPalette, { type PaletteCommand } from '@/components/CommandPalette';
import XcelerateSplash from '@/components/XcelerateSplash';
import SystemStatus from '@/components/SystemStatus';
import { ConcordText, ConcordWordmark } from '@/components/ConcordBrand';
import {
  IconAlert,
  IconBell,
  IconChevronDown,
  IconChevronLeft,
  IconInbox,
  IconLogout,
  IconMenu,
  IconMonitor,
  IconMoon,
  IconMore,
  IconPanelLeft,
  IconPlus,
  IconSearch,
  IconSun,
  IconUpload,
} from '@/components/icons';

import { NAV, NAV_GROUPS, PRIMARY_NAV, navIsActive } from '@/components/workspace-navigation';

type Appearance = 'system' | 'light' | 'dark';

const BARE = ['/login'];
const PRIMARY_MOBILE = ['/', '/requests', '/pipeline', '/inbox'];

function titleFor(path: string): { eyebrow: string; title: string } {
  if (path.startsWith('/contracts/')) return { eyebrow: 'Legal workspace', title: 'Agreement overview' };
  if (path === '/workspace') return { eyebrow: 'Workspace', title: 'Tools & settings' };
  const entry = [...NAV].filter((n) => n.match !== '/').find((n) => path.startsWith(n.match));
  if (entry) return { eyebrow: ({ work: 'Legal workspace', library: 'Knowledge', execute: 'Execution', governance: 'Governance' })[entry.group], title: entry.label };
  return { eyebrow: 'Workspace', title: 'Command Center' };
}

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

function trapDialogTab(e: React.KeyboardEvent<HTMLElement>) {
  if (e.key !== 'Tab') return;
  const focusable = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'),
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
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname() || '/';
  const router = useRouter();
  const bare = BARE.some((p) => path.startsWith(p));

  const [who, setWho] = useState<{ name: string; role: Role; roleLabel: string } | null>(null);
  const [perms, setPerms] = useState<Permission[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [appearance, setAppearance] = useState<Appearance>('system');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const quickRef = useRef<HTMLDetailsElement>(null);
  const accountRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (bare) return;
    const close = (event: PointerEvent | KeyboardEvent) => {
      for (const ref of [quickRef, accountRef]) {
        const el = ref.current;
        if (!el?.open) continue;
        const escape = event instanceof KeyboardEvent && event.key === 'Escape';
        const outside = event instanceof PointerEvent && (!el.contains(event.target as Node) || event.target === el);
        if (escape || outside) {
          el.open = false;
          if (escape) el.querySelector('summary')?.focus();
        }
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close); };
  }, [bare]);

  useEffect(() => {
    if (!mobileMoreOpen && !paletteOpen) return;
    const background = Array.from(document.querySelectorAll<HTMLElement>('.app-main, .sidebar, .mobile-nav'));
    background.forEach((el) => { el.inert = true; });
    return () => { background.forEach((el) => { el.inert = false; }); };
  }, [mobileMoreOpen, paletteOpen]);

  useEffect(() => {
    if (bare) return;
    let live = true;
    getMe()
      .then((u) => {
        if (!live) return;
        const role = normalizeRole(u.role);
        if (role === 'requester' && !requestReturnPath(path)) router.replace('/requests');
        setWho({ name: u.name?.trim() || u.email || 'Signed in', role, roleLabel: ROLE_LABELS[role] });
      })
      .catch(() => live && setWho(null));
    getPermissions()
      .then((p) => live && setPerms(p.permissions))
      .catch(() => live && setPerms(null));
    return () => {
      live = false;
    };
  }, [bare, path, router]);

  useEffect(() => {
    if (bare) return;
    let live = true;
    const refresh = () => { if (!document.hidden) getInboxCount().then(r => live && setUnread(r.unreadCount)).catch(() => undefined); };
    refresh();
    const timer = setInterval(refresh, 30_000);
    window.addEventListener('concord:inbox', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { live = false; clearInterval(timer); window.removeEventListener('concord:inbox', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [bare, path]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('concord_theme');
      if (stored === 'light' || stored === 'dark' || stored === 'system') setAppearance(stored);
      const compact = localStorage.getItem('concord_sidebar_collapsed');
      setSidebarCollapsed(compact === '1');
    } catch {
      /* preferences are optional */
    }
  }, []);

  useEffect(() => {
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const sync = () => {
      const resolved: 'light' | 'dark' = appearance === 'system' ? (mq?.matches ? 'dark' : 'light') : appearance;
      setTheme(resolved);
      if (appearance === 'system') document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', appearance);
    };
    sync();
    mq?.addEventListener?.('change', sync);
    return () => mq?.removeEventListener?.('change', sync);
  }, [appearance]);

  const chooseAppearance = useCallback((next: Appearance) => {
    setAppearance(next);
    try {
      localStorage.setItem('concord_theme', next);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    chooseAppearance(theme === 'dark' ? 'light' : 'dark');
  }, [chooseAppearance, theme]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem('concord_sidebar_collapsed', next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const closeMobileMore = useCallback(() => {
    setMobileMoreOpen(false);
    requestAnimationFrame(() => moreButtonRef.current?.focus());
  }, []);

  useEffect(() => {
    if (bare) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isEditableTarget(e.target)) {
        e.preventDefault();
        setPaletteOpen(true);
      }
      if (e.key === 'Escape') {
        if (mobileMoreOpen) closeMobileMore();
        setMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bare, closeMobileMore, mobileMoreOpen]);

  useEffect(() => {
    if (!mobileMoreOpen) return;
    const previous = document.body.style.overflow;
    requestAnimationFrame(() => sheetRef.current?.querySelector<HTMLElement>('.sheet-close')?.focus());
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileMoreOpen]);

  useEffect(() => {
    setMenuOpen(false);
    setMobileMoreOpen(false);
    if (bare) return;
    try {
      const raw = localStorage.getItem('concord_recent_routes');
      const previous = raw ? JSON.parse(raw) : [];
      const recent = Array.isArray(previous) ? previous.filter((x): x is string => typeof x === 'string') : [];
      localStorage.setItem('concord_recent_routes', JSON.stringify([path, ...recent.filter((x) => x !== path)].slice(0, 6)));
    } catch {
      /* optional convenience only */
    }
  }, [bare, path]);

  const visible = useMemo(
    () => NAV.filter((n) => !n.needs || (perms !== null && perms.includes(n.needs))),
    [perms],
  );

  const paletteCommands = useMemo<PaletteCommand[]>(
    () => [...visible.map((n) => ({ href: n.href, label: n.label, description: n.description, group: 'Navigate' })), ...(perms?.includes('request:write') ? [{ href: '/requests/new', label: 'Request an agreement', description: 'Fill a term sheet and choose your lawyer', group: 'Start work' }] : [])],
    [visible, perms],
  );

  const logout = useCallback(() => {
    try {
      localStorage.removeItem('concord_user');
    } catch {
      /* ignore */
    }
    apiLogout().catch(() => undefined).finally(() => router.push('/login'));
  }, [router]);

  const appearanceButtons = <>
    <button type="button" title="Use system appearance" aria-pressed={appearance === 'system'} onClick={() => chooseAppearance('system')}><IconMonitor /><span>System</span></button>
    <button type="button" title="Use light appearance" aria-pressed={appearance === 'light'} onClick={() => chooseAppearance('light')}><IconSun /><span>Light</span></button>
    <button type="button" title="Use dark appearance" aria-pressed={appearance === 'dark'} onClick={() => chooseAppearance('dark')}><IconMoon /><span>Dark</span></button>
  </>;

  if (bare) return <>
    <div className="login-appearance appearance-switch" role="group" aria-label="Appearance">{appearanceButtons}</div>
    {children}
  </>;

  const { eyebrow, title } = titleFor(path);
  const initials =
    (who?.name ?? '')
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'CC';

  const groups = NAV_GROUPS;
  const primaryEntries = visible.filter(n => PRIMARY_NAV.includes(n.href));
  const toolEntries = visible.filter(n => !PRIMARY_NAV.includes(n.href));
  const toolsActive = path === '/workspace' || toolEntries.some(n => navIsActive(n, path));

  const clientPortal = who?.role === 'requester';
  const primaryMobile = clientPortal ? ['/requests', '/inbox'] : PRIMARY_MOBILE;
  const quickItems = [
    { href: '/requests/new', label: 'Request an agreement', detail: 'Share your terms and choose a lawyer', icon: IconInbox, show: perms?.includes('request:write') ?? false },
    { href: '/ingest', label: 'Upload documents', detail: 'Add existing agreements for extraction', icon: IconUpload, show: perms?.includes('ingest:write') ?? false },
  ].filter((item) => item.show);

  const moreActive = !primaryMobile.some((href) => (href === '/' ? path === '/' : (path.startsWith(href) || (href === '/pipeline' && path.startsWith('/contracts/')))));

  return (
    <div className={`app${sidebarCollapsed ? ' is-sidebar-collapsed' : ''}`}>
      <a className="skip-link" href="#main-content">Skip to main content</a>

      <aside className={`sidebar${menuOpen ? ' is-open' : ''}`} aria-label="Primary navigation">
        <div className="sidebar-brand-row">
          <div className="brand">
            <Link className="brand-full brand-home" href={clientPortal ? "/requests" : "/"} aria-label="Concord home">
              <img className="brand-logo" src="/brand/lakme-salon.png" alt="Lakmē Salon" draggable={false} />
              <ConcordWordmark variant="display" /><div className="brand-caption">Legal operations workspace</div>
            </Link>
            <Link className="rail-mark" href={clientPortal ? "/requests" : "/"} aria-label="Concord home">C</Link>
          </div>
          <button
            className="sidebar-collapse"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            aria-pressed={sidebarCollapsed}
            data-tooltip={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            {sidebarCollapsed ? <IconPanelLeft /> : <IconChevronLeft />}
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Workspace">
          <div className="nav-group">
            {primaryEntries.map(n => {
              const Icon = n.icon;
              return <Link key={n.href} href={n.href} aria-current={navIsActive(n, path) ? 'page' : undefined}
                className={`nav-item${navIsActive(n, path) ? ' is-active' : ''}`} data-tooltip={n.label} title={sidebarCollapsed ? n.label : undefined}>
                <span className="nav-icon"><Icon /></span><span className="nav-copy">{n.label}</span>
                {n.href === '/inbox' && unread > 0 && <span className="n-badge" aria-label={`${unread} unread`}>{unread}</span>}
              </Link>;
            })}
          </div>
          {toolEntries.length > 0 && <div className="nav-group nav-utilities">
            <Link href="/workspace" className={`nav-item${toolsActive ? ' is-active' : ''}`} aria-current={path === '/workspace' ? 'page' : undefined} data-tooltip="Tools & settings" title={sidebarCollapsed ? 'Tools & settings' : undefined}>
              <span className="nav-icon"><IconMore /></span><span className="nav-copy">Tools &amp; settings</span>
            </Link>
          </div>}
        </nav>

        <div className="sidebar-foot">
          <span>{clientPortal ? 'Your legal team, in one place.' : 'Your legal workspace.'}</span><br /><b>{who?.roleLabel ?? '—'}</b>
        </div>

        <div className="xc-ribbon">
          <img src="/brand/xcelerate-2026.png" alt="Xcelerate 2026" draggable={false} />
          <span>Showcased at<br />Xcelerate 2026</span>
        </div>
      </aside>

      <div className={`scrim${menuOpen ? ' is-open' : ''}`} onClick={() => setMenuOpen(false)} aria-hidden="true" />

      <div className="app-main">
        <header className="topbar">
          <button className="hamburger" onClick={() => setMenuOpen((v) => !v)} aria-label="Toggle navigation">
            <IconMenu />
          </button>

          <div className="page-title">
            <span className="pt-eyebrow"><span className="desktop-eyebrow">{eyebrow}</span><span className="mobile-brand"><ConcordWordmark /></span></span>
            <h1>{title}</h1>
          </div>

          <button className="top-search" onClick={() => setPaletteOpen(true)} aria-label="Search or jump to anything">
            <IconSearch />
            <span>Search or jump to anything…</span>
            <span className="kbd">⌘K</span>
          </button>

          {!clientPortal && <SystemStatus />}

          {quickItems.length > 0 && <details ref={quickRef} key={`quick-${path}`} className="quick-menu">
            <summary className="quick-trigger" aria-label="Create or start work">
              <IconPlus /><span>New</span><IconChevronDown className="chev" />
            </summary>
            <div className="quick-popover quick-popover-wide">
              <div className="popover-head">
                <div><span className="popover-kicker">Start work</span><b>What do you want to do?</b></div>
                <span className="popover-context">Quick actions</span>
              </div>
              <div className="quick-grid">
                {quickItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link href={item.href} className="quick-item quick-item-card" key={item.href}>
                      <span className="quick-icon"><Icon /></span>
                      <span><b><ConcordText>{item.label}</ConcordText></b><small>{item.detail}</small></span>
                    </Link>
                  );
                })}
              </div>
              <button className="quick-search-row" onClick={(e) => { (e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open'); setPaletteOpen(true); }}>
                <IconSearch /><span>Search everything in <ConcordWordmark /></span><span className="kbd">⌘K</span>
              </button>
            </div>
          </details>}

          <Link className="icon-btn has-tooltip" href="/inbox" aria-label={`My inbox${unread ? `, ${unread} unread` : ''}`} data-tooltip="My inbox">
            <IconBell />{unread > 0 && <span className="dot" />}
          </Link>

          <button className="icon-btn theme-toggle has-tooltip" onClick={toggleTheme} aria-label="Toggle colour theme" data-tooltip={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}>
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
          </button>

          <details ref={accountRef} key={`account-${path}`} className="account-menu">
            <summary className="user-chip" aria-label="Account and appearance menu">
              <span className="av">{initials}</span>
              <span className="u-meta"><b>{who?.name ?? 'Signed in'}</b><span>{who?.roleLabel ?? ''}</span></span>
              <IconChevronDown className="account-chevron" />
            </summary>
            <div className="account-popover account-popover-premium">
              <button className="popover-dismiss" onClick={() => { if (accountRef.current) accountRef.current.open = false; accountRef.current?.querySelector("summary")?.focus(); }}>Account &amp; appearance <span aria-hidden="true">×</span></button>
              <div className="account-card">
                <span className="av av-lg">{initials}</span>
                <span><b>{who?.name ?? 'Signed in'}</b><small>{who?.roleLabel ?? ''}</small></span>
              </div>
              <div className="appearance-block">
                <span className="menu-section-label">Appearance</span>
                <div className="appearance-switch" role="group" aria-label="Appearance">
                  {appearanceButtons}
                </div>
              </div>
              <button onClick={(e) => { (e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open'); setPaletteOpen(true); }}><span>Search &amp; commands</span><span className="kbd">⌘K</span></button>
              <button className="danger-action" onClick={logout}><span>Sign out</span><IconLogout /></button>
            </div>
          </details>
        </header>

        <main className="stage" id="main-content" tabIndex={-1}>
          <div key={path} className="route-view">{!who || !perms || (clientPortal && !requestReturnPath(path)) ? <div className="req-notice" role="status">Loading your workspace…</div> : children}</div>
        </main>

        <footer className="foot">
          <span><ConcordWordmark /> CLM · Lakmē Lever Private Limited</span><span className="dotsep" />
          <span>Legal workflows · Accountable decisions</span>
        </footer>
      </div>

      <nav className={`mobile-nav${clientPortal ? ' req-mobile-nav' : ''}`} aria-label="Primary mobile navigation" style={{ '--mobile-destinations': visible.filter(n => primaryMobile.includes(n.href)).length + 1 } as React.CSSProperties}>
        {visible.filter((n) => primaryMobile.includes(n.href)).map((n) => {
          const active = navIsActive(n, path);
          const Icon = n.icon;
          return (
            <Link key={n.href} href={n.href} className={active ? 'is-active' : ''} aria-current={active ? 'page' : undefined}>
              <span className="mobile-nav-icon"><Icon /></span>
              <span>{n.href === '/' ? 'Home' : n.href === '/requests' ? 'Requests' : n.label.replace('Lifecycle ', '').replace(' & Search', '')}</span>
            </Link>
          );
        })}
        <button ref={moreButtonRef} className={moreActive || mobileMoreOpen ? 'is-active' : ''} onClick={() => setMobileMoreOpen(true)} aria-label="Open more tools and destinations" aria-expanded={mobileMoreOpen} aria-controls="concord-destinations">
          <span className="mobile-nav-icon"><IconMore /></span><span>More</span>
        </button>
      </nav>

      <div className={`mobile-sheet-scrim${mobileMoreOpen ? ' is-open' : ''}`} onClick={closeMobileMore} aria-hidden="true" />
      <section id="concord-destinations" ref={sheetRef} className={`mobile-sheet${mobileMoreOpen ? ' is-open' : ''}`} role="dialog" aria-modal="true" aria-hidden={!mobileMoreOpen} aria-label="All Concord destinations" onKeyDown={(e) => { if (e.key === 'Escape') closeMobileMore(); else trapDialogTab(e); }}>
        <div className="sheet-grabber" aria-hidden="true" />
        <div className="sheet-head">
          <div><ConcordWordmark /><h2>Everything in one place</h2></div>
          <button className="sheet-close" onClick={closeMobileMore} aria-label="Close menu">×</button>
        </div>
        <button className="sheet-search" onClick={() => { setMobileMoreOpen(false); setPaletteOpen(true); }}><IconSearch /><span>Search or jump to anything…</span><span className="kbd">⌘K</span></button>
        <div className="sheet-actions">
          {quickItems.slice(0, 4).map((item) => {
            const Icon = item.icon;
            return <Link key={`action-${item.href}`} href={item.href}><span><Icon /></span><b><ConcordText>{item.label}</ConcordText></b></Link>;
          })}
        </div>
        <div className="sheet-nav-scroll">
          {groups.map(([key, label]) => {
            const items = visible.filter((n) => n.group === key && !primaryMobile.includes(n.href));
            if (!items.length) return null;
            return (
              <div className="sheet-group" key={key}>
                <div className="nav-label">{label}</div>
                <div className="sheet-links">
                  {items.map((n) => {
                    const Icon = n.icon;
                    const active = navIsActive(n, path);
                    return (
                      <Link key={n.href} href={n.href} className={active ? 'is-active' : ''}>
                        <span className="sheet-link-icon"><Icon /></span>
                        <span><b>{n.label}</b><small><ConcordText>{n.description}</ConcordText></small></span>
                        <IconChevronDown className="sheet-link-arrow" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="sheet-foot">
          <button onClick={toggleTheme}>{theme === 'dark' ? <IconSun /> : <IconMoon />}<span>{theme === 'dark' ? 'Light appearance' : 'Dark appearance'}</span></button>
          <span>{who?.roleLabel ?? 'Signed in'}</span>
        </div>
      </section>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} commands={paletteCommands} canSearch={perms?.includes('contract:read') ?? false} />}
      <XcelerateSplash />
    </div>
  );
}

export function DemoNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="demo-note">
      <IconAlert style={{ width: 15, height: 15, stroke: 'var(--gold)', flex: 'none' }} />
      <span>{children}</span>
    </div>
  );
}
