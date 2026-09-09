import 'isomorphic-fetch';
import { fetchWithTimeout } from '../common/http';

/**
 * Azure AI Document Intelligence — OCR/layout via the REST API (no SDK).
 * Uses the prebuilt-read model to turn a PDF/scan into text for the LLM step.
 */

export function isDocIntelligenceConfigured(): boolean {
  return Boolean(
    process.env.DOC_INTELLIGENCE_ENDPOINT && process.env.DOC_INTELLIGENCE_KEY,
  );
}

const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export function contentTypeFor(filename: string): string {
  const ext = (filename.split('.').pop() ?? '').toLowerCase();
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

/**
 * OCRs a document and returns its plain text.
 * Analyze is async (202 + operation-location); we poll until it succeeds.
 */
export async function ocrDocument(
  buffer: Buffer,
  filename: string,
): Promise<string> {
  const endpoint = process.env.DOC_INTELLIGENCE_ENDPOINT!.replace(/\/$/, '');
  const key = process.env.DOC_INTELLIGENCE_KEY!;
  const apiVersion = process.env.DOC_INTELLIGENCE_API_VERSION ?? '2024-11-30';
  const url = `${endpoint}/documentintelligence/documentModels/prebuilt-read:analyze?api-version=${apiVersion}`;

  const start = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': contentTypeFor(filename),
      'Ocp-Apim-Subscription-Key': key,
    },
    body: buffer as unknown as BodyInit,
  });
  if (start.status !== 202) {
    throw new Error(`Document Intelligence analyze failed (${start.status})`);
  }
  const opLocation = start.headers.get('operation-location');
  if (!opLocation) throw new Error('Document Intelligence: no operation-location');

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const poll = await fetchWithTimeout(opLocation, {
      headers: { 'Ocp-Apim-Subscription-Key': key },
    });
    const data: any = await poll.json();
    if (data.status === 'succeeded') return data.analyzeResult?.content ?? '';
    if (data.status === 'failed') {
      throw new Error('Document Intelligence analysis failed');
    }
  }
  throw new Error('Document Intelligence timed out');
}
