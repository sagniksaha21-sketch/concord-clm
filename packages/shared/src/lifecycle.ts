import type { Contract, DraftSection } from './types';
import type { ClientRequest } from './client-requests';

export const LIFECYCLE = [
  ['intake', 'Request'], ['drafting', 'Draft'], ['review', 'Review'],
  ['approval', 'Approval'], ['signature', 'Signature'], ['active', 'Repository'],
] as const;
export const STAGE_LABELS: Record<string, string> = { intake: 'New request', drafting: 'Drafting', review: 'Review / negotiation', approval: 'Approval', signature: 'Signature', active: 'Repository', renewal: 'Renewal' };
export function nextAction(stage: string, waiting = false): string {
  if (waiting) return 'Respond to Legal’s question';
  return ({ intake: 'Review the term sheet', drafting: 'Prepare the agreement', review: 'Resolve findings and confirm the draft', approval: 'Collect the required approvals', signature: 'Complete signing', active: 'Review commitments and key dates', renewal: 'Confirm renewal or exit' } as Record<string, string>)[stage] ?? 'Review the agreement';
}
export interface WorkItem extends Contract {
  ownerId?: string; ownerName?: string; businessUnit?: string; businessOwner?: string;
  dueDate?: string; priority: string; nextAction: string; waitingOnClient: boolean;
}
export interface AgreementDocument { id: string; filename: string; status: string; sha256?: string; createdAt: string; hasFile: boolean; }
export interface AgreementWorkspace {
  contract: WorkItem; request: ClientRequest | null; permissions: string[];
  revision: number; documents: AgreementDocument[];
  draft: { templateId?: string; sections: DraftSection[]; model: string; revision: number; documentId: string } | null;
  approval: { approvers: string[]; decision?: string; decidedBy?: string; expiresAt: string; documentId?: string } | null;
  archive: { id: string; filename: string; checksum: string; completedAt: string } | null;
  obligations: { id: string; title: string; type: string; dueDate: string; ownerEmail?: string; evidence: string; confirmed: boolean; completedAt?: string }[];
  activity: { id: string; at: string; summary: string; action: string }[];
  approvalHistory?: { id: string; version: string; decision: string; archivedAt: string; evidenceSha256: string; steps: { approverName: string; decision: string; comment?: string }[] }[];
}
