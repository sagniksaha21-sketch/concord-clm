import type { AuthUser } from './types';

export const AGREEMENT_TYPES = ['NDA', 'Master Services Agreement', 'Statement of Work', 'Vendor Agreement', 'Lease', 'Employment', 'Franchise', 'Other'] as const;
export const REQUEST_STATUSES = {
  submitted: 'Submitted',
  'in-progress': 'In progress',
  'waiting-on-client': 'Needs your input',
  closed: 'Closed',
} as const;
export type ClientRequestStatus = keyof typeof REQUEST_STATUSES;
export type OutlookDeliveryStatus = 'queued' | 'awaiting-configuration' | 'sending' | 'sent' | 'failed' | 'uncertain' | 'not-requested';
export const OUTLOOK_STATUS_LABELS: Record<OutlookDeliveryStatus, string> = {
  queued: 'Outlook queued', 'awaiting-configuration': 'Outlook setup required', sending: 'Sending to Outlook',
  sent: 'Accepted by Outlook', failed: 'Outlook delivery failed', uncertain: 'Outlook delivery unconfirmed', 'not-requested': 'In-app notification',
};
export interface AgreementTermSheet {
  scope: string;
  deliverables?: string;
  amount?: string;
  currency: string;
  paymentTerms?: string;
  startDate?: string;
  endDate?: string;
  renewalTerms?: string;
  terminationTerms?: string;
  governingLaw?: string;
  counterpartyAddress?: string;
  counterpartyContactEmail?: string;
  dataInvolved: 'none' | 'personal' | 'sensitive' | 'unsure';
  specialInstructions?: string;
}
export interface CreateClientRequest {
  submissionKey: string;
  title: string;
  counterparty: string;
  businessUnit: string;
  contractType: typeof AGREEMENT_TYPES[number];
  assignedLegalUserId: string;
  requestedByDate: string;
  urgency: 'standard' | 'urgent';
  terms: AgreementTermSheet;
}
export interface LegalTeamMember { id: string; name: string; email: string; roleLabel: string; }
export interface ClientRequest {
  id: string;
  title: string;
  counterparty: string;
  businessUnit: string;
  contractType: string;
  requester: Pick<AuthUser, 'id' | 'name' | 'email'>;
  assignedLegal: LegalTeamMember;
  requestedByDate: string;
  urgency: 'standard' | 'urgent';
  terms: AgreementTermSheet;
  status: ClientRequestStatus;
  legalNote?: string;
  contractId: string;
  contractStage: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  emailStatus: OutlookDeliveryStatus;
  canManage: boolean;
  canOpenAgreement: boolean;
}
export interface ClientRequestOptions {
  legalTeam: LegalTeamMember[];
  requester: Pick<AuthUser, 'id' | 'name' | 'email'>;
  canManage: boolean;
  canSeeAll: boolean;
  outlookConfigured: boolean;
  persistenceAvailable: boolean;
}
export interface ClientRequestList { items: ClientRequest[]; total: number; }
export interface InboxNotification {
  id: string; requestId: string; title: string; body: string; createdAt: string; readAt: string | null;
  emailStatus: OutlookDeliveryStatus;
}
export interface InboxResult { items: InboxNotification[]; unreadCount: number; }
