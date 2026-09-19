import type { DraftSection } from './types';
export interface SectionChange { id: string; kind: 'added' | 'deleted' | 'modified' | 'moved'; heading: string; before: string; after: string; }
/** Text evidence only. Risk and legal interpretation are separate, advisory steps. */
export function compareSections(before: DraftSection[], after: DraftSection[]): SectionChange[] {
  const key = (s: DraftSection, i: number) => s.id ?? `section-${i}`;
  const previous = new Map(before.map((s,i) => [key(s,i), { section: s, index: i }]));
  const current = new Set(after.map(key));
  const changes: SectionChange[] = [];
  after.forEach((s,i) => {
    const id = key(s,i), old = previous.get(id);
    if (!old) changes.push({ id, kind: 'added', heading: s.heading, before: '', after: s.body });
    else if (old.section.body !== s.body || old.section.heading !== s.heading) changes.push({ id, kind: 'modified', heading: s.heading, before: old.section.body, after: s.body });
    else if (old.index !== i) changes.push({ id, kind: 'moved', heading: s.heading, before: s.body, after: s.body });
  });
  before.forEach((s,i) => { const id = key(s,i); if (!current.has(id)) changes.push({ id, kind: 'deleted', heading: s.heading, before: s.body, after: '' }); });
  return changes;
}
export interface AgreementVersion {
  documentId: string; number: number; label: string; authorName: string; organisation?: string;
  source: string; reason: string; stage: string; round: number; createdAt: string; sha256?: string;
  sharedAt?: string; agreedAt?: string; approvedAt?: string; executedAt?: string;
  sections?: DraftSection[]; changeSummary?: SectionChange[];
}
export interface AgreementComment {
  id: string; documentId: string; sectionId?: string; body: string; visibility: 'internal' | 'external';
  authorName: string; createdAt: string; resolvedAt?: string; parentId?: string;
}
