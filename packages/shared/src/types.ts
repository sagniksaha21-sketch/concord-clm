// ─── Concord CLM · shared domain types ──────────────────────────────────────
// Used by both the NestJS API and the Next.js web app so the contract between
// them is typed end to end.

export type RiskLevel = 'low' | 'medium' | 'high';

export type LifecycleStage =
  | 'intake'
  | 'drafting'
  | 'review'
  | 'approval'
  | 'signature'
  | 'active'
  | 'renewal';

export interface Contract {
  id: string;
  title: string;
  counterparty: string;
  type: string;
  valueDisplay: string;
  stage: LifecycleStage;
  risk: RiskLevel;
  version: string;
  source: string; // e.g. "received from counterparty"
  requestId?: string;
}

/** A clause the AI located in the document, with the span to highlight. */
export interface ClauseFinding {
  id: string;
  clauseNo: string;
  heading: string;
  excerpt: string;
  risk: RiskLevel;
  pin: string; // short marker rendered inline, e.g. "H1"
}

/** A redline the AI proposes for a clause. */
export interface Redline {
  original: string;
  suggested: string;
}

/** A deviation from the negotiation playbook. */
export interface Deviation {
  id: string;
  clauseNo: string;
  title: string;
  severity: RiskLevel;
  description: string;
  redline?: Redline;
  actionLabel: string;
}

export interface ExtractedTerm {
  key: string;
  value: string;
  flagged: boolean;
}

/** The full AI analysis for a contract. */
export interface AiReview {
  contractId: string;
  riskScore: number; // 0–100
  riskLevel: RiskLevel;
  clausesParsed: number;
  summary: string;
  extractedTerms: ExtractedTerm[];
  clauses: ClauseFinding[];
  deviations: Deviation[];
  model: string; // which model produced this ("built-in" | deployment name)
  documentId?: string;
  documentSha256?: string;
  contractVersion?: string;
}

/** Request to route a contract for approval and fire the Outlook notice. */
export interface ApprovalRequest {
  approvers: string[]; // email addresses
  note?: string;
  decision?: 'request' | 'approved';
}

export type NotificationStatus = 'sent' | 'dry-run' | 'failed';

export interface NotificationResult {
  channel: 'outlook-email';
  to: string[];
  subject: string;
  status: NotificationStatus;
  messageId?: string;
  dryRun: boolean;
  sentAt: string;
  detail?: string;
  /** Explicit provider rejection; a retry cannot duplicate an accepted email. */
  retrySafe?: boolean;
}

export interface ApprovalResult {
  contractId: string;
  routedTo: string[];
  notification: NotificationResult;
}

// ─── Obligations & renewals ──────────────────────────────────────────────────

export type ObligationStatus =
  | 'on-track'
  | 'due-soon'
  | 'at-risk'
  | 'scheduled'
  | 'done';

export type ObligationType =
  | 'financial'
  | 'compliance'
  | 'deliverable'
  | 'renewal'
  | 'signature';

export interface Obligation {
  id: string;
  title: string;
  contractId: string;
  contractTitle: string;
  ownerEmail: string;
  ownerInitials: string;
  dueDate: string; // ISO date
  status: ObligationStatus;
  type: ObligationType;
  risk: RiskLevel;
  outlookScheduled: boolean;
}

// ─── Repository search & natural-language Q&A ────────────────────────────────

export interface RepositoryHit {
  contract: Contract;
  snippet: string;
}

export interface Citation {
  contractId: string;
  label: string;
}

/** A passage retrieved by semantic (vector) search, with its similarity score. */
export interface RetrievedChunk {
  id: string;
  text: string;
  score: number; // cosine similarity, 0–1
  citations: Citation[];
}

/** How an answer was produced — surfaced in the UI for transparency. */
export interface RetrievalInfo {
  provider: string; // embeddings provider: local | ollama | azure | openai
  store: 'pgvector' | 'in-memory';
  model: string; // answer model: retrieval | ollama:… | azure:… | openai:…
  matched: number; // passages retrieved
}

