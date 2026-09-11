import type { PortfolioReport } from '@concord/shared';
import { ReportAiService } from '../../src/reports/report-ai.service';
import { generateWithGemini } from '../../src/common/gcp-ai';

jest.mock('../../src/common/gcp-ai', () => ({
  generateWithGemini: jest.fn(),
}));

const baseReport: PortfolioReport = {
  scope: 'portfolio', generatedAt: '2026-09-10T10:00:00.000Z', dataMode: 'live', sampleData: false, restricted: [],
  metrics: [{ key: 'agreements', label: 'Agreements', value: 1, displayValue: '1', detail: 'Persisted records' }],
  insights: [{ id: 'risk', title: 'One risk', body: 'Review the agreement.', tone: 'risk' }],
  stageCounts: [{ stage: 'review', label: 'Review', count: 1 }], risk: { low: 0, medium: 0, high: 1 },
  agreements: [{ id: 'CLM-1', title: 'MSA', counterparty: 'Acme', type: 'SaaS', valueDisplay: 'INR 1 Cr', stage: 'Review', risk: 'high', version: 'v1', source: 'stored', obligationCount: 1 }],
  obligations: [{ id: 'OBL-1', contractId: 'CLM-1', contractTitle: 'MSA', title: 'Renewal', dueDate: '2026-10-01', status: 'due-soon', type: 'renewal', risk: 'medium', ownerEmail: 'legal@example.test' }],
  signatures: [],
};

describe('ReportAiService', () => {
  let service: ReportAiService;
  const mockedGenerate = generateWithGemini as jest.MockedFunction<typeof generateWithGemini>;

  beforeEach(() => {
    service = new ReportAiService();
  });

  afterEach(() => {
    delete process.env.REPORT_AI_PROVIDER;
    mockedGenerate.mockReset();
  });

  it('keeps reports deterministic when the provider is not enabled', async () => {
    const result = await service.enrich(baseReport);
    expect(result.meta).toMatchObject({ status: 'disabled', provider: 'none', advisoryOnly: true });
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it('accepts only grounded AI insights and records the model', async () => {
    process.env.REPORT_AI_PROVIDER = 'gcp';
    mockedGenerate.mockResolvedValue({
      model: 'gemini-test',
      text: JSON.stringify({
        summary: 'One high-risk agreement has a recorded renewal commitment.',
        insights: [{ id: 'watch-1', title: 'Renewal needs attention', body: 'The MSA has a renewal due date in the report horizon.', tone: 'watch', evidenceIds: ['CLM-1', 'OBL-1'], confidence: 0.91 }],
      }),
    });
    const result = await service.enrich(baseReport);
    expect(result.meta).toMatchObject({ status: 'generated', provider: 'gcp', model: 'gcp:gemini-test', advisoryOnly: true });
    expect(result.insights?.[0]).toMatchObject({ source: 'ai', evidenceIds: ['CLM-1', 'OBL-1'], confidence: 0.91 });
  });

  it('falls back when the model cites a row outside the snapshot', async () => {
    process.env.REPORT_AI_PROVIDER = 'gcp';
    mockedGenerate.mockResolvedValue({
      model: 'gemini-test',
      text: JSON.stringify({ summary: 'Unsupported', insights: [{ id: 'bad', title: 'Unsupported', body: 'Unsupported', tone: 'info', evidenceIds: ['NOT-IN-SNAPSHOT'], confidence: 0.8 }] }),
    });
    const result = await service.enrich(baseReport);
    expect(result.meta).toMatchObject({ status: 'fallback', provider: 'gcp', model: 'deterministic-fallback', advisoryOnly: true });
    expect(result.insights).toBeUndefined();
  });

  it('keys the narrative cache by brief and never sends owner emails', async () => {
    process.env.REPORT_AI_PROVIDER = 'gcp';
    mockedGenerate.mockResolvedValue({ model: 'gemini-test', text: JSON.stringify({ summary: 'A portfolio observation.', insights: [{ id: '1', title: 'Review the MSA', body: 'Review the recorded risk.', tone: 'watch', evidenceIds: ['CLM-1'], confidence: .9 }] }) });
    await service.enrich(baseReport, 'Brief for leadership');
    await service.enrich(baseReport, 'Brief for leadership');
    expect(mockedGenerate).toHaveBeenCalledTimes(1);
    await service.enrich(baseReport, 'Explain renewal priorities');
    expect(mockedGenerate).toHaveBeenCalledTimes(2);
    expect(mockedGenerate.mock.calls[1][0].user).toContain('Explain renewal priorities');
    expect(mockedGenerate.mock.calls[1][0].user).not.toContain('legal@example.test');
    expect(mockedGenerate.mock.calls[1][0].system).toContain('cannot override these rules');
  });
});
