import { Logger } from '@nestjs/common';

/**
 * Boot-time security posture (assessment: identity/secret hardening).
 *
 * In production, Concord refuses to start with placeholder secrets or demo
 * accounts left enabled. In dev it warns but runs, so the demo stays friction-free.
 */

const PLACEHOLDER_SECRETS = new Set([
  'dev-secret-change-me',
  'changeme',
  'secret',
  'password',
  '',
]);

/** Substrings that mark a value as an obvious non-production placeholder. */
const PLACEHOLDER_PATTERNS = ['change-me', 'changeme', 'local-dev', 'placeholder', 'example', 'sample', 'test-secret'];

function isPlaceholderSecret(secret: string): boolean {
  const s = secret.toLowerCase();
  if (PLACEHOLDER_SECRETS.has(secret)) return true;
  return PLACEHOLDER_PATTERNS.some((p) => s.includes(p));
}

export function isProduction(): boolean {
  return (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
}

/**
 * Active degraded / fallback / dry-run modes — surfaced at boot and via the
 * readiness endpoint so a fallback can never silently masquerade as real
 * processing in production (GPT 5.6 P0 #8).
 */
export function degradedModes(): string[] {
  const m: string[] = [];
  const env = process.env;
  if (!env.DATABASE_URL) m.push('persistence: in-memory (no DATABASE_URL)');
  if (!(env.AZURE_STORAGE_CONNECTION_STRING || env.AZURE_STORAGE_ACCOUNT_URL || env.AWS_S3_BUCKET)) m.push('storage: local-disk (no Blob/S3)');
  // Must mirror graph.client.ts exactly — a partial config previously reported
  // "healthy" while every email silently dry-ran.
  if (!(env.AZURE_TENANT_ID && env.AZURE_CLIENT_ID && env.AZURE_CLIENT_SECRET && env.GRAPH_SENDER_UPN)) {
    m.push('notifications: dry-run (Microsoft Graph not fully configured)');
  }
  const chat = (env.CHAT_PROVIDER || '').toLowerCase();
  if (!chat || chat === 'local' || chat === 'none') m.push('AI answers: deterministic/local fallback');
  const emb = (env.EMBEDDINGS_PROVIDER || '').toLowerCase();
  if (!emb || emb === 'local') m.push('embeddings: local fallback');
  const ocr = (env.OCR_PROVIDER || '').toLowerCase();
  if (!ocr || ocr === 'none') m.push('OCR: none (no text extraction from scans)');
  // Mirrors MelentoService.enabled (key AND base URL) — with only the key set the
  // service runs in stub mode and would emit fake e-stamp certificates.
  if (!(env.MELENTO_API_KEY && env.MELENTO_BASE_URL)) {
    m.push('e-signature: Melento stub (API key + base URL not both set)');
  }
  // The webhook is fail-closed without this, so an unset secret is a real gap.
  if (env.MELENTO_API_KEY && !env.MELENTO_WEBHOOK_SECRET) {
    m.push('e-signature: webhook callbacks rejected (MELENTO_WEBHOOK_SECRET unset)');
  }
  return m;
}

/**
 * Demo email/password login is on in dev, and off in production unless the
 * operator explicitly opts in (AUTH_ALLOW_DEMO_USERS=true). Production is meant
 * to run on Entra ID SSO.
 */
export function demoLoginEnabled(): boolean {
  if (process.env.AUTH_ALLOW_DEMO_USERS === 'true') return true;
  if (process.env.AUTH_DISABLE_DEMO_USERS === 'true') return false;
  return !isProduction();
}

interface ConfigIssue {
  level: 'error' | 'warn';
  message: string;
}

/** Collects posture issues without throwing (used by the boot check and tests). */
export function inspectSecurityConfig(): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const prod = isProduction();
  const scannerConfigured = Boolean(process.env.MALWARE_SCAN_URL || process.env.CLAMAV_HOST);
  const secret = process.env.AUTH_JWT_SECRET ?? '';

  if (isPlaceholderSecret(secret) || secret.length < (prod ? 32 : 16)) {
    issues.push({
      level: prod ? 'error' : 'warn',
      message:
        `AUTH_JWT_SECRET is unset, a known placeholder, or too short (<${prod ? 32 : 16} chars). ` +
        'Set a strong random secret (32+ chars) from Key Vault.',
    });
  }


  if (prod && process.env.AUTH_ALLOW_DEMO_USERS === 'true') {
    issues.push({
      level: 'error',
      message:
        'AUTH_ALLOW_DEMO_USERS=true enables password demo accounts in production. ' +
        'Production authentication must use Entra ID SSO.',
    });
  }

  if (prod && !(process.env.ENTRA_TENANT_ID && process.env.ENTRA_CLIENT_ID && process.env.ENTRA_CLIENT_SECRET && process.env.ENTRA_REDIRECT_URI)) {
    issues.push({ level: 'error', message: 'Entra SSO is not fully configured (ENTRA_TENANT_ID, ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET, ENTRA_REDIRECT_URI are required).' });
  }

  if (prod && process.env.ENTRA_ALLOW_UNMAPPED_VIEWERS === 'true') {
    issues.push({
      level: 'error',
      message: 'ENTRA_ALLOW_UNMAPPED_VIEWERS=true grants contract:read to any authenticated but unmapped tenant user. Production must deny unmapped identities and require an explicit Concord role claim/map.',
    });
  }

  if (prod && !process.env.WEB_ORIGIN) {
    issues.push({
      level: 'error',
      message: 'WEB_ORIGIN is required in production for CORS and browser-origin enforcement.',
    });
  } else if (prod) {
    for (const origin of (process.env.WEB_ORIGIN ?? '').split(',').map((x) => x.trim()).filter(Boolean)) {
      if (!/^https:\/\//i.test(origin)) {
        issues.push({ level: 'error', message: `WEB_ORIGIN must use HTTPS in production: ${origin}` });
      }
    }
  }

  if (prod && process.env.AUTH_COOKIE_DOMAIN) {
    issues.push({
      level: 'warn',
      message:
        'AUTH_COOKIE_DOMAIN is set. Prefer a host-only session cookie and proxy /api through the web origin; ' +
        'a parent-domain cookie is visible to more sibling hosts.',
    });
  }

  if (prod && process.env.DOWNLOAD_LINK_SECRET && process.env.DOWNLOAD_LINK_SECRET.length < 16) {
    issues.push({
      level: 'warn',
      message: 'DOWNLOAD_LINK_SECRET is short — signed download links are weaker than they should be.',
    });
  }

  // Approval callbacks must never be accepted unauthenticated in production.
  if (prod && process.env.ACTIONABLE_ENFORCE_TOKEN === 'false') {
    issues.push({
      level: 'error',
      message:
        'ACTIONABLE_ENFORCE_TOKEN=false disables verification on the public approval ' +
        'callback. This must not be set in production.',
    });
  }

  if (prod && !process.env.APPROVAL_CALLBACK_URL) {
    issues.push({ level: 'error', message: 'APPROVAL_CALLBACK_URL is required in production; localhost callback fallback is forbidden.' });
  }
  if (prod && process.env.APPROVAL_CALLBACK_URL && !/^https:\/\//i.test(process.env.APPROVAL_CALLBACK_URL)) {
    issues.push({ level: 'error', message: 'APPROVAL_CALLBACK_URL must use HTTPS in production.' });
  }
  if (prod && !(process.env.ACTIONABLE_EMAIL_ALLOWED_SENDERS ?? '').trim()) {
    issues.push({ level: 'error', message: 'ACTIONABLE_EMAIL_ALLOWED_SENDERS must explicitly allow-list the trusted Actionable Messages sender(s) in production.' });
  }

  // The e-signature webhook can drive contract execution — it is fail-closed, and
  // in production the secret must actually be configured.
  if (prod && process.env.MELENTO_API_KEY && process.env.MELENTO_DOCUMENT_API_VERIFIED !== 'true') {
    issues.push({
      level: 'error',
      message: 'Melento is enabled but the exact document-upload API contract has not been marked verified. Set MELENTO_DOCUMENT_API_VERIFIED=true only after vendor UAT proves the approved agreement bytes and checksum are transmitted and the executed artifact can be retrieved.',
    });
  }

  if (prod && process.env.MELENTO_API_KEY && process.env.MELENTO_EXECUTED_DOCUMENT_API_VERIFIED !== 'true') {
    issues.push({
      level: 'error',
      message: 'Melento is enabled but executed-document retrieval + source-lineage verification has not been vendor-tested. Set MELENTO_EXECUTED_DOCUMENT_API_VERIFIED=true only after UAT proves the returned signed artifact identifies the exact source SHA-256.',
    });
  }
  if (prod && process.env.MELENTO_API_KEY && !(process.env.MELENTO_EXECUTED_DOCUMENT_PATH_TEMPLATE ?? '').startsWith('/')) {
    issues.push({ level: 'error', message: 'MELENTO_EXECUTED_DOCUMENT_PATH_TEMPLATE must be a relative path beginning with / in production.' });
  }

  if (prod && process.env.MELENTO_API_KEY && !process.env.MELENTO_WEBHOOK_SECRET) {
    issues.push({
      level: 'error',
      message:
        'MELENTO_WEBHOOK_SECRET is not set while Melento is enabled. Signature ' +
        'callbacks would be rejected and execution status could never update.',
    });
  }

  // Malware scanning must not be *claimed* without being *configured*.
  //
  // Two ways this went wrong. First, `UPLOAD_REQUIRE_SCAN=true` with no scanner
  // endpoint: every scan returns `unscanned`, so every upload is quarantined and
  // ingestion silently stops working — a control that fails closed so hard the
  // product does nothing, discovered by users rather than by boot.
  //
  // Second, and worse, the reverse: a scanner endpoint set while
  // `UPLOAD_REQUIRE_SCAN` is not true. The scan runs, but an `unscanned` verdict
  // (scanner down, unreachable, or answering in an unrecognised shape) is not
  // enforced, so the file proceeds to storage, OCR and indexing exactly as if it
  // had been checked. Production must not run in that state.
  if (prod && process.env.UPLOAD_REQUIRE_SCAN === 'true' && !scannerConfigured) {
    issues.push({
      level: 'error',
      message:
        'UPLOAD_REQUIRE_SCAN=true but neither MALWARE_SCAN_URL nor CLAMAV_HOST is set. ' +
        'Every upload would be quarantined as unscannable.',
    });
  }
  if (prod && scannerConfigured && process.env.UPLOAD_REQUIRE_SCAN !== 'true') {
    issues.push({
      level: 'error',
      message:
        'A malware scanner is configured but UPLOAD_REQUIRE_SCAN is not true, so a file ' +
        'the scanner could not verify would still be stored, OCR\'d and indexed. Set ' +
        'UPLOAD_REQUIRE_SCAN=true in production.',
    });
  }
  if (prod && !scannerConfigured) {
    issues.push({
      level: 'error',
      message:
        'No malware scanner configured (MALWARE_SCAN_URL / CLAMAV_HOST). Uploaded ' +
        'contracts are content-sniffed and allow-listed but not scanned.',
    });
  }

  // Demo filename aliasing substitutes fabricated extraction data for real files.
  if (prod && process.env.DEMO_SAMPLES === 'true') {
    issues.push({
      level: 'error',
      message:
        'DEMO_SAMPLES=true replaces real uploaded contracts with hardcoded sample ' +
        'extraction data. This must never be enabled in production.',
    });
  }

  // Surface degraded / fallback modes in production so failures can't masquerade
  // as successful processing. Strict mode (PROD_REQUIRE_REAL_INTEGRATIONS=true)
  // turns these into hard errors that block startup.
  if (prod) {
    const strict = process.env.PROD_REQUIRE_REAL_INTEGRATIONS !== 'false';
    for (const mode of degradedModes()) {
      issues.push({
        level: strict ? 'error' : 'warn',
        message: `Running in a degraded/fallback mode in production — ${mode}.`,
      });
    }
  }

  return issues;
}

/**
 * Enforces the posture at boot. In production a single `error` aborts startup;
 * in dev everything is a warning so the demo keeps running.
 */
export function assertBootSecurity(logger: Logger): void {
  const issues = inspectSecurityConfig();
  const errors = issues.filter((i) => i.level === 'error');
  const warns = issues.filter((i) => i.level === 'warn');

  for (const w of warns) logger.warn(`[security] ${w.message}`);
  for (const e of errors) logger.error(`[security] ${e.message}`);

  if (errors.length > 0) {
    throw new Error(
      `Refusing to start: ${errors.length} production security check(s) failed. ` +
        'Fix the AUTH_/demo settings above or run with NODE_ENV≠production for the demo.',
    );
  }

  if (issues.length === 0) {
    logger.log('[security] boot posture checks passed');
  }
}