export interface RepositoryAnswer {
  question: string;
  answer: string;
  citations: Citation[];
  matches?: RetrievedChunk[];
  retrieval?: RetrievalInfo;
}

/** Result of building / sending the scheduled obligations digest. */
export interface DigestResult {
  windowDays: number;
  count: number;
  subject: string;
  notification?: NotificationResult;
  html?: string;
}

// ─── Document intake & AI extraction ─────────────────────────────────────────

export interface PartyDetail {
  role: string;
  name: string;
  address: string;
  pan?: string;
  gstin?: string;
  panValid?: boolean;
  gstinValid?: boolean;
  gstinState?: string;
  crossCheckOk?: boolean;
}

export interface ExtractedAgreement {
  effectiveDate?: string;
  term?: string;
  expiryDate?: string;
  parties: PartyDetail[];
}

export interface ValidationFlag {
  field: 'PAN' | 'GSTIN' | 'cross-check';
  party: string;
  value: string;
  valid: boolean;
  detail: string;
}

export type IngestStatus = 'parsed' | 'needs-review' | 'failed' | 'quarantined';

/** Upload content-security verdict attached to an ingested file (finding H2). */
export interface IngestSecurity {
  detectedType: string;
  scan: 'clean' | 'infected' | 'unscanned';
  scanEngine: string;
  reason?: string;
}

export interface IngestResult {
  filename: string;
  documentType?: string;
  pages?: number;
  extraction: ExtractedAgreement;
  confidence: number;
  status: IngestStatus;
  validations: ValidationFlag[];
  notes: string[];
  model: string;
  /** Database document id for authorized download. */
  documentId?: string;
  /** Content-security verdict for real uploads (magic-byte + malware seam). */
  security?: IngestSecurity;
}

/** One document submitted to the ingest endpoint. */
export interface IngestDocumentInput {
  filename: string;
  contractId?: string;
  text?: string; // raw OCR text, when available
}

// ─── Intake (request → AI triage) ────────────────────────────────────────────

export type IntakeStatus = 'new' | 'triaged' | 'converted';

export interface IntakeRequest {
  id: string;
  title: string;
  counterparty: string;
  businessUnit: string;
  requestor: string;
  contractType: string;
  description: string;
  suggestedTemplateId?: string;
  triageRisk?: RiskLevel;
  status: IntakeStatus;
  createdAt: string;
}

// ─── Authoring (templates + clause library → draft) ──────────────────────────

export interface Clause {
  id: string;
  title: string;
  category: string;
  text: string;
  playbookStandard: boolean;
}

export interface Template {
  id: string;
  name: string;
  contractType: string;
  description: string;
  clauseIds: string[];
}

export interface DraftSection {
  heading: string;
  body: string;
}

