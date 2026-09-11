/** Concord's report palettes mirror the application's signature colour tokens. */
export const REPORT_THEMES = {
  'black-gold': {
    label: 'Black & Gold', background: '0A0A0B', surface: '161517',
    ink: 'F4EFE3', secondary: 'B7B1A1', gold: 'E6BE55', highlight: 'F3D178',
    line: '3E3A2F', inset: '26231C', risk: 'E85B57', watch: 'F2B23C', low: '76BA86',
  },
  'golden-champagne': {
    label: 'Golden Champagne', background: 'F6F1E6', surface: 'FFFDF8',
    ink: '241E12', secondary: '655B48', gold: 'A17D1C', highlight: 'C69A2C',
    line: 'D9CEB3', inset: 'EFE8D8', risk: 'B7382E', watch: '916A10', low: '357448',
  },
} as const;

export const REPORT_FOCUSES = {
  portfolio: { label: 'Portfolio overview', title: 'Portfolio intelligence' },
  risk: { label: 'High-risk agreements', title: 'Risk exposure' },
  renewals: { label: 'Dates & renewals', title: 'Commitments & renewals' },
  approvals: { label: 'Review & approvals', title: 'Legal review priorities' },
  signatures: { label: 'Signature queue', title: 'Execution priorities' },
} as const;

export type ReportTheme = keyof typeof REPORT_THEMES;
export type ReportFocus = keyof typeof REPORT_FOCUSES;

export interface ReportOptions {
  theme?: ReportTheme;
  focus?: ReportFocus;
  /** Narrative direction. Does not grant access or silently alter the filters. */
  prompt?: string;
  /** Matches agreement title, counterparty or type. */
  query?: string;
  horizonDays?: number;
}

export const DEFAULT_REPORT_OPTIONS: Required<ReportOptions> = {
  theme: 'black-gold', focus: 'portfolio', prompt: '', query: '', horizonDays: 90,
};
