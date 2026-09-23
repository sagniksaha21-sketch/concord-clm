
export type ForgeThemeName = 'black-amber' | 'graphite-champagne' | 'pure-black' | 'midnight-blue' | 'crimson-forge' | 'emerald-carbon' | 'violet-neon';

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
  'midnight-blue': {
    name:'MIDNIGHT BLUE', bg:'#030711', panel:'#08111F', panel2:'#0D1A2C', text:'#F3F7FF', muted:'#8998AE', line:'rgba(130,174,255,.13)', amber:'#4E9DFF', gold:'#9AC8FF', ember:'#2868D8', teal:'#58D8D0',
  },
  'crimson-forge': {
    name:'CRIMSON', bg:'#080304', panel:'#140708', panel2:'#210C0E', text:'#FFF4F2', muted:'#A98D8B', line:'rgba(255,115,105,.12)', amber:'#FF5148', gold:'#FF9B82', ember:'#D91F2A', teal:'#66D3BC',
  },
  'emerald-carbon': {
    name:'EMERALD', bg:'#020706', panel:'#07120F', panel2:'#0C1D18', text:'#F1FFF9', muted:'#88A096', line:'rgba(93,225,172,.12)', amber:'#3ED39B', gold:'#8AE8BF', ember:'#15976B', teal:'#5DE4D1',
  },
  'violet-neon': {
    name:'VIOLET', bg:'#07040B', panel:'#11091A', panel2:'#1B1027', text:'#FCF5FF', muted:'#9F8DA8', line:'rgba(202,124,255,.13)', amber:'#B85CFF', gold:'#E0A6FF', ember:'#8134C9', teal:'#5CDACD',
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

// Forge 14 semantic design primitives. Components should consume these instead of inventing local geometry.
export const V14 = {
  radius:{control:14,surface:18,hero:28,pill:999},
  space:{hairline:2,tight:8,control:12,surface:16,section:24,hero:32},
  type:{micro:9,label:11,body:13,title:22,display:36},
  motion:{tap:110,fast:180,standard:260,hero:420},
  opacity:{secondary:.72,quiet:.52,hairline:.10},
} as const;

export const FORGE_SEMANTICS = {
  gold:'PR / selected / progress / primary action',
  ember:'effort / urgency / live training',
  teal:'recovered / ready / positive recovery',
} as const;
