import { SectionChange } from '@concord/shared';
import { groundedQuote, lifecycleJson } from '../common/lifecycle-ai';
export interface ChangeAssessment {
  changeId: string; risk: 'low' | 'medium' | 'high'; explanation: string;
  excerpt: string; playbookId?: string; playbookExcerpt?: string;
  fallback: string; businessQuestion: string; approvalConsideration: string;
}
export function validateRoundAnalysis(value: any, changes: SectionChange[], playbook: { id: string; text: string }[]): ChangeAssessment[] {
  if (!Array.isArray(value?.assessments) || value.assessments.length !== changes.length) throw new Error('Every change must be assessed exactly once.');
  const ids = new Set<string>();
  return value.assessments.map((row: any) => {
    const change = changes.find(c => c.id === row?.changeId);
    if (!change || ids.has(change.id) || !['low','medium','high'].includes(row.risk)) throw new Error('Unknown or duplicate change.');
    ids.add(change.id);
    if (!groundedQuote(row.excerpt,change.after || change.before)) throw new Error('Unverified negotiation evidence.');
    for (const field of ['explanation','fallback','businessQuestion','approvalConsideration']) if (typeof row[field] !== 'string' || row[field].length > 2000) throw new Error('Invalid advisory finding.');
    if (!row.explanation.trim()) throw new Error('A risk explanation is required.');
    const clause = playbook.find(p => p.id === row.playbookId);
    if (row.playbookId && (!clause || !groundedQuote(row.playbookExcerpt,clause.text))) throw new Error('Unverified playbook position.');
    if (!row.playbookId && row.playbookExcerpt) throw new Error('Playbook source is required.');
    return { changeId: row.changeId, risk: row.risk, explanation: row.explanation, excerpt: row.excerpt, playbookId: row.playbookId || undefined, playbookExcerpt: row.playbookExcerpt || undefined, fallback: row.fallback, businessQuestion: row.businessQuestion, approvalConsideration: row.approvalConsideration };
  });
}
export async function analyzeNegotiation(changes: SectionChange[], playbook: { id: string; title: string; text: string }[]) {
  if (!changes.length) return { model: 'rules:comparison', assessments: [], status: 'complete', detail: 'No textual changes were identified. Review the original Word file for formatting changes.' };
  const result = await lifecycleJson('Assess each supplied change exactly once. Return {"assessments":[{"changeId":"exact id","risk":"low|medium|high","explanation":"why the change matters","excerpt":"exact quote from after, or before for deletion","playbookId":"approved clause id or empty","playbookExcerpt":"exact approved clause quote or empty","fallback":"proposed alternative for human review, or empty","businessQuestion":"question requiring business confirmation, or empty","approvalConsideration":"possible approval issue, or empty"}]}. Do not invent a playbook position. Fallbacks are proposals, never approved policy. Ground each assessment in its own change.', { changes, approvedClauses: playbook });
  if (!result) return { model: 'rules:comparison', assessments: [], status: 'unavailable', detail: `${changes.length} textual changes recorded. Configure Legal AI for risk assessments, fallback proposals and business questions.` };
  return { model: result.model, assessments: validateRoundAnalysis(result.value,changes,playbook), status: 'complete', detail: 'Internal advisory analysis. Check source language before accepting or sharing a response.' };
}
