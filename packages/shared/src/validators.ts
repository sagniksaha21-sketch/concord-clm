// ─── Indian PAN & GSTIN validation ───────────────────────────────────────────
// Deterministic "adjacent tech" that backs the AI extraction: format regex plus
// the official GSTIN mod-36 checksum, and a PAN⇄GSTIN cross-check. Runs the same
// way in the API and the browser (shared package).

export const GST_STATE_CODES: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
  '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi',
  '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram',
  '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra',
  '29': 'Karnataka', '30': 'Goa', '32': 'Kerala', '33': 'Tamil Nadu',
  '34': 'Puducherry', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
};

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;
const CODES = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const PAN_HOLDER: Record<string, string> = {
  P: 'Individual', C: 'Company', H: 'HUF', F: 'Firm / LLP', A: 'AOP',
  T: 'Trust', B: 'Body of Individuals', L: 'Local Authority',
  J: 'Artificial Juridical Person', G: 'Government',
};

export function isValidPAN(pan: string): boolean {
  return PAN_RE.test((pan || '').toUpperCase());
}

export function panHolderType(pan: string): string | undefined {
  if (!isValidPAN(pan)) return undefined;
  return PAN_HOLDER[pan.toUpperCase()[3]];
}

/** Official GSTIN check digit over the first 14 characters (mod-36). */
export function gstinChecksum(first14: string): string {
  let total = 0;
  let factor = 1;
  for (const ch of first14.toUpperCase()) {
    const v = CODES.indexOf(ch);
    if (v < 0) return '';
    const p = v * factor;
    total += Math.floor(p / 36) + (p % 36);
    factor = factor === 1 ? 2 : 1;
  }
  return CODES[(36 - (total % 36)) % 36];
}

export interface GstinCheck {
  formatOk: boolean;
  checksumOk: boolean;
  valid: boolean;
  stateCode?: string;
  state?: string;
  pan?: string;
}

export function validateGSTIN(gstin: string): GstinCheck {
  const g = (gstin || '').toUpperCase();
  if (!GSTIN_RE.test(g)) return { formatOk: false, checksumOk: false, valid: false };
  const checksumOk = gstinChecksum(g.slice(0, 14)) === g[14];
  const stateCode = g.slice(0, 2);
  return {
    formatOk: true,
    checksumOk,
    valid: checksumOk,
    stateCode,
    state: GST_STATE_CODES[stateCode],
    pan: g.slice(2, 12),
  };
}

export interface PartyIdCheck {
  pan?: { value: string; valid: boolean; holderType?: string };
  gstin?: { value: string; valid: boolean; state?: string; checksumOk: boolean };
  /** true when the PAN embedded in the GSTIN matches the standalone PAN. */
  crossCheckOk?: boolean;
}

export function validatePartyIds(pan?: string, gstin?: string): PartyIdCheck {
  const out: PartyIdCheck = {};
  if (pan) {
    out.pan = { value: pan.toUpperCase(), valid: isValidPAN(pan), holderType: panHolderType(pan) };
  }
  if (gstin) {
    const g = validateGSTIN(gstin);
    out.gstin = { value: gstin.toUpperCase(), valid: g.valid, state: g.state, checksumOk: g.checksumOk };
    if (pan && g.pan) out.crossCheckOk = g.pan === pan.toUpperCase();
  }
  return out;
}

/** Extract PAN / GSTIN candidates from raw OCR text (fallback when no LLM). */
export function scanIdsFromText(text: string): { pans: string[]; gstins: string[] } {
  const up = (text || '').toUpperCase();
  const gstins = Array.from(up.matchAll(/\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]\b/g)).map((m) => m[0]);
  const pans = Array.from(up.matchAll(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g)).map((m) => m[0]);
  return {
    pans: Array.from(new Set(pans)),
    gstins: Array.from(new Set(gstins)),
  };
}
