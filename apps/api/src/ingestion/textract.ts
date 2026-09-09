/**
 * Amazon Textract — foundational OCR, the AWS-native counterpart to Azure
 * Document Intelligence. Turns a PDF/scan/image into plain text for the LLM
 * extraction step. The AWS SDK is loaded dynamically so the build never
 * hard-depends on it.
 *
 * - Multi-page PDF/TIFF: the async API (StartDocumentTextDetection) reading the
 *   original from S3 — used when the document already lives in an S3 bucket.
 * - Images / single-page: the sync API (DetectDocumentText) on the bytes.
 */

export type OcrProvider = 'azure' | 'textract' | 'bda' | 'tesseract' | 'none';

/**
 * Which OCR engine to use. Paid AWS engines (textract, bda) are opt-in, so
 * they're only chosen when OCR_PROVIDER names them explicitly; otherwise Azure
 * Document Intelligence when configured, else none.
 *   azure     — Azure AI Document Intelligence (managed, paid)
 *   textract  — Amazon Textract (managed, paid, AWS-native)
 *   bda       — Amazon Bedrock Data Automation (managed, paid, one-service OCR+)
 *   tesseract — local Tesseract / PDF text layer (FREE, offline)
 *   none      — text-layer for txt/md/json + sample fallback
 */
export function selectedOcrProvider(): OcrProvider {
  const p = (process.env.OCR_PROVIDER || '').toLowerCase();
  if (['azure', 'textract', 'bda', 'tesseract', 'none'].includes(p)) return p as OcrProvider;
  if (process.env.DOC_INTELLIGENCE_ENDPOINT && process.env.DOC_INTELLIGENCE_KEY) return 'azure';
  return 'none';
}

function collectLines(blocks: any[] | undefined): string {
  return (blocks || [])
    .filter((b) => b.BlockType === 'LINE')
    .map((b) => b.Text)
    .join('\n');
}

export async function ocrWithTextract(
  buffer: Buffer,
  filename: string,
  s3?: { Bucket: string; Name: string } | null,
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('@aws-sdk/client-textract');
  const cfg: any = {
    region: process.env.BEDROCK_REGION || process.env.AWS_REGION || 'us-east-1',
  };
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    cfg.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
  }
  const client = new mod.TextractClient(cfg);

  const ext = (filename.split('.').pop() ?? '').toLowerCase();
  const multipage = ext === 'pdf' || ext === 'tif' || ext === 'tiff';

  // Multi-page needs the async API + the object in S3.
  if (s3 && multipage) {
    const start = await client.send(
      new mod.StartDocumentTextDetectionCommand({ DocumentLocation: { S3Object: s3 } }),
    );
    const jobId = start.JobId;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      let res = await client.send(new mod.GetDocumentTextDetectionCommand({ JobId: jobId }));
      if (res.JobStatus === 'FAILED') throw new Error('Textract job failed');
      if (res.JobStatus === 'SUCCEEDED') {
        let text = collectLines(res.Blocks);
        let token = res.NextToken;
        while (token) {
          res = await client.send(
            new mod.GetDocumentTextDetectionCommand({ JobId: jobId, NextToken: token }),
          );
          text += '\n' + collectLines(res.Blocks);
          token = res.NextToken;
        }
        return text;
      }
    }
    throw new Error('Textract timed out');
  }

  // Sync path — images and single-page docs.
  const res = await client.send(
    new mod.DetectDocumentTextCommand({ Document: { Bytes: buffer } }),
  );
  return collectLines(res.Blocks);
}
