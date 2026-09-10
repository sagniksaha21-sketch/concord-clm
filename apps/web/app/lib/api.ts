import type {
  AiReview,
  ApprovalResult,
  AuthUser,
  Clause,
  Contract,
  DigestResult,
  NotificationResult,
  DraftResult,
  IngestDocumentInput,
  IngestResult,
  IntakeRequest,
  LoginResult,
  Obligation,
  RepositoryAnswer,
  RepositoryHit,
  RetrievedChunk,
  ArchivedDocument,
  CreateSignatureInput,
  SignatureRequest,
  Template,
  DashboardSummary,
  NavCounts,
  NotificationRecord,
  PipelineBoard,
  Permission,
  Role,
  SearchResult,
  PortfolioReport,
  ReportFormat,
} from '@concord/shared';

// Browser calls stay same-origin and are proxied by Next.js to the API. This
// keeps the HttpOnly session cookie host-only and removes cross-origin token
// plumbing from the client. Server components use API_INTERNAL_BASE directly.
export const API_BASE = '';
const SERVER_API_BASE =
  process.env.API_INTERNAL_BASE ??
  process.env.NEXT_PUBLIC_API_BASE ??
  'http://localhost:4000';

/** Browser-side request deadline. */
const CLIENT_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS) || 30_000;
async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  const signal = init.signal ?? (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(CLIENT_TIMEOUT_MS) : undefined);
  const target = typeof window === 'undefined' && input.startsWith('/')
    ? `${SERVER_API_BASE.replace(/\/$/, '')}${input}`
    : input;
  return fetch(target, { ...init, headers, signal, credentials: init.credentials ?? 'include' });
}


export interface HealthReady {
  status: 'ready' | 'degraded';
  checks: Record<string, unknown>;
  degradedModes: string[];
  time: string;
}