export interface DraftResult {
  templateId: string;
  templateName: string;
  title: string;
  counterparty: string;
  sections: DraftSection[];
  usedClauses: string[];
  model: string;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface LoginResult {
  user: AuthUser;
}

// ─── E-signature & digital stamp paper (Melento) ─────────────────────────────

export type SignatureStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'partially-signed'
  | 'signed'
  | 'completed'
  | 'declined'
  | 'expired';

export interface Signatory {
  name: string;
  email: string;
  role: string; // e.g. "Lakmē Lever — Authorised Signatory", "Franchisee"
  order?: number; // 1-based signing order for sequential signing
  status?: SignatureStatus;
  signedAt?: string;
}

export type StampPaperStatus = 'not-required' | 'pending' | 'procured' | 'affixed';

/** Indian e-stamp paper procured through Melento for the agreement. */
export interface StampPaper {
  state: string; // state whose stamp duty applies, e.g. "Maharashtra"
  article?: string; // stamp article, e.g. "Art. 5(h) — Agreement"
  considerationAmount?: number; // ₹ value the duty is computed on
  dutyAmount: number; // stamp duty payable, ₹
  paidBy: string; // party bearing the duty
  certificateNo?: string; // e-stamp certificate no. returned by Melento
  status: StampPaperStatus;
}

export interface SignatureEvent {
  event: string; // created | stamp-procured | sent | viewed | signed | completed | declined
  at: string;
  by?: string;
  detail?: string;
}

export interface SignatureRequest {
  id: string;
  contractId: string;
  contractTitle: string;
  documentId?: string;
  documentSha256?: string;
  contractVersion?: string;
  signatories: Signatory[];
  stampPaper?: StampPaper;
  status: SignatureStatus;
  provider: 'melento' | 'stub';
  envelopeId?: string; // Melento envelope / transaction id
  signingUrl?: string; // link a signer opens
  message?: string;
  createdAt: string;
  sentAt?: string;
  completedAt?: string;
  lastNudgedAt?: string; // when Concord last auto-nudged the pending signatories
  audit: SignatureEvent[];
  /**
   * Optimistic-concurrency token. Every state change rewrites the whole row, so
   * without this two webhooks that interleave silently erase each other's
   * signature events. Set by the server; clients never send it.
   */
  version?: number;
}

export interface CreateSignatureInput {
  contractId: string;
  contractTitle?: string;
  signatories: Signatory[];
  message?: string;
  stampPaper?: Omit<StampPaper, 'status' | 'certificateNo'>;
}

/** A signatory as recorded on the executed document in the archive. */
export interface ArchivedSignatory {
  name: string;
  role: string;
  signedAt?: string;
}

/**
 * A fully-executed agreement filed into the signed-document archive on
 * completion: the sealed record, its storage key and a SHA-256 integrity seal.
 */
export interface ArchivedDocument {
  id: string;
  requestId: string;
  contractId: string;
  contractTitle: string;
  signatories: ArchivedSignatory[];
  stampCertificateNo?: string;
  stampState?: string;
  completedAt: string;
  archivedAt: string;
  storageKey: string; // key in the document store (Blob / S3 / disk)
  checksum: string; // SHA-256 of the archived record — tamper-evidence
  format: string; // MIME type of the archived record
  filename?: string; // provider-returned executed agreement filename
  size: number; // bytes
  /** Records retained until this date under the retention schedule (finding H2/PRA). */
  retentionUntil?: string;
  /** When true, the record is under legal hold — retention/disposal is suspended. */
  legalHold?: boolean;
}

// ─── Command Center, pipeline, search & notifications ────────────────────────

/** One KPI tile on the Command Center. */
export interface DashboardStat {
  key: string;
  label: string;
  /** Pre-formatted for display (e.g. "₹1,240 Cr"), so the UI does no maths. */
  value: string;
  /** Optional unit rendered smaller beside the value. */
  unit?: string;
  trend?: { direction: 'up' | 'down' | 'flat'; label: string };
}

/** Counts per lifecycle stage, for the in-flight funnel. */
export interface PipelineStageCount {
  stage: string;
  label: string;
  count: number;
}

export interface RiskDistribution {
  low: number;
  medium: number;
  high: number;
}

/** A row in "needs attention" — something a human has to act on. */
export interface AttentionItem {
  id: string;
  title: string;
  counterparty: string;
  valueDisplay: string;
  stage: string;
  risk: RiskLevel;
  keyDate: string;
  href?: string;
}

/** A derived observation shown in the AI insights feed. Advisory only. */
export interface DashboardInsight {
  id: string;
  body: string;
  at: string;
  tone: 'info' | 'warn' | 'risk';
}

export interface DashboardSummary {
  greetingName?: string;
  stats: DashboardStat[];
  pipeline: PipelineStageCount[];
  risk: RiskDistribution;
  attention: AttentionItem[];
  renewals: Obligation[];
  insights: DashboardInsight[];
  /** True when any figure above is derived from demo fixtures rather than real records. */
  sampleData: boolean;
  generatedAt: string;
}

/** One card on the lifecycle pipeline board. */
export interface PipelineCard {
  id: string;
  title: string;
  counterparty: string;
  valueDisplay: string;
  risk: RiskLevel;
  stage: string;
  /** The contract's document version (e.g. "v3") — shown on the card foot. */
  versionLabel?: string;
  href?: string;
}

export interface PipelineLane {
  stage: string;
  label: string;
  /** Hex or CSS var for the lane dot — chosen server-side so lanes stay consistent. */
  tone: 'neutral' | 'info' | 'med' | 'low' | 'high';
  cards: PipelineCard[];
}

export interface PipelineBoard {
  lanes: PipelineLane[];
  total: number;
  sampleData: boolean;
}

export type SearchKind =
  | 'contract'
  | 'template'
  | 'clause'
  | 'intake'
  | 'document'
  | 'signature'
  | 'obligation';

export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string;
  href?: string;
  badge?: string;
  badgeTone?: 'low' | 'med' | 'high' | 'info' | 'neutral';
}

