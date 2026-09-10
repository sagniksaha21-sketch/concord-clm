/**
 * Inline stroke icons.
 *
 * Deliberately hand-written rather than pulled from an icon package: the shell
 * needs a dozen glyphs, and a dependency for that is weight in the bundle, one
 * more thing to keep patched, and one more supply-chain surface in a system that
 * holds executed contracts. They inherit `currentColor` so the sidebar, buttons
 * and cards all tint them from CSS.
 */
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = {
  viewBox: '0 0 24 24',
  width: 20,
  height: 20,
  'aria-hidden': true as const,
  focusable: false,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const IconGrid = (p: P) => (
  <svg {...base} {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
);
export const IconInbox = (p: P) => (
  <svg {...base} {...p}><path d="M12 3v10m0 0 4-4m-4 4-4-4" /><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>
);
export const IconFlow = (p: P) => (
  <svg {...base} {...p}><path d="M3 5h18M6 12h12M10 19h4" /></svg>
);
export const IconSparkle = (p: P) => (
  <svg {...base} {...p}><path d="M12 3l1.9 4.9L19 9.8l-5.1 1.9L12 17l-1.9-5.3L5 9.8l5.1-1.9L12 3Z" /><path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z" /></svg>
);
export const IconDoc = (p: P) => (
  <svg {...base} {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>
);
export const IconBox = (p: P) => (
  <svg {...base} {...p}><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="m3 8 9 5 9-5M12 13v8" /></svg>
);
export const IconCalendar = (p: P) => (
  <svg {...base} {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /><path d="m9 15 2 2 4-4" /></svg>
);
export const IconSign = (p: P) => (
  <svg {...base} {...p}><path d="M3 17c3.5 0 3.5-10 7-10s3.5 10 7 10c1.5 0 2.5-1 4-3" /><path d="M4 21h16" /></svg>
);
export const IconMail = (p: P) => (
  <svg {...base} {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
);
export const IconShield = (p: P) => (
  <svg {...base} {...p}><path d="M12 3 5 6v6c0 4.4 3 7.9 7 9 4-1.1 7-4.6 7-9V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>
);
export const IconSearch = (p: P) => (
  <svg {...base} {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
export const IconBell = (p: P) => (
  <svg {...base} {...p}><path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Z" /><path d="M10 19a2 2 0 0 0 4 0" /></svg>
);
export const IconSun = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" /></svg>
);
export const IconMoon = (p: P) => (
  <svg {...base} {...p}><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" /></svg>
);
export const IconMenu = (p: P) => (
  <svg {...base} {...p}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
);
export const IconRupee = (p: P) => (
  <svg {...base} {...p}><path d="M7 4h10M7 9h10M15.5 4c0 3.5-2.5 5-5.5 5h-3l8 11" /></svg>
);
export const IconClock = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
export const IconAlert = (p: P) => (
  <svg {...base} {...p}><path d="M12 4 2.7 20h18.6L12 4Z" /><path d="M12 10v4M12 17.5v.01" /></svg>
);
export const IconArrowUp = (p: P) => (
  <svg {...base} {...p}><path d="M12 19V5M6 11l6-6 6 6" /></svg>
);
export const IconArrowDown = (p: P) => (
  <svg {...base} {...p}><path d="M12 5v14M6 13l6 6 6-6" /></svg>
);
export const IconLogout = (p: P) => (
  <svg {...base} {...p}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l-5-5 5-5M5 12h11" /></svg>
);

export const IconPlus = (p: P) => (
  <svg {...base} {...p}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconChevronDown = (p: P) => (
  <svg {...base} {...p}><path d="m6 9 6 6 6-6" /></svg>
);
export const IconCheck = (p: P) => (
  <svg {...base} {...p}><path d="m5 12 4 4L19 6" /></svg>
);
export const IconUpload = (p: P) => (
  <svg {...base} {...p}><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg>
);
export const IconDownload = (p: P) => (
  <svg {...base} {...p}><path d="M12 4v12m0 0 5-5m-5 5-5-5M5 20h14" /></svg>
);
export const IconCopy = (p: P) => (
  <svg {...base} {...p}><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>
);
export const IconFilter = (p: P) => (
  <svg {...base} {...p}><path d="M4 6h16M7 12h10M10 18h4" /></svg>
);

export const IconChevronLeft = (p: P) => (
  <svg {...base} {...p}><path d="m15 18-6-6 6-6" /></svg>
);
export const IconArrowRight = (p: P) => (
  <svg {...base} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const IconMonitor = (p: P) => (
  <svg {...base} {...p}><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
);
export const IconPanelLeft = (p: P) => (
  <svg {...base} {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></svg>
);
export const IconMore = (p: P) => (
  <svg {...base} {...p}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></svg>
);
export const IconCommand = (p: P) => (
  <svg {...base} {...p}><path d="M9 6V5a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v14a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6Z" /></svg>
);
export const IconChart = (p: P) => (
  <svg {...base} {...p}><path d="M4 19V5M4 19h16" /><path d="m7 15 3-4 3 2 5-7" /><path d="M18 6h-3M18 6v3" /></svg>
);
