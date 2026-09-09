'use client';

import { useEffect, useRef, useState } from 'react';

/** True when the viewer has asked their OS for reduced motion. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

/**
 * A number that counts up to its real value.
 *
 * The important property is that `value` is the ONLY source of the final
 * number: the animation interpolates toward it and always lands exactly on it,
 * and when motion is reduced — or before the effect has run — the component
 * renders `value` directly. There is no state in which this shows a figure the
 * data does not support, which is the only way an animated statistic belongs in
 * a system of record.
 *
 * `prefix`/`suffix` are rendered outside the animated span so a currency symbol
 * or unit never appears to change.
 */
export function CountUp({
  value,
  duration = 900,
  prefix = '',
  suffix = '',
  className,
}: {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(value);
  const frame = useRef<number>();

  useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    const from = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic — fast then settling, so the last digits are readable.
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(from + (value - from) * eased));
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else setShown(value); // land exactly on the real number, never near it
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [value, duration, reduced]);

  return (
    <span className={className}>
      {prefix}
      <span className="count-up">{shown.toLocaleString('en-IN')}</span>
      {suffix}
    </span>
  );
}

/**
 * The Xcelerate speedometer, used on the Command Center.
 *
 * It shows ONE real, computed quantity: `value` out of `max`, labelled by
 * `caption`. It is not a decorative dial — a gauge that sweeps to a
 * meaningless position is a chart that lies, and this one is wired to the same
 * risk distribution the card beside it prints in words.
 *
 * `--dash` and `--angle` are handed to CSS as custom properties so the sweep
 * animation lives in the stylesheet and the reduced-motion rule can pin both to
 * their final values with no JavaScript involved.
 */
export function Gauge({
  value,
  max,
  caption,
  display,
  tone = 'gold',
}: {
  value: number;
  max: number;
  caption: string;
  display: string;
  tone?: 'gold' | 'risk';
}) {
  // Geometry: a 180° arc of radius 78 centred at (93, 88).
  const R = 78;
  const CX = 93;
  const CY = 88;
  const ARC = Math.PI * R; // length of a half-circle
  const safeMax = max > 0 ? max : 1;
  const ratio = Math.max(0, Math.min(1, value / safeMax));
  const dash = ARC * (1 - ratio); // stroke-dashoffset at rest
  const angle = -180 + ratio * 180; // needle rotation, 0% = pointing left

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const a = Math.PI * (1 - t);
    return {
      x1: CX + Math.cos(a) * (R - 11),
      y1: CY - Math.sin(a) * (R - 11),
      x2: CX + Math.cos(a) * (R - 3),
      y2: CY - Math.sin(a) * (R - 3),
    };
  });

  return (
    <div className="gauge">
      <svg
        className="gauge-svg"
        viewBox="0 0 186 104"
        role="img"
        aria-label={`${caption}: ${display}`}
      >
        <defs>
          <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
            {tone === 'risk' ? (
              <>
                <stop offset="0%" stopColor="var(--low)" />
                <stop offset="55%" stopColor="var(--med)" />
                <stop offset="100%" stopColor="var(--race)" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="var(--gold-deep)" />
                <stop offset="60%" stopColor="var(--gold)" />
                <stop offset="100%" stopColor="var(--gold-bright)" />
              </>
            )}
          </linearGradient>
        </defs>

        <path
          className="gauge-track"
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
        />
        {ticks.map((t, i) => (
          <line key={i} className="gauge-ticks" x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} />
        ))}
        <path
          className="gauge-fill"
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          style={
            {
              '--arc': `${ARC}`,
              '--dash': `${dash}`,
            } as React.CSSProperties
          }
        />
        <line
          className="gauge-needle"
          x1={CX}
          y1={CY}
          x2={CX + R - 16}
          y2={CY}
          style={{ '--angle': `${angle}deg` } as React.CSSProperties}
        />
        <circle className="gauge-hub" cx={CX} cy={CY} r={5} />
      </svg>
      <div className="gauge-val">{display}</div>
      <div className="gauge-cap">{caption}</div>
    </div>
  );
}

/** Shapeless loading placeholder — see `.skeleton` in globals.css. */
export function Skeleton({ lines = 3 }: { lines?: number }) {
  const widths = ['w-90', 'w-70', 'w-45'];
  return (
    <div className="sk-stack" aria-busy="true" aria-live="polite">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className={`skeleton sk-row ${widths[i % widths.length]}`} />
      ))}
    </div>
  );
}