export interface SearchResult {
  query: string;
  count: number;
  hits: SearchHit[];
  /** Entity kinds omitted because the caller's role cannot read them. */
  restricted: SearchKind[];
}

/** A notification Concord sent (or would have sent) through Outlook. */
export interface NotificationRecord {
  id: string;
  at: string;
  kind: string;
  summary: string;
  recipients: string[];
  status: 'sent' | 'dry-run' | 'failed' | 'unknown';
  entity?: string;
  entityId?: string;
}

/** Badge counts for the sidebar. Cheap to compute, safe for any signed-in role. */
export interface NavCounts {
  intake: number;
  pipeline: number;
  review: number;
  obligations: number;
  esign: number;
  notifications: number;
}

// ─── Portfolio reporting ─────────────────────────────────────────────────────

/** Formats supported by the protected portfolio report endpoint. */
export type ReportFormat = 'xlsx' | 'pdf' | 'pptx';

export interface ReportMetric {
  key: string;
  label: string;
  value: number;
  displayValue: string;
  detail?: string;
}

export interface ReportInsight {
  id: string;
  title: string;
  body: string;
  tone: 'info' | 'watch' | 'risk';
  /** Rules are traceable portfolio heuristics; AI is advisory narrative only. */
  source?: 'rules' | 'ai';
  /** Record IDs supporting the observation; never model-invented metrics. */
  evidenceIds?: string[];
  /** Provider-reported confidence, 0–1, when this is an AI observation. */
  confidence?: number;
}

export interface ReportAiMeta {
  status: 'disabled' | 'generated' | 'fallback';
  provider: 'none' | 'gcp';
  model?: string;
  generatedAt?: string;
  /** Short advisory context shown to users and in exports. */
  summary?: string;
  advisoryOnly: true;
}

/** A report row deliberately contains metadata, not contract source text. */
export interface ReportAgreementRow {
  id: string;
  title: string;
  counterparty: string;
  type: string;
  valueDisplay: string;
  stage: string;
  risk: RiskLevel;
  version: string;
  source: string;
  obligationCount: number;
  nextDueDate?: string;
  signatureStatus?: string;
}

export interface ReportObligationRow {
  id: string;
  contractId: string;
  contractTitle: string;
  title: string;
  dueDate: string;
  status: ObligationStatus;
  type: ObligationType;
  risk: RiskLevel;
  ownerEmail: string;
}

export interface ReportSignatureRow {
  id: string;
  contractId: string;
  contractTitle: string;
  status: SignatureStatus;
  provider: string;
  signatoryCount: number;
  createdAt: string;
  completedAt?: string;
}

/** Preview payload shared by the Reports page and all three exports. */
export interface PortfolioReport {
  scope: 'portfolio';
  generatedAt: string;
  dataMode: 'live' | 'illustrative';
  sampleData: boolean;
  restricted: string[];
  options?: Required<import('./reporting').ReportOptions>;
  selectionSummary?: string;
  availableAgreements?: number;
  /** Optional so older API snapshots remain backwards-compatible. */
  ai?: ReportAiMeta;
  metrics: ReportMetric[];
  insights: ReportInsight[];
  stageCounts: PipelineStageCount[];
  risk: RiskDistribution;
  agreements: ReportAgreementRow[];
  obligations: ReportObligationRow[];
  signatures: ReportSignatureRow[];
}
