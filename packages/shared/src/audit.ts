import { Role } from './roles';

/**
 * Immutable audit trail (assessment finding C2).
 *
 * Every legally- or security-significant action appends one AuditEvent to an
 * append-only, hash-chained log. Each event carries the hash of its predecessor,
 * so any insertion, deletion or edit anywhere in the history breaks the chain and
 * is detectable by `verify-integrity`. Events are never updated or removed.
 */

/** Who performed the action (from the authenticated JWT). */
export interface AuditActor {
  id?: string;
  email?: string;
  /** The user's role as presented on the token (before normalization). */
  role?: string;
}

/**
 * Provenance for an AI-assisted action — which model produced or influenced the
 * outcome, so an AI decision can be explained and challenged after the fact.
 */
export interface AuditAiProvenance {
  /** Capability that ran: chat | embeddings | extract | ocr | review | triage. */
  capability: string;
  /** Resolved provider, e.g. azure | bedrock | ollama | openai | local | none. */
  provider: string;
  /** Model / deployment identifier where known. */
  model?: string;
  /** Whether the output was advisory only (never an autonomous state change). */
  advisory?: boolean;
  /** Confidence 0–1 where the provider reports one. */
  confidence?: number;
}

/** A single, immutable entry in the audit chain. */
export interface AuditEvent {
  /** Stable event id. */
  id: string;
  /** Monotonic sequence number within the chain (1-based). */
  seq: number;
  /** ISO-8601 UTC timestamp. */
  at: string;
  actor: AuditActor;
  /** Verb, dotted + past-tense-ish, e.g. `esign.sent`, `approval.decided`. */
  action: string;
  /** Domain object type, e.g. `contract`, `signature`, `template`. */
  entity: string;
  /** Identifier of the affected object where applicable. */
  entityId?: string;
  /** Human-readable one-line summary for the log view. */
  summary: string;
  /** HTTP method + path when the event came from a request. */
  request?: { method: string; path: string; ip?: string; outcome: 'ok' | 'error' };
  /** Structured before/after or extra context (kept small; secrets redacted). */
  metadata?: Record<string, unknown>;
  /** AI provenance when the action was AI-assisted. */
  ai?: AuditAiProvenance;
  /** Correlation / request id, to trace an event back to a single request. */
  correlationId?: string;
  /** SHA-256 of the previous event's hash (genesis = 64 zeroes). */
  prevHash: string;
  /** SHA-256 over the canonical event body + prevHash. */
  hash: string;
}

/** Result of recomputing the chain to prove it has not been tampered with. */
export interface AuditVerifyResult {
  ok: boolean;
  count: number;
  /** seq of the first event whose hash/link does not recompute, if any. */
  brokenAt?: number;
  message: string;
}

export const AUDIT_GENESIS_HASH = '0'.repeat(64);

/** Roles permitted to read the audit trail (mirrors the `audit:read` permission). */
export const AUDIT_READER_ROLES: Role[] = ['admin', 'lead'];
