import { groundedQuote, lifecycleJson } from '../common/lifecycle-ai';
export const COMMITMENT_TYPES = ['renewal','notice','payment','reporting','service','insurance','privacy','milestone','other'];
export interface CommitmentCandidate { title: string; type: string; excerpt: string; dueDate: string; }
export function validateCommitments(value: any, source: string): CommitmentCandidate[] {
  if (!Array.isArray(value?.commitments) || value.commitments.length > 100) throw new Error('Invalid commitment extraction.');
  return value.commitments.map((c: any) => {
    if (!c || typeof c.title !== 'string' || !c.title.trim() || c.title.length > 200 || !COMMITMENT_TYPES.includes(c.type) || !groundedQuote(c.excerpt,source,3500)) throw new Error('Commitment has no verifiable source provision.');
    if (c.dueDate && (typeof c.dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(c.dueDate) || !Number.isFinite(Date.parse(c.dueDate)) || new Date(c.dueDate).toISOString().slice(0,10) !== c.dueDate || !c.excerpt.includes(c.dueDate))) throw new Error('Commitment date is not evidenced by its clause.');
    return { title: c.title.trim(), type: c.type, excerpt: c.excerpt.trim(), dueDate: c.dueDate || '' };
  });
}
export async function extractCommitments(text: string) {
  if (text.length > 120000) throw new Error('The complete source is too long for this extraction.');
  const response = await lifecycleJson('Extract obligations covering payments, reporting, service levels, insurance, privacy, milestones, renewal, notice and other commitments. Output {"commitments":[{"title":"concise action","type":"renewal|notice|payment|reporting|service|insurance|privacy|milestone|other","excerpt":"exact source quotation","dueDate":""}]}. Keep conditions, recurrence and triggers in the quoted excerpt. Set dueDate only when an explicit ISO date appears in that excerpt; otherwise leave it empty. Never assign an owner or confirm a legal obligation.', { text });
  if (response) return { candidates: validateCommitments(response.value,text), model: response.model };
  const patterns: [string, string, RegExp][] = [
    ['payment','Review payment commitment',/\b(pay(?:ment|able)?|invoice|fees)\b/i], ['reporting','Review reporting commitment',/\b(report|reporting|statement)\b/i],
    ['service','Review service level',/\b(service level|uptime|availability|SLA)\b/i], ['insurance','Review insurance requirement',/\b(insurance|insured|coverage)\b/i],
    ['privacy','Review data commitment',/\b(personal data|privacy|data protection|data deletion|breach)\b/i], ['milestone','Review milestone',/\b(milestone|deliverable|delivery date)\b/i],
    ['renewal','Review renewal provision',/\b(renew|expiry|expire)\w*\b/i], ['notice','Review notice requirement',/\bnotice\b/i], ['other','Review continuing commitment',/\b(audit rights|exclusivity|termination|indemnif)\w*\b/i],
  ];
  const candidates: CommitmentCandidate[] = [];
  for (const paragraph of text.split(/\n\s*\n|(?<=[.;])\s+(?=[A-Z])/).filter(p => p.trim().length >= 20 && p.length <= 3500)) {
    if (!/\b(shall|must|will|required|agree|undertake|obligat|within|prior to)\w*\b/i.test(paragraph)) continue;
    const pattern = patterns.find(([, ,re]) => re.test(paragraph));
    if (pattern) candidates.push({ type: pattern[0], title: pattern[1], excerpt: paragraph.trim(), dueDate: '' });
  }
  if (candidates.length > 100) throw new Error('Too many candidate provisions; review this source manually.');
  return { candidates, model: 'rules:source-provisions' };
}
