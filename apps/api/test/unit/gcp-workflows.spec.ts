import { generateWithGemini, embedWithGemini, checkGoogleGrounding } from '../../src/common/gcp-ai';
import { legalAiProvider, gcpConfigurationIssues } from '../../src/common/gcp-config';
import { AiReviewService } from '../../src/ai-review/ai-review.service';
import { AuthoringService } from '../../src/authoring/authoring.service';
import { EmbeddingsService } from '../../src/embeddings/embeddings.service';
import { RepositoryService } from '../../src/repository/repository.service';
import { IngestionService } from '../../src/ingestion/ingestion.service';
import { AuditService } from '../../src/audit/audit.service';

jest.mock('../../src/common/gcp-ai', () => ({ generateWithGemini: jest.fn(), embedWithGemini: jest.fn(), checkGoogleGrounding: jest.fn() }));

describe('GCP providers preserve Concord workflow boundaries', () => {
  const original = { ...process.env };
  const generate = generateWithGemini as jest.Mock;
  const embed = embedWithGemini as jest.Mock;
  const grounding = checkGoogleGrounding as jest.Mock;
  const contract = { id: 'C-1', title: 'Services agreement', counterparty: 'Example Ltd', type: 'MSA', risk: 'low', version: 'v1' } as any;
  const source = 'Payment is due within 30 days.';
  const review = { riskScore: 20, riskLevel: 'low', clausesParsed: 1, summary: 'Thirty-day payment term.',
    extractedTerms: [], clauses: [{ id: 'clause-1', clauseNo: '1', heading: 'Payment', excerpt: source, risk: 'low', pin: '1' }], deviations: [] };
  beforeEach(() => {
    process.env = { ...original, NODE_ENV: 'production', DEMO_SAMPLES: 'false',
      GCP_PROJECT_ID: 'concord-uat', GCP_LOCATION: 'asia-south1', GCP_GEMINI_MODEL: 'gemini-test',
      GCP_EMBEDDINGS_MODEL: 'gemini-embedding-001', CHAT_PROVIDER: 'gcp', AI_REVIEW_PROVIDER: 'gcp', AUTHORING_PROVIDER: 'gcp', EXTRACT_PROVIDER: 'gcp' };
    delete process.env.GCP_ACCESS_TOKEN;
    jest.clearAllMocks();
  });
  afterEach(() => { process.env = original; });

  const makeReview = (text: string | null = source) => {
    const document = { id: 'DOC-1', extractedText: text, sha256: 'document-hash' };
    const audit = { record: jest.fn(), aiProvenance: new AuditService({ enabled: false } as any).aiProvenance };
    const prisma = { enabled: true, client: { document: { findFirst: jest.fn().mockResolvedValue(document) } } };
    return { audit, prisma, service: new AiReviewService({ getByIdFresh: jest.fn().mockResolvedValue(contract) } as any, audit as any, prisma as any) };
  };

  it('reviews linked document text and records its lineage and actual Google model', async () => {
    generate.mockResolvedValue({ text: JSON.stringify(review), model: 'gemini-test-001' });
    const { service, audit, prisma } = makeReview();
    const result = await service.getReview('C-1');
    expect(result).toMatchObject({ documentId: 'DOC-1', documentSha256: 'document-hash', contractVersion: 'v1', model: 'gcp:gemini-test-001' });
    expect(prisma.client.document.findFirst.mock.calls[0][0].where).toMatchObject({ contractId: 'C-1', status: { not: 'quarantined' } });
    expect(generate.mock.calls[0][0].user).toContain(source);
    expect(generate.mock.calls[0][0].schema).toBeDefined();
    expect(audit.record.mock.calls[0][0].ai).toMatchObject({ provider: 'gcp', model: 'gcp:gemini-test-001', advisory: true });
  });

  it('refuses reviews without complete linked source text', async () => {
    await expect(makeReview(null).service.getReview('C-1')).rejects.toThrow('No extracted contract text');
    await expect(makeReview('x'.repeat(120001)).service.getReview('C-1')).rejects.toThrow('complete-review limit');
    expect(generate).not.toHaveBeenCalled();
  });

  it('rejects invented source quotations and invalid risk scores', async () => {
    generate.mockResolvedValueOnce({ text: JSON.stringify({ ...review, riskScore: 1000 }), model: 'gemini-test' });
    await expect(makeReview().service.getReview('C-1')).rejects.toThrow('schema validation');
    generate.mockResolvedValueOnce({ text: JSON.stringify({ ...review, clauses: [{ ...review.clauses[0], excerpt: 'Liability is unlimited.' }] }), model: 'gemini-test' });
    await expect(makeReview().service.getReview('C-1')).rejects.toThrow('could not be verified');
  });

  it('honors an explicit review opt-out even with Azure credentials present', () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://azure.test'; process.env.AZURE_OPENAI_API_KEY = 'test';
    process.env.AI_REVIEW_PROVIDER = 'none';
    expect(legalAiProvider('review')).toBe('none');
    process.env.AI_REVIEW_PROVIDER = 'typo';
    expect(() => legalAiProvider('review')).toThrow('must be');
  });

  it('preserves legacy Azure authoring when the repository uses another provider', () => {
    delete process.env.AUTHORING_PROVIDER;
    process.env.CHAT_PROVIDER = 'ollama';
    process.env.AZURE_OPENAI_ENDPOINT = 'https://azure.test'; process.env.AZURE_OPENAI_API_KEY = 'test';
    expect(legalAiProvider('authoring')).toBe('azure');
  });

  it('does not report missing region/model/processor configuration as ready', () => {
    delete process.env.GCP_LOCATION; delete process.env.GCP_GEMINI_MODEL;
    process.env.OCR_PROVIDER = 'gcp'; delete process.env.GCP_DOCUMENT_AI_LOCATION; delete process.env.GCP_DOCUMENT_AI_PROCESSOR;
    const issues = gcpConfigurationIssues().join(' ');
    for (const variable of ['GCP_LOCATION', 'GCP_GEMINI_MODEL', 'GCP_DOCUMENT_AI_LOCATION', 'GCP_DOCUMENT_AI_PROCESSOR']) expect(issues).toContain(variable);
  });

  it('rejects provider errors instead of mixing local vectors into a Google index', async () => {
    process.env.EMBEDDINGS_PROVIDER = 'gcp'; embed.mockRejectedValue(new Error('quota exceeded'));
    const service = new EmbeddingsService();
    await expect(service.embedBatch(['agreement'])).rejects.toThrow('temporarily unavailable');
    expect(service.indexProvider).toBe('gcp:gemini-embedding-001:768:retrieval-v1');
  });

  it('uses a query task for searches, document tasks for the corpus', async () => {
    process.env.EMBEDDINGS_PROVIDER = 'gcp'; process.env.EMBEDDINGS_DIM = '2';
    embed.mockResolvedValue({ vectors: [[3, 4]], model: 'gemini-embedding-001' });
    const service = new EmbeddingsService();
    expect(await service.embed('question')).toEqual([0.6, 0.8]);
    expect(embed.mock.calls[0][2]).toBe('RETRIEVAL_QUERY');
    await service.embedBatch(['document']); expect(embed.mock.calls[1][2]).toBe('RETRIEVAL_DOCUMENT');
  });

  it('returns a cited source passage when grounding is weak or unavailable', async () => {
    process.env.GCP_GROUNDING_CHECK = 'true'; process.env.GCP_GROUNDING_LOCATION = 'global';
    const repo = new RepositoryService({} as any, {} as any, {} as any, {} as any);
    generate.mockResolvedValue({ text: 'Unsupported conclusion', model: 'gemini-test' });
    grounding.mockResolvedValueOnce(0.2).mockRejectedValueOnce(new Error('quota'));
    const matches = [{ id: 'C-1', text: source, score: 1, citations: [{ contractId: 'C-1', label: 'Payment' }] }];
    for (let i = 0; i < 2; i++) expect(await (repo as any).compose('When is payment due?', matches, source))
      .toEqual({ answer: source, model: 'retrieval' });
    expect(grounding.mock.calls[0][1]).toBe(matches);
  });

  it('does not accept changed draft headings as successful AI authoring', async () => {
    const author = new AuthoringService({ enabled: false } as any);
    const template = { id: 'T-1', name: 'NDA', clauseIds: [], contractType: 'NDA' } as any;
    jest.spyOn(author, 'getTemplate').mockResolvedValue(template);
    generate.mockResolvedValueOnce({ text: JSON.stringify({ sections: [{ heading: 'Changed', body: 'text' }] }), model: 'gemini-test' });
    const dto = { templateId: 'T-1', counterparty: 'Example' };
    const fallback = await author.generateDraft(dto);
    expect(fallback.model).toBe('template-assembly'); expect(fallback.sections[0].heading).toBe('Parties');
    generate.mockResolvedValueOnce({ text: JSON.stringify({ sections: [{ heading: 'Parties', body: 'Draft for the parties.' }] }), model: 'gemini-test-001' });
    expect((await author.generateDraft(dto)).model).toBe('gcp:gemini-test-001');
  });

  it('keeps extraction validation flags under Concord control and refuses oversized text', async () => {
    const ingest = new IngestionService({ enabled: false } as any, {} as any, {} as any,
      { wrapUntrusted: (s: string) => s } as any, {} as any);
    generate.mockResolvedValue({ text: JSON.stringify({ parties: [{ name: 'Example', pan: 'INVALID', panValid: true }] }), model: 'gemini-test' });
    const result = await (ingest as any).extractWithGcp(source);
    expect(result.extraction.parties[0].pan).toBe('INVALID');
    expect(result.extraction.parties[0].panValid).toBeUndefined();
    await expect((ingest as any).extractWithGcp('x'.repeat(120001))).rejects.toThrow('complete-extraction limit');
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
