export interface NegotiationMetrics {
  agreements: { id: string; title: string; counterparty: string; rounds: number; changes: number; startedAt: string; completedAt?: string; elapsedDays: number; legalResponseHours: number | null; counterpartyResponseHours: number | null }[];
  completedCount: number; medianCompletionDays: number | null;
  legalResponseSamples: number; counterpartyResponseSamples: number;
  medianLegalHours: number | null; medianCounterpartyHours: number | null;
  clausePatterns: { topic: string; changes: number; agreementIds: string[] }[];
}
