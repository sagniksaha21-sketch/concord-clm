'use client';

import { useEffect, useState } from 'react';
import { ConcordWordmark } from '@/components/ConcordBrand';

const SEEN_KEY = 'concord_splash_seen';

/**
 * The Xcelerate 2026 opening.
 *
 * Three rules keep a splash screen from being an obstacle:
 *
 *  1. **It never blocks.** The application renders underneath and is fully
 *     interactive the moment it is ready; this overlay only covers it. If the
 *     animation misbehaves, the worst case is a visible page behind a fading
 *     panel, not a locked app.
 *  2. **It shows once per browser session** — `sessionStorage`, not
 *     `localStorage`, so it plays when someone opens Concord for the day and
 *     not on every navigation, and it never becomes a permanent cookie.
 *  3. **It is skippable and self-dismissing.** Escape, a click, or the skip
 *     button ends it; otherwise it removes itself. Anyone who has asked their
 *     operating system for reduced motion never sees it at all — that is
 *     handled in CSS (`.splash{display:none}`) *and* here, so the element is
 *     not even mounted.
 */
export default function XcelerateSplash() {
  const [show, setShow] = useState(false);
  const enabled = process.env.NEXT_PUBLIC_SHOWCASE_SPLASH === 'true';

  useEffect(() => {
    if (!enabled) return;
    // Reduced motion: do not mount at all. A 2.5-second animated overlay is
    // exactly what that preference exists to prevent.
    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    let seen = true;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === '1';
    } catch {
      // Storage blocked (private window, embedded frame). Showing it is the
      // safe failure: an extra 2.5s of branding, never a broken app.
      seen = false;
    }
    if (seen) return;
    try {
      sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* ignore */
    }
    setShow(true);
    // Matches the CSS `splashOut` animation end (2.05s delay + 0.7s fade).
    const t = setTimeout(() => setShow(false), 2800);
    return () => clearTimeout(t);
  }, [enabled]);

  useEffect(() => {
    if (!show) return;
    const dismiss = () => setShow(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show]);

  if (!show) return null;

  return (
    <div
      className="splash"
      role="presentation"
      onClick={() => setShow(false)}
      // aria-hidden because everything inside is decorative and the real page
      // is already behind it — a screen reader should be reading that, not this.
      aria-hidden="true"
    >
      <div className="splash-inner">
        <img className="splash-mark" src="/brand/xcelerate-2026.png" alt="" draggable={false} />
        <div className="splash-line" />
        <div className="splash-cap"><ConcordWordmark /> · Contract Lifecycle Management</div>
      </div>
      <button className="splash-skip" onClick={() => setShow(false)} tabIndex={-1}>
        Skip
      </button>
    </div>
  );
}
