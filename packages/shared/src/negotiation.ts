import type { DraftSection } from './types';
import type { SectionChange } from './editing';
export interface GuestRoom {
  title: string; sharedBy: string; participant: string; organisation: string; documentId: string;
  round: number; sections: DraftSection[]; sharedAt: string; dueAt?: string; expiresAt: string;
  canDownload: boolean; canRedline: boolean; canUpload: boolean; canComment: boolean; canAccept: boolean; accepted: boolean;
  comments: { id: string; body: string; authorName: string; createdAt: string; resolvedAt?: string }[];
  response?: { id: string; createdAt: string; state: string; changes: SectionChange[] };
}
export interface NegotiationWorkspace {
  emailConfigured: boolean;
  invitations: { id: string; name: string; email: string; organisation: string; expiresAt: string; responseDueAt?: string; revokedAt?: string; viewedAt?: string; acceptedDocumentId?: string; roundId: string; allowDownload: boolean; allowRedline: boolean; allowUpload: boolean; deliveries: { status: string }[] }[];
  responses: { id: string; documentId: string; sections: DraftSection[]; originalSections: DraftSection[]; changes: SectionChange[]; source: string; state: string; reviewedAt?: string; createdAt: string; invitation: { name: string; organisation: string }; round: { number: number } }[];
  rounds: { id: string; number: number; documentId: string; sha256: string; createdAt: string }[];
}
