
export type ForgeThemeName = 'black-amber' | 'graphite-champagne' | 'pure-black';

export const THEMES = {
  'black-amber': {
    name: 'BLACK AMBER',
    bg: '#050507',
    panel: '#0E0C0A',
    panel2: '#17120D',
    text: '#FFF7EA',
    muted: '#968D82',
    line: 'rgba(255,255,255,0.075)',
    amber: '#F5A623',
    gold: '#FFD37A',
    ember: '#FF7A1A',
    teal: '#53D7C0',
  },
  'graphite-champagne': {
    name: 'GRAPHITE',
    bg: '#101012',
    panel: '#19191C',
    panel2: '#242327',
    text: '#FAF6EF',
    muted: '#A59F97',
    line: 'rgba(255,255,255,0.09)',
    amber: '#D3A45C',
    gold: '#F0D8A9',
    ember: '#E39B57',
    teal: '#6EC8B8',
  },
  'pure-black': {
    name: 'PURE BLACK',
    bg: '#000000',
    panel: '#070707',
    panel2: '#101010',
    text: '#FFFFFF',
    muted: '#929292',
    line: 'rgba(255,255,255,0.08)',
    amber: '#FFAA24',
    gold: '#FFD98A',
    ember: '#FF7415',
    teal: '#64D7C2',
  },
} as const;

export const RADIUS = { sm: 12, md: 18, lg: 24, xl: 30 };
export const SPACE = { xs: 6, sm: 10, md: 14, lg: 18, xl: 24, xxl: 32 };
