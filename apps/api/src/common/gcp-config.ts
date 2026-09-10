/** Explicit provider selection keeps existing deployments on their configured cloud. */
export function legalAiProvider(capability: 'review' | 'authoring'): 'gcp' | 'azure' | 'none' {
  const key = capability === 'review' ? 'AI_REVIEW_PROVIDER' : 'AUTHORING_PROVIDER';
  const explicit = process.env[key]?.trim().toLowerCase();
  if (explicit) {
    if (explicit === 'gcp' || explicit === 'azure' || explicit === 'none') return explicit;
    throw new Error(`${key} must be gcp, azure or none`);
  }
  // Historically review/drafting used Azure independently of CHAT_PROVIDER.
  if (process.env.CHAT_PROVIDER?.toLowerCase() === 'gcp') return 'gcp';
  return process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY ? 'azure' : 'none';
}

export function gcpSetting(name: string, fallback?: string): string {
  const value = process.env[name]?.trim() || fallback;
  if (!value || !/^[a-zA-Z0-9][a-zA-Z0-9._@-]{0,127}$/.test(value)) {
    throw new Error(`${name} must be configured with a valid resource identifier`);
  }
  return value;
}

export function gcpProjectId(): string { return gcpSetting('GCP_PROJECT_ID', process.env.GOOGLE_CLOUD_PROJECT); }
// Never silently send contracts to an unselected region or retired model.
export function gcpLocation(): string { return gcpSetting('GCP_LOCATION'); }
export function geminiModel(): string { return gcpSetting('GCP_GEMINI_MODEL'); }
export function geminiEmbeddingModel(): string { return gcpSetting('GCP_EMBEDDINGS_MODEL', 'gemini-embedding-001'); }

export function gcpConfigurationIssues(): string[] {
  const issues: string[] = [];
  const selected = ['CHAT_PROVIDER', 'EMBEDDINGS_PROVIDER', 'EXTRACT_PROVIDER', 'AI_REVIEW_PROVIDER', 'AUTHORING_PROVIDER']
    .some((key) => process.env[key]?.toLowerCase() === 'gcp');
  const ocr = process.env.OCR_PROVIDER?.toLowerCase() === 'gcp';
  const grounding = process.env.GCP_GROUNDING_CHECK === 'true';
  const check = (fn: () => unknown) => { try { fn(); } catch (e) { issues.push((e as Error).message); } };
  if (selected || ocr || grounding) check(gcpProjectId);
  if (selected) {
    check(gcpLocation);
    if (['CHAT_PROVIDER', 'EXTRACT_PROVIDER', 'AI_REVIEW_PROVIDER', 'AUTHORING_PROVIDER']
      .some((key) => process.env[key]?.toLowerCase() === 'gcp')) check(geminiModel);
    if (process.env.EMBEDDINGS_PROVIDER?.toLowerCase() === 'gcp') {
      check(geminiEmbeddingModel);
      const dim = Number(process.env.EMBEDDINGS_DIM || 768);
      if (!Number.isInteger(dim) || dim < 1 || dim > 3072) issues.push('GCP embeddings require EMBEDDINGS_DIM between 1 and 3072');
    }
  }
  if (ocr) {
    check(() => gcpSetting('GCP_DOCUMENT_AI_PROCESSOR'));
    check(() => gcpSetting('GCP_DOCUMENT_AI_LOCATION'));
  }
  if (grounding && process.env.GCP_GROUNDING_LOCATION !== 'global') {
    issues.push('GCP_GROUNDING_LOCATION=global must be explicitly selected for the optional grounding check');
  }
  if ((selected || ocr || grounding) && process.env.NODE_ENV === 'production' && process.env.GCP_ACCESS_TOKEN) {
    issues.push('Use the attached Cloud Run service account in production; GCP_ACCESS_TOKEN is for local tests only');
  }
  return issues;
}
