import type { Contract, DraftSection } from './types';
import type { ClientRequest } from './client-requests';

export const LIFECYCLE = [
  ['intake', 'Request'], ['drafting', 'Draft'], ['review', 'Internal review'], ['negotiation','Negotiation'],
  ['approval', 'Approval'], ['signature', 'Signature'], ['active', 'Executed'],
] as const;
export const STAGE_LABELS: Record<string, string> = { intake: 'New request', drafting: 'Drafting', review: 'Internal review', negotiation: 'Negotiation', agreed: 'Agreed form', approval: 'Approval', signature: 'Signature', active: 'Executed', renewal: 'Renewal' };
export function nextAction(stage: string, waiting = false): string {
  if (waiting) return 'Respond to Legal’s question';
  return ({ intake: 'Review the term sheet', drafting: 'Prepare the agreement', review: 'Resolve findings and confirm the draft', negotiation: 'Continue the negotiation', agreed: 'Request approval of the agreed form', approval: 'Collect the required approvals', signature: 'Complete signing', active: 'Review commitments and key dates', renewal: 'Confirm renewal or exit' } as Record<string, string>)[stage] ?? 'Review the agreement';
}
export interface WorkItem extends Contract {
  ownerId?: string; ownerName?: string; businessUnit?: string; businessOwner?: string;
  dueDate?: string; priority: string; nextAction: string; waitingOnClient: boolean;
  waitingFor?: 'legal' | 'business' | 'counterparty' | 'approver' | 'signatory' | 'obligation-owner';
  waitingOn?: string; negotiationState?: string; parentAgreementId?: string;
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
  versionHistory?: import('./editing').AgreementVersion[];
  comments?: import('./editing').AgreementComment[];
  parentAgreement?: { id: string; title: string } | null;
  amendments?: { id: string; title: string; stage: string }[];
  needsNewVersion?: boolean;
}
