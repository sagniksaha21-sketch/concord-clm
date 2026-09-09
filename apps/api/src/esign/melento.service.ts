import { Injectable, Logger } from '@nestjs/common';
import { Signatory, StampPaper } from '@concord/shared';
import { randomUUID } from 'crypto';
import * as crypto from 'crypto';
import { fetchWithTimeout } from '../common/http';

export interface EnvelopeResult {
  provider: 'melento' | 'stub';
  envelopeId: string;
  signingUrl: string;
  status: 'sent';
}

export interface StampResult {
  certificateNo: string;
  status: 'procured';
}

export interface ExecutedDocumentResult {
  bytes: Buffer;
  contentType: string;
  filename: string;
  /** SHA-256 of the exact source agreement as attested by the e-sign provider. */
  sourceSha256: string;
}

/**
 * Adapter for **Melento** — Lakmē Lever's e-signature + digital stamp-paper
 * vendor. It follows the same seam pattern as the rest of Concord: when
 * MELENTO_API_KEY + MELENTO_BASE_URL are set it calls the live API; otherwise it
 * runs in **stub mode**, simulating the vendor so the whole e-signature flow
 * works end-to-end today, before Melento's API is available.
 *
 * The real request/response shapes below are written to a conventional
 * e-sign/e-stamp REST API. When Melento shares their API docs, adjust the URLs,
 * payload fields and the webhook signature scheme to match — the rest of Concord
 * doesn't change.
 */
@Injectable()
export class MelentoService {
  private readonly logger = new Logger(MelentoService.name);

  get enabled(): boolean {
    return Boolean(process.env.MELENTO_API_KEY && process.env.MELENTO_BASE_URL);
  }
  get provider(): 'melento' | 'stub' {
    return this.enabled ? 'melento' : 'stub';
  }
  private get base(): string {
    return (process.env.MELENTO_BASE_URL || '').replace(/\/$/, '');
  }
  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.MELENTO_API_KEY}`,
    };
  }

  /** Procures an Indian e-stamp paper for the agreement. */
  async procureStamp(sp: StampPaper): Promise<StampResult> {
    if (!this.enabled) {
      const certificateNo = `IN-STAMP-STUB-${randomUUID().slice(0, 8).toUpperCase()}`;
      this.logger.log(`[STUB] Melento e-stamp procured: ${certificateNo} (₹${sp.dutyAmount}, ${sp.state})`);
      return { certificateNo, status: 'procured' };
    }
    // ── live Melento e-stamp API (adjust to their contract) ──
    const res = await fetchWithTimeout(`${this.base}/v1/stamps`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        state: sp.state,
        article: sp.article,
        considerationAmount: sp.considerationAmount,
        dutyAmount: sp.dutyAmount,
        payer: sp.paidBy,
      }),
    });
    if (!res.ok) throw new Error(`Melento stamp ${res.status}`);
    const data: any = await res.json();
    return { certificateNo: data.certificateNo ?? data.certificate_number, status: 'procured' };
  }

  /** Creates and dispatches a signing envelope to the signatories. */
  async createEnvelope(params: {
    contractId: string;
    contractTitle: string;
    signatories: Signatory[];
    message?: string;
    stampCertificateNo?: string;
    document: { filename: string; contentType: string; bytes: Buffer; sha256: string };
  }): Promise<EnvelopeResult> {
    if ((process.env.NODE_ENV ?? '').toLowerCase() === 'production' && process.env.MELENTO_DOCUMENT_API_VERIFIED !== 'true') {
      throw new Error('Production e-signature is blocked until the Melento document-upload API contract is verified and MELENTO_DOCUMENT_API_VERIFIED=true is set.');
    }
    if (!this.enabled) {
      const envelopeId = `MEL-ENV-${randomUUID().slice(0, 8).toUpperCase()}`;
      const signingUrl = `https://app.melento.example/sign/${envelopeId}`;
      this.logger.log(`[STUB] Melento envelope ${envelopeId} → ${params.signatories.map((s) => s.email).join(', ')}`);
      return { provider: 'stub', envelopeId, signingUrl, status: 'sent' };
    }
    // ── live Melento e-sign API (adjust to their contract) ──
    const res = await fetchWithTimeout(`${this.base}/v1/envelopes`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        reference: params.contractId,
        title: params.contractTitle,
        message: params.message,
        stampCertificateNo: params.stampCertificateNo,
        signers: params.signatories.map((s) => ({
          name: s.name,
          email: s.email,
          role: s.role,
          order: s.order,
        })),
        callbackUrl: process.env.MELENTO_CALLBACK_URL,
        document: {
          filename: params.document.filename,
          contentType: params.document.contentType,
          sha256: params.document.sha256,
          contentBase64: params.document.bytes.toString('base64'),
        },
      }),
    });
    if (!res.ok) throw new Error(`Melento envelope ${res.status}`);
    const data: any = await res.json();
    return {
      provider: 'melento',
      envelopeId: data.envelopeId ?? data.id,
      signingUrl: data.signingUrl ?? data.url,
      status: 'sent',
    };
  }

  /**
   * Downloads the actual provider-executed agreement. Production requires a
   * vendor-UAT verified endpoint and an exact source-document SHA-256 returned
   * by the provider. We intentionally do not infer lineage from filenames,
   * envelope IDs, or timestamps.
   */
  async downloadExecutedDocument(envelopeId: string): Promise<ExecutedDocumentResult> {
    const prod = (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
    if (prod && process.env.MELENTO_EXECUTED_DOCUMENT_API_VERIFIED !== 'true') {
      throw new Error('Executed-document retrieval is not vendor-verified; refusing to certify execution.');
    }
    if (!this.enabled) {
      if (prod) throw new Error('Melento is not configured in production.');
      throw new Error('Stub mode has no provider-executed document.');
    }
    const template = process.env.MELENTO_EXECUTED_DOCUMENT_PATH_TEMPLATE || '';
    if (!template.startsWith('/') || !template.includes('{envelopeId}')) {
      throw new Error('MELENTO_EXECUTED_DOCUMENT_PATH_TEMPLATE must be a relative path containing {envelopeId}.');
    }
    const path = template.replace('{envelopeId}', encodeURIComponent(envelopeId));
    const res = await fetchWithTimeout(`${this.base}${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${process.env.MELENTO_API_KEY}`, Accept: 'application/pdf,application/octet-stream' },
    });
    if (!res.ok) throw new Error(`Melento executed-document download ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (!bytes.length) throw new Error('Melento returned an empty executed document.');
    const sourceSha256 = (res.headers.get('x-source-sha256') || '').trim().toLowerCase();
    if (prod && !/^[a-f0-9]{64}$/.test(sourceSha256)) {
      throw new Error('Melento executed document did not attest the exact source SHA-256.');
    }
    const contentType = res.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream';
    const disposition = res.headers.get('content-disposition') || '';
    const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(disposition);
    const filename = match ? decodeURIComponent(match[1].replace(/^"|"$/g, '').trim()) : `executed-${envelopeId}.pdf`;
    return { bytes, contentType, filename, sourceSha256 };
  }

  /**
   * Verifies a Melento webhook signature (HMAC-SHA256 over the RAW body).
   * FAIL-CLOSED: with no secret configured the callback is rejected. An
   * unauthenticated caller must never be able to drive contract execution.
   */
  verifyWebhook(signature: string | undefined, rawBody: string): boolean {
    const secret = process.env.MELENTO_WEBHOOK_SECRET;
    if (!secret) return false; // no secret → reject (was: accept — CRITICAL)
    if (!signature) return false;
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }
}
