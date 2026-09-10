import { contentTypeFor } from './doc-intelligence';
import { processWithDocumentAi } from '../common/gcp-ai';

/** Google Cloud Document AI OCR/layout processor. */
export function isGcpDocumentAiConfigured(): boolean {
  return Boolean(
    (process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT) &&
      process.env.GCP_DOCUMENT_AI_PROCESSOR,
  );
}

export async function ocrWithGcpDocumentAi(buffer: Buffer, filename: string): Promise<string> {
  if (/\.(txt|md|json|csv)$/i.test(filename)) return buffer.toString('utf8');
  const mimeType = contentTypeFor(filename);
  if (mimeType === 'application/octet-stream') throw new Error('This file type is not supported by the Document AI adapter');
  const result = await processWithDocumentAi({
    buffer,
    mimeType,
    processor: process.env.GCP_DOCUMENT_AI_PROCESSOR,
  });
  if (!result.text.trim()) throw new Error('Google Document AI returned no text');
  return result.text;
}
