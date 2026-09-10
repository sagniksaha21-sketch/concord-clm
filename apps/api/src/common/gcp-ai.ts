import { fetchWithTimeout } from './http';
import { gcpProjectId, gcpLocation, gcpSetting, geminiModel, geminiEmbeddingModel } from './gcp-config';

/** Native REST client using an attached Cloud Run identity, or a local short-lived token. */
let cachedToken: { value: string; expiresAt: number } | undefined;
let pendingToken: Promise<string> | undefined;
export async function gcpAccessToken(): Promise<string> {
  if (process.env.GCP_ACCESS_TOKEN) {
    if (process.env.NODE_ENV === 'production') throw new Error('Use workload identity for GCP in production');
    return process.env.GCP_ACCESS_TOKEN;
  }
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  if (pendingToken) return pendingToken;
  pendingToken = (async () => {
    const response = await fetchWithTimeout(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      { headers: { 'Metadata-Flavor': 'Google' }, redirect: 'error' }, 3_000,
    );
    if (!response.ok) throw new Error(`Google Cloud identity unavailable (${response.status})`);
    const data = await response.json() as any;
    if (typeof data.access_token !== 'string' || !data.access_token || !Number.isFinite(data.expires_in) || data.expires_in <= 0) {
      throw new Error('Google Cloud identity returned an invalid token response');
    }
    cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return cachedToken.value;
  })();
  try { return await pendingToken; } finally { pendingToken = undefined; }
}

function modelUrl(model: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._@-]{0,127}$/.test(model)) throw new Error('Invalid Google model identifier');
  const location = gcpLocation();
  const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
  return `https://${host}/v1/projects/${gcpProjectId()}/locations/${location}/publishers/google/models/${model}`;
}

/** One bounded retry for an explicit transient response; never log provider bodies or credentials. */
async function gcpJson(url: string, body: unknown, budgetMs = 45_000): Promise<any> {
  const deadline = Date.now() + budgetMs;
  const serialized = JSON.stringify(body);
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await gcpAccessToken();
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Google Cloud AI request exceeded its deadline');
    const res = await fetchWithTimeout(url, {
      method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: serialized,
    }, remaining);
    if (res.ok) return res.json();
    await res.body?.cancel();
    if (attempt === 0 && [429, 502, 503, 504].includes(res.status)) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const delay = Math.max(250, Math.min(2000, Number.isFinite(retryAfter) ? retryAfter * 1000 : 500));
      if (Date.now() + delay < deadline) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
    }
    throw new Error(`Google Cloud AI request failed (${res.status}); check model access, quotas and processor limits`);
  }
  throw new Error('Google Cloud AI request failed');
}

export type GeminiSchema = Record<string, unknown>;

export async function generateWithGemini(args: {
  system: string; user: string; model?: string; temperature?: number;
  maxOutputTokens?: number; json?: boolean; schema?: GeminiSchema;
}): Promise<{ text: string; model: string }> {
  const model = args.model || geminiModel();
  const data = await gcpJson(`${modelUrl(model)}:generateContent`, {
    systemInstruction: { parts: [{ text: args.system }] },
    contents: [{ role: 'user', parts: [{ text: args.user }] }],
    generationConfig: {
      temperature: args.temperature ?? 0.1, maxOutputTokens: args.maxOutputTokens ?? 4096,
      ...(args.json || args.schema ? { responseMimeType: 'application/json' } : {}),
      ...(args.schema ? { responseSchema: args.schema } : {}),
    },
  });
  const candidate = data?.candidates?.[0];
  if (data?.promptFeedback?.blockReason || candidate?.finishReason !== 'STOP' ||
      candidate?.safetyRatings?.some((rating: any) => rating.blocked)) {
    throw new Error('Gemini did not return a complete, unblocked answer');
  }
  const text = (Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [])
    .filter((part: any) => !part.thought && typeof part.text === 'string')
    .map((part: any) => part.text).join('').trim();
  if (!text) throw new Error('Gemini returned no answer text');
  if (args.json || args.schema) {
    try { JSON.parse(text); } catch { throw new Error('Gemini returned invalid JSON'); }
  }
  return { text, model: typeof data.modelVersion === 'string' ? data.modelVersion : model };
}