export async function getHealthReady(): Promise<HealthReady> {
  const res = await apiFetch(`${API_BASE}/api/health/ready`, { cache: 'no-store' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { status: 'degraded', checks: body?.checks ?? {}, degradedModes: body?.degradedModes ?? [], time: body?.time ?? new Date().toISOString() };
  return body;
}

export async function getContracts(token?: string): Promise<Contract[]> {
  const res = await apiFetch(`${API_BASE}/api/contracts`, {
    cache: 'no-store',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error(`Contracts unavailable (${res.status})`);
  return res.json();
}

/** `token` is passed by server components (SSR has no localStorage; it forwards the cookie). */
export async function getContract(id: string, token?: string): Promise<Contract> {
  const res = await apiFetch(`${API_BASE}/api/contracts/${id}`, {
    cache: 'no-store',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error(`Failed to load contract ${id} (${res.status})`);
  return res.json();
}

export async function getReview(id: string, token?: string): Promise<AiReview> {
  const res = await apiFetch(`${API_BASE}/api/contracts/${id}/review`, {
    cache: 'no-store',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error(`Failed to load review for ${id} (${res.status})`);
  return res.json();
}

export async function searchRepository(q: string): Promise<RepositoryHit[]> {
  const res = await apiFetch(
    `${API_BASE}/api/repository/search?q=${encodeURIComponent(q)}`,
    { cache: 'no-store' },
  );
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  return res.json();
}

export async function getRepositoryDocuments(q: string): Promise<ArchivedDocument[]> {
  const res = await apiFetch(
    `${API_BASE}/api/repository/documents?q=${encodeURIComponent(q)}`,
    { cache: 'no-store' },
  );
  if (!res.ok) throw new Error(`Document search failed (${res.status})`);
  return res.json();
}

export async function askRepository(question: string): Promise<RepositoryAnswer> {
  const res = await apiFetch(`${API_BASE}/api/repository/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) throw new Error(`Ask failed (${res.status})`);
  return res.json();
}

export async function getObligations(token?: string): Promise<Obligation[]> {
  const res = await apiFetch(`${API_BASE}/api/obligations`, {
    cache: 'no-store',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error(`Failed to load obligations (${res.status})`);
  return res.json();
}

export async function getSignatures(): Promise<SignatureRequest[]> {
  const res = await apiFetch(`${API_BASE}/api/esign`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load signatures (${res.status})`);
  return res.json();
}

export async function createSignature(body: CreateSignatureInput): Promise<SignatureRequest> {
  const res = await apiFetch(`${API_BASE}/api/esign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function advanceSignature(id: string): Promise<SignatureRequest> {
  const res = await apiFetch(`${API_BASE}/api/esign/${id}/advance`, { method: 'POST' });
  if (!res.ok) throw new Error(`Advance failed (${res.status})`);
  return res.json();
}

export async function getArchive(): Promise<ArchivedDocument[]> {
  const res = await apiFetch(`${API_BASE}/api/esign/archive`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load archive (${res.status})`);
  return res.json();
}

export const archiveFileUrl = (id: string) => `${API_BASE}/api/esign/archive/${id}/file`;

export async function semanticSearch(q: string, k = 5): Promise<RetrievedChunk[]> {
  const res = await apiFetch(
    `${API_BASE}/api/repository/semantic?q=${encodeURIComponent(q)}&k=${k}`,
    { cache: 'no-store' },
  );
  if (!res.ok) throw new Error(`Semantic search failed (${res.status})`);
  return res.json();
}

export async function sendObligationsDigest(days = 90): Promise<DigestResult> {
  const res = await apiFetch(`${API_BASE}/api/obligations/digest/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ days }),
  });
  if (!res.ok) throw new Error(`Digest failed (${res.status})`);
  return res.json();
}

/**
 * Fire a single obligation reminder through Outlook.
 *
 * This and `requestApproval` below exist because the three buttons that call
 * them (`RemindButton`, `DigestButton`, `ApproveBar`) each used a bare `fetch`.
 * That skipped `apiFetch`, so no `Authorization: Bearer` header was attached and
 * all three endpoints — which carry `@Roles('contract:write')` and
 * `@Roles('approve')` — answered **401**. Every one of those buttons was dead in
 * the browser. Nothing in the suite caught it, because `check-invariants.js`
 * scanned `apps/web/app` but not `apps/web/components`.
 */
export async function remindObligation(id: string): Promise<NotificationResult> {
  const res = await apiFetch(`${API_BASE}/api/obligations/${encodeURIComponent(id)}/remind`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw new Error(`Reminder failed (${res.status})`);
  return res.json();
}

export async function requestApproval(
  contractId: string,
  body: { approvers: string[]; note?: string; decision?: string },
): Promise<ApprovalResult> {
  const res = await apiFetch(
    `${API_BASE}/api/contracts/${encodeURIComponent(contractId)}/approval`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(`Approval routing failed (${res.status})`);
  return res.json();
}

export async function getSampleIngest(): Promise<IngestResult[]> {
  const res = await apiFetch(`${API_BASE}/api/ingest/samples`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Sample ingest failed (${res.status})`);
  return res.json();
}

export async function ingestDocuments(
  documents: IngestDocumentInput[],
): Promise<IngestResult[]> {
  const res = await apiFetch(`${API_BASE}/api/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documents }),
  });
  if (!res.ok) throw new Error(`Ingest failed (${res.status})`);
  return res.json();
}

export async function uploadFiles(files: File[]): Promise<IngestResult[]> {
  const fd = new FormData();
  files.forEach((f) => fd.append('files', f));
  const res = await apiFetch(`${API_BASE}/api/ingest/upload`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  return res.json();
}

export async function getIntake(): Promise<IntakeRequest[]> {
  const res = await apiFetch(`${API_BASE}/api/intake`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load intake (${res.status})`);
  return res.json();
}

export interface CreateIntakeInput {
  title: string;
  counterparty: string;
  businessUnit: string;
  requestor: string;
  description: string;
  contractType?: string;
}

export async function createIntake(body: CreateIntakeInput): Promise<IntakeRequest> {
  const res = await apiFetch(`${API_BASE}/api/intake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getTemplates(): Promise<Template[]> {
  const res = await apiFetch(`${API_BASE}/api/authoring/templates`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load templates (${res.status})`);
  return res.json();
}

export async function getClauses(): Promise<Clause[]> {
  const res = await apiFetch(`${API_BASE}/api/authoring/clauses`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load clauses (${res.status})`);
  return res.json();
}

export async function generateDraft(body: {
  templateId: string;
  counterparty: string;
  title?: string;
}): Promise<DraftResult> {
  const res = await apiFetch(`${API_BASE}/api/authoring/draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Draft failed (${res.status})`);
  return res.json();
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const res = await apiFetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error('Invalid email or password');
  return res.json();
}


export async function logout(): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/auth/logout`, { method: 'POST' });
  if (!res.ok) throw new Error(`Logout failed (${res.status})`);
}

export async function getMe(token?: string): Promise<AuthUser> {
  const res = await apiFetch(`${API_BASE}/api/auth/me`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error('Not authenticated');
  return res.json();
}

export type TemplateInput = {
  id?: string;
  name: string;
  contractType: string;
  description?: string;
  clauseIds?: string[];
};

export async function createTemplate(body: TemplateInput): Promise<Template> {
  const res = await apiFetch(`${API_BASE}/api/authoring/templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateTemplate(id: string, body: TemplateInput): Promise<Template> {
  const res = await apiFetch(`${API_BASE}/api/authoring/templates/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteTemplate(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/authoring/templates/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Delete failed (${res.status})`);
}

// ─── Command Center, pipeline, search, notifications ─────────────────────────
// `token` is accepted on each of these so server components can forward the
// session cookie; client components pass nothing and the Bearer wrapper applies.

const auth = (token?: string) => (token ? { Authorization: `Bearer ${token}` } : undefined);

export async function getDashboard(token?: string): Promise<DashboardSummary> {
  const res = await apiFetch(`${API_BASE}/api/dashboard`, { cache: 'no-store', headers: auth(token) });
  if (!res.ok) throw new Error(`Dashboard unavailable (${res.status})`);
  return res.json();
}

export async function getPipeline(token?: string): Promise<PipelineBoard> {
  const res = await apiFetch(`${API_BASE}/api/pipeline`, { cache: 'no-store', headers: auth(token) });
  if (!res.ok) throw new Error(`Pipeline unavailable (${res.status})`);
  return res.json();
}

export async function search(q: string, token?: string): Promise<SearchResult> {
  const res = await apiFetch(
    `${API_BASE}/api/search?q=${encodeURIComponent(q)}`,
    { cache: 'no-store', headers: auth(token) },
  );
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  return res.json();
}

export async function getNotifications(token?: string): Promise<NotificationRecord[]> {
  const res = await apiFetch(`${API_BASE}/api/notifications`, { cache: 'no-store', headers: auth(token) });
  if (!res.ok) throw new Error(`Notifications unavailable (${res.status})`);
  return res.json();
}

export async function getNavCounts(token?: string): Promise<NavCounts> {
  const res = await apiFetch(`${API_BASE}/api/nav-counts`, { cache: 'no-store', headers: auth(token) });
  if (!res.ok) throw new Error(`Counts unavailable (${res.status})`);
  return res.json();
}

export async function getPermissions(
  token?: string,
): Promise<{ role: Role; label: string; permissions: Permission[] }> {
  const res = await apiFetch(`${API_BASE}/api/auth/permissions`, { cache: 'no-store', headers: auth(token) });
  if (!res.ok) throw new Error(`Permissions unavailable (${res.status})`);
  return res.json();
}

// ─── Portfolio reporting ─────────────────────────────────────────────────────

export async function getPortfolioReport(token?: string): Promise<PortfolioReport> {
  const res = await apiFetch(`${API_BASE}/api/reports/portfolio`, {
    cache: 'no-store',
    headers: auth(token),
  });
  if (!res.ok) throw new Error(`Reports unavailable (${res.status})`);
  return res.json();
}

/** Fetches a role-scoped binary report while preserving the HttpOnly session. */
export async function downloadPortfolioReport(format: ReportFormat, token?: string): Promise<Response> {
  const res = await apiFetch(`${API_BASE}/api/reports/portfolio/${format}`, {
    cache: 'no-store',
    headers: auth(token),
  });
  if (!res.ok) throw new Error(`Report export failed (${res.status})`);
  return res;
}

// ─── Audit trail ─────────────────────────────────────────────────────────────

export interface AuditEventRow {
  id: string;
  seq: number;
  at: string;
  actor: { id?: string; email?: string; role?: string };
  action: string;
  entity: string;
  entityId?: string;
  summary: string;
  prevHash: string;
  hash: string;
}

export interface AuditPage {
  total: number;
  limit: number;
  offset: number;
  count: number;
  events: AuditEventRow[];
}

export interface AuditVerifyResult {
  ok: boolean;
  count: number;
  brokenAt?: number;
  message: string;
}

export async function getAuditPage(
  opts: { limit?: number; offset?: number; action?: string } = {},
  token?: string,
): Promise<AuditPage> {
  const qs = new URLSearchParams();
  if (opts.limit) qs.set('limit', String(opts.limit));
  if (opts.offset) qs.set('offset', String(opts.offset));
  if (opts.action?.trim()) qs.set('action', opts.action.trim());
  const res = await apiFetch(`${API_BASE}/api/audit?${qs}`, { cache: 'no-store', headers: auth(token) });
  if (res.status === 403) throw new Error('Your role cannot read the audit trail.');
  if (!res.ok) throw new Error(`Audit unavailable (${res.status})`);
  return res.json();
}

export async function verifyAudit(token?: string): Promise<AuditVerifyResult> {
  const res = await apiFetch(`${API_BASE}/api/audit/verify`, { cache: 'no-store', headers: auth(token) });
  if (!res.ok) throw new Error(`Verification unavailable (${res.status})`);
  return res.json();
}
