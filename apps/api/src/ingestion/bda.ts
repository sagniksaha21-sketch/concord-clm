/**
 * Amazon Bedrock Data Automation (BDA) — a newer, higher-level document
 * processor: one managed service does OCR + layout (and, with a blueprint,
 * structured extraction) from a document in S3, writing JSON back to S3.
 *
 * Here BDA is wired as an OCR provider (`OCR_PROVIDER=bda`): it returns the
 * document's extracted text, which the normal extraction step then structures —
 * so it A/Bs directly against Textract for OCR quality. (BDA can also return the
 * fields itself via a custom blueprint; that's an advanced config — see the
 * BDA_BLUEPRINT_ARN note in docs/deployment.md.)
 *
 * The AWS SDKs are loaded dynamically so the build never hard-depends on them.
 * Requires: the input document already in S3, BDA_PROFILE_ARN, and an output
 * location (BDA_OUTPUT_S3_URI). Output-JSON traversal follows BDA's standard
 * output shape; validate it against your BDA project as schemas evolve.
 */

function awsCreds(): any {
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
  }
  return undefined;
}

function region(): string {
  return process.env.BEDROCK_REGION || process.env.AWS_REGION || 'us-east-1';
}

function parseS3Uri(uri: string): { Bucket: string; Key: string } {
  const m = uri.replace(/^s3:\/\//, '');
  const i = m.indexOf('/');
  return { Bucket: m.slice(0, i), Key: m.slice(i + 1) };
}

export async function ocrWithBDA(s3Input: { Bucket: string; Name: string }): Promise<string> {
  const profileArn = process.env.BDA_PROFILE_ARN;
  const outputBase = process.env.BDA_OUTPUT_S3_URI; // e.g. s3://my-bucket/bda-output/
  if (!profileArn) throw new Error('BDA_PROFILE_ARN not set');
  if (!outputBase) throw new Error('BDA_OUTPUT_S3_URI not set');

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const rt = require('@aws-sdk/client-bedrock-data-automation-runtime');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const s3mod = require('@aws-sdk/client-s3');

  const creds = awsCreds();
  const client = new rt.BedrockDataAutomationRuntimeClient({ region: region(), credentials: creds });
  const s3 = new s3mod.S3Client({ region: region(), credentials: creds });

  const invoke: any = {
    inputConfiguration: { s3Uri: `s3://${s3Input.Bucket}/${s3Input.Name}` },
    outputConfiguration: { s3Uri: outputBase.replace(/\/?$/, '/') },
    dataAutomationProfileArn: profileArn,
  };
  if (process.env.BDA_PROJECT_ARN) {
    invoke.dataAutomationConfiguration = { dataAutomationProjectArn: process.env.BDA_PROJECT_ARN };
  }
  if (process.env.BDA_BLUEPRINT_ARN) {
    invoke.blueprints = [{ blueprintArn: process.env.BDA_BLUEPRINT_ARN, stage: 'LIVE' }];
  }

  const started = await client.send(new rt.InvokeDataAutomationAsyncCommand(invoke));
  const invocationArn = started.invocationArn;

  // Poll to completion.
  let outUri = '';
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const st = await client.send(new rt.GetDataAutomationStatusCommand({ invocationArn }));
    if (st.status === 'Success') {
      outUri = st.outputConfiguration?.s3Uri || '';
      break;
    }
    if (st.status === 'ServiceError' || st.status === 'ClientError') {
      throw new Error(`BDA ${st.status}: ${st.errorMessage || st.errorType || 'unknown'}`);
    }
  }
  if (!outUri) throw new Error('BDA timed out');

  // Read the job metadata, follow to each segment's standard output, collect text.
  const readJson = async (uri: string): Promise<any> => {
    const { Bucket, Key } = parseS3Uri(uri);
    const obj = await s3.send(new s3mod.GetObjectCommand({ Bucket, Key }));
    const text = await obj.Body.transformToString();
    return JSON.parse(text);
  };

  const meta = await readJson(outUri);
  const segments: any[] = meta.output_metadata || meta.outputMetadata || [];
  const parts: string[] = [];
  for (const seg of segments) {
    const list = seg.segment_metadata || seg.segmentMetadata || [];
    for (const s of list) {
      const stdPath = s.standard_output_path || s.standardOutputPath;
      if (!stdPath) continue;
      const std = await readJson(stdPath);
      // Standard output carries document text/markdown; shapes vary by version.
      const text =
        std?.document?.text ||
        std?.document?.representation?.markdown ||
        (Array.isArray(std?.pages)
          ? std.pages.map((p: any) => p?.representation?.markdown || p?.text || '').join('\n')
          : '');
      if (text) parts.push(text);
    }
  }
  const combined = parts.join('\n').trim();
  if (!combined) throw new Error('BDA returned no text (check project/blueprint output schema)');
  return combined;
}
