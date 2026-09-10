import { fetchWithTimeout } from '../../src/common/http';
jest.mock('../../src/common/http', () => ({ fetchWithTimeout: jest.fn() }));

describe('Google Cloud AI REST contracts', () => {
  const originalEnv = { ...process.env };
  const request = fetchWithTimeout as jest.Mock;
  let client: typeof import('../../src/common/gcp-ai');
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  const completion = (text = 'Grounded answer', finishReason = 'STOP') => ({
    modelVersion: 'gemini-test-001', candidates: [{ finishReason, content: { parts: [{ text }] } }],
  });
  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: 'test', GCP_ACCESS_TOKEN: 'unit-test-token',
      GCP_PROJECT_ID: 'concord-uat', GCP_LOCATION: 'asia-south1', GCP_GEMINI_MODEL: 'gemini-test',
      GCP_EMBEDDINGS_MODEL: 'gemini-embedding-001', GCP_DOCUMENT_AI_LOCATION: 'us',
      GCP_DOCUMENT_AI_PROCESSOR: 'processor123' };
    request.mockReset();
    client = require('../../src/common/gcp-ai');
  });
  afterEach(() => { process.env = originalEnv; jest.useRealTimers(); });

  it('uses the selected regional endpoint and sends separate instructions with a response schema', async () => {
    request.mockResolvedValue(ok(completion('{"summary":"ok"}')));
    const schema = { type: 'OBJECT', properties: { summary: { type: 'STRING' } }, required: ['summary'] };
    expect(await client.generateWithGemini({ system: 'System', user: 'Document', schema })).toEqual({ text: '{"summary":"ok"}', model: 'gemini-test-001' });
    expect(request.mock.calls[0][0]).toBe('https://asia-south1-aiplatform.googleapis.com/v1/projects/concord-uat/locations/asia-south1/publishers/google/models/gemini-test:generateContent');
    const init = request.mock.calls[0][1];
    expect(init.headers.Authorization).toBe('Bearer unit-test-token');
    expect(init.redirect).toBe('error');
    expect(JSON.parse(init.body)).toMatchObject({ systemInstruction: { parts: [{ text: 'System' }] },
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema } });
  });

  it('uses the correct host when global inference is explicitly chosen', async () => {
    process.env.GCP_LOCATION = 'global'; request.mockResolvedValue(ok(completion()));
    await client.generateWithGemini({ system: 's', user: 'q' });
    expect(request.mock.calls[0][0]).toContain('https://aiplatform.googleapis.com/');
  });

  it.each(['MAX_TOKENS', 'SAFETY', 'RECITATION', 'OTHER', undefined])('rejects incomplete/blocked finish reason %s', async (reason) => {
    const response = completion('{"looks":"valid"}'); response.candidates[0].finishReason = reason as any;
    request.mockResolvedValue(ok(response));
    await expect(client.generateWithGemini({ system: 's', user: 'q', json: true })).rejects.toThrow('complete, unblocked');
  });

  it('does not include thought text and rejects malformed JSON', async () => {
    const data = completion('answer'); (data.candidates[0].content.parts as any[]).unshift({ text: 'internal thought', thought: true });
    request.mockResolvedValueOnce(ok(data)).mockResolvedValueOnce(ok(completion('{bad')));
    expect((await client.generateWithGemini({ system: 's', user: 'q' })).text).toBe('answer');
    await expect(client.generateWithGemini({ system: 's', user: 'q', json: true })).rejects.toThrow('invalid JSON');
  });

  it('fails configuration without sending contract text to a default region', async () => {
    delete process.env.GCP_LOCATION;
    await expect(client.generateWithGemini({ system: 's', user: 'confidential' })).rejects.toThrow('GCP_LOCATION');
    expect(request).not.toHaveBeenCalled();
  });

  it('does not forward response bodies into errors or retry permission failures', async () => {
    request.mockResolvedValue(new Response('private agreement and token must not leak', { status: 403 }));
    await expect(client.generateWithGemini({ system: 's', user: 'q' })).rejects.toThrow('failed (403)');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('retries quota errors only once', async () => {
    request.mockImplementation(async () => new Response('', { status: 429, headers: { 'retry-after': '0' } }));
    await expect(client.generateWithGemini({ system: 's', user: 'q' })).rejects.toThrow('(429)');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('batches one text per prediction, preserves order and marks document/query tasks', async () => {
    request.mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body);
      expect(body.instances).toHaveLength(1);
      expect(body.parameters).toEqual({ autoTruncate: false, outputDimensionality: 2 });
      return ok({ predictions: [{ embeddings: { values: body.instances[0].content === 'first' ? [1, 0] : [0, 1], statistics: { truncated: false } } }] });
    });
    expect((await client.embedWithGemini(['first', 'second'], 2)).vectors).toEqual([[1, 0], [0, 1]]);
    await client.embedWithGemini(['query'], 2, 'RETRIEVAL_QUERY');
    expect(JSON.parse(request.mock.calls[0][1].body).instances[0].task_type).toBe('RETRIEVAL_DOCUMENT');
    expect(JSON.parse(request.mock.calls[2][1].body).instances[0].task_type).toBe('RETRIEVAL_QUERY');
  });

  it.each([[1], [0, 0], [1, null]])('rejects malformed vectors %j', async (...values) => {
    request.mockResolvedValue(ok({ predictions: [{ embeddings: { values } }] }));
    await expect(client.embedWithGemini(['document'], 2)).rejects.toThrow('invalid or truncated');
  });

  it('uses versioned Document AI processors and requests text without images', async () => {
    process.env.GCP_DOCUMENT_AI_PROCESSOR_VERSION = 'version123';
    request.mockResolvedValue(ok({ document: { text: 'All pages', pages: [{ pageNumber: 1 }, { pageNumber: 2 }] } }));
    expect(await client.processWithDocumentAi({ buffer: Buffer.from('pdf'), mimeType: 'application/pdf' }))
      .toEqual({ text: 'All pages', pages: 2, model: 'document-ai:processor123:version123' });
    expect(request.mock.calls[0][0]).toContain('/processors/processor123/processorVersions/version123:process');
    expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({ imagelessMode: true, rawDocument: { content: 'cGRm', mimeType: 'application/pdf' } });
  });

  it('checks grounding only against the supplied facts and an explicitly selected location', async () => {
    await expect(client.checkGoogleGrounding('Answer', [{ id: '1', text: 'Source' }])).rejects.toThrow('Explicit global');
    process.env.GCP_GROUNDING_LOCATION = 'global'; request.mockResolvedValue(ok({ supportScore: 0.96 }));
    expect(await client.checkGoogleGrounding('Answer', [{ id: '1', text: 'Source' }])).toBe(0.96);
    expect(JSON.parse(request.mock.calls[0][1].body).facts).toEqual([{ factText: 'Source', attributes: { source: '1' } }]);
  });

  it('shares and refreshes short-lived metadata identity, without using local tokens in production', async () => {
    process.env.NODE_ENV = 'production';
    await expect(client.gcpAccessToken()).rejects.toThrow('workload identity');
    delete process.env.GCP_ACCESS_TOKEN;
    jest.useFakeTimers({ now: Date.now() });
    request.mockImplementation(async () => ok({ access_token: 'metadata-token', expires_in: 3600 }));
    expect(await Promise.all([client.gcpAccessToken(), client.gcpAccessToken()])).toEqual(['metadata-token', 'metadata-token']);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1].headers).toEqual({ 'Metadata-Flavor': 'Google' });
    jest.setSystemTime(Date.now() + 3600_000);
    await client.gcpAccessToken(); expect(request).toHaveBeenCalledTimes(2);
  });
});
