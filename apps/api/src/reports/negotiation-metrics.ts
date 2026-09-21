import { NegotiationMetrics } from '@concord/shared';
export function median(values: number[]): number | null {
  const sorted = values.filter(n => Number.isFinite(n) && n >= 0).sort((a,b) => a-b);
  if (!sorted.length) return null;
  const i = Math.floor(sorted.length/2);
  return Math.round((sorted.length % 2 ? sorted[i] : (sorted[i-1]+sorted[i])/2)*10)/10;
}
/** Elapsed calendar time, measured only from recorded events. No invented SLAs. */
export function negotiationMetrics(contracts: any[], rounds: any[], asOf: string): NegotiationMetrics {
  const legal: number[] = [], external: number[] = [], completion: number[] = [];
  const topics = new Map<string,{ count: number; ids: Set<string> }>();
  const hours = (a: any,b: any) => (Date.parse(String(b))-Date.parse(String(a)))/3600000;
  const agreements: NegotiationMetrics['agreements'] = [];
  for (const c of contracts) {
    const related = rounds.filter(r => r.contractId === c.id).sort((a,b) => Date.parse(a.createdAt)-Date.parse(b.createdAt));
    if (!related.length) continue;
    const responses = related.flatMap(r => r.responses.map((s: any) => ({ ...s, sharedAt: new Date(Math.max(Date.parse(r.createdAt),Date.parse(s.invitation.createdAt))).toISOString() })));
    const l = responses.filter(r => r.reviewedAt).map(r => hours(r.createdAt,r.reviewedAt)).filter(n => n >= 0);
    const e = responses.map(r => hours(r.sharedAt,r.createdAt)).filter(n => n >= 0);
    legal.push(...l); external.push(...e);
    const startedAt = new Date(related[0].createdAt).toISOString();
    const elapsedDays = Math.max(0,Math.round(hours(startedAt,c.agreedAt ?? asOf)/24*10)/10);
    if (c.agreedAt) completion.push(elapsedDays);
    for (const response of responses) for (const change of response.changes ?? []) {
      const language = `${change.heading} ${change.before} ${change.after}`;
      const topic = /liability|indemn/i.test(language) ? 'Liability & indemnity' : /privacy|personal data|data protection/i.test(language) ? 'Data & privacy' : /confidential/i.test(language) ? 'Confidentiality' : /payment|invoice|fee/i.test(language) ? 'Payments' : /terminat|renew|notice/i.test(language) ? 'Term & exit' : /intellectual property|licen[sc]e|copyright/i.test(language) ? 'Intellectual property' : /exclusiv/i.test(language) ? 'Exclusivity' : 'Other provisions';
      const entry = topics.get(topic) ?? { count: 0, ids: new Set<string>() }; entry.count++; entry.ids.add(c.id); topics.set(topic,entry);
    }
    agreements.push({ id: c.id, title: c.title, counterparty: c.counterparty, rounds: related.length, changes: responses.reduce((n,r) => n+(r.changes?.length ?? 0),0), startedAt, completedAt: c.agreedAt ? new Date(c.agreedAt).toISOString() : undefined, elapsedDays, legalResponseHours: median(l), counterpartyResponseHours: median(e) });
  }
  return { agreements, completedCount: completion.length, medianCompletionDays: median(completion), legalResponseSamples: legal.length, counterpartyResponseSamples: external.length, medianLegalHours: median(legal), medianCounterpartyHours: median(external), clausePatterns: [...topics].map(([topic,v]) => ({ topic, changes: v.count, agreementIds: [...v.ids] })).sort((a,b) => b.changes-a.changes) };
}