export type EmbeddingTask = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';
export async function embedWithGemini(texts: string[], dim: number, task: EmbeddingTask = 'RETRIEVAL_DOCUMENT'):
Promise<{ vectors: number[][]; model: string }> {
  const model = geminiEmbeddingModel();
  if (!Number.isInteger(dim) || dim < 1 || dim > 3072) throw new Error('Invalid GCP embedding dimension');
  const vectors: number[][] = [];
  // Gemini's predict endpoint accepts a single text per call. Sequential batches
  // avoid unbounded provider fan-out and preserve order without mixing models.
  for (const content of texts) {
    const data = await gcpJson(`${modelUrl(model)}:predict`, {
      instances: [{ content, task_type: task }],
      parameters: { autoTruncate: false, outputDimensionality: dim },
    }, 20_000);
    const embedding = data?.predictions?.[0]?.embeddings;
    const v = embedding?.values;
    if (data?.predictions?.length !== 1 || embedding?.statistics?.truncated || !Array.isArray(v) ||
      v.length !== dim || !v.every((x: unknown) => typeof x === 'number' && Number.isFinite(x)) ||
      !v.some((x: number) => x !== 0)) throw new Error('Gemini returned invalid or truncated embeddings');
    vectors.push(v);
  }
  return { vectors, model };
}

export async function processWithDocumentAi(args: { buffer: Buffer; mimeType: string; processor?: string }):
Promise<{ text: string; model: string; pages: number }> {
  const project = gcpProjectId();
  const location = gcpSetting('GCP_DOCUMENT_AI_LOCATION');
  const processor = gcpSetting('GCP_DOCUMENT_AI_PROCESSOR', args.processor);
  const version = process.env.GCP_DOCUMENT_AI_PROCESSOR_VERSION ? gcpSetting('GCP_DOCUMENT_AI_PROCESSOR_VERSION') : undefined;
  if (args.buffer.length > 20 * 1024 * 1024) throw new Error('Document AI online OCR is limited to 20 MiB; use a reviewed batch-processing workflow for larger agreements');
  const resource = `projects/${project}/locations/${location}/processors/${processor}${version ? `/processorVersions/${version}` : ''}`;
  const data = await gcpJson(`https://${location}-documentai.googleapis.com/v1/${resource}:process`, {
    rawDocument: { content: args.buffer.toString('base64'), mimeType: args.mimeType },
    imagelessMode: true, fieldMask: 'text,pages.pageNumber',
  });
  if (data?.error || typeof data?.document?.text !== 'string' || !data.document.text.trim()) {
    throw new Error('Document AI returned no complete extracted text');
  }
  return { text: data.document.text, model: `document-ai:${processor}${version ? `:${version}` : ''}`,
    pages: Array.isArray(data.document.pages) ? data.document.pages.length : 0 };
}

/** Optional Google grounding verification; caller supplies only its authorized retrieved passages. */
export async function checkGoogleGrounding(answer: string, facts: Array<{ id: string; text: string }>): Promise<number> {
  if (process.env.GCP_GROUNDING_LOCATION !== 'global') throw new Error('Explicit global grounding location is required');
  const data = await gcpJson(`https://discoveryengine.googleapis.com/v1/projects/${gcpProjectId()}/locations/global/groundingConfigs/default_grounding_config:check`, {
    answerCandidate: answer,
    facts: facts.map((fact) => ({ factText: fact.text, attributes: { source: fact.id } })),
    groundingSpec: { citationThreshold: 0.8 },
  }, 20_000);
  if (!Number.isFinite(data?.supportScore) || data.supportScore < 0 || data.supportScore > 1) {
    throw new Error('Google grounding returned an invalid support score');
  }
  return data.supportScore;
}
