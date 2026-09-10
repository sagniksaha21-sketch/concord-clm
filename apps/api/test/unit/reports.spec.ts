import { buildPdf } from '../../src/reports/pdf-exporter';
import { buildPptx } from '../../src/reports/pptx-exporter';
import { buildXlsx } from '../../src/reports/xlsx-exporter';
import { ReportsService } from '../../src/reports/reports.service';
import type { PortfolioReport } from '@concord/shared';

const report: PortfolioReport = {
  scope: 'portfolio',
  generatedAt: '2026-09-10T10:00:00.000Z',
  dataMode: 'live',
  sampleData: false,
  restricted: [],
  ai: { status: 'generated', provider: 'gcp', model: 'gcp:gemini-test', summary: 'Grounded narrative', advisoryOnly: true },
  metrics: [
    { key: 'agreements', label: 'Agreements', value: 2, displayValue: '2', detail: 'Persisted contract records' },
    { key: 'high-risk', label: 'High risk', value: 1, displayValue: '1', detail: 'Playbook risk flagged' },
  ],
  insights: [{ id: 'risk', title: '1 high-risk agreement', body: 'Senior counsel review is recommended.', tone: 'risk', source: 'ai', evidenceIds: ['CLM-1'], confidence: 0.9 }],
  stageCounts: [{ stage: 'review', label: 'Review', count: 2 }],
  risk: { low: 1, medium: 0, high: 1 },
  agreements: [{
    id: 'CLM-1', title: 'Master Services Agreement', counterparty: 'Acme', type: 'SaaS', valueDisplay: 'INR 18 Cr',
    stage: 'Review', risk: 'high', version: 'v2', source: 'counterparty', obligationCount: 1, nextDueDate: '2026-10-01', signatureStatus: 'sent',
  }],
  obligations: [{
    id: 'OBL-1', contractId: 'CLM-1', contractTitle: 'Master Services Agreement', title: 'Renewal decision', dueDate: '2026-10-01', status: 'due-soon', type: 'renewal', risk: 'medium', ownerEmail: 'legal@example.test',
  }],
  signatures: [{ id: 'SIG-1', contractId: 'CLM-1', contractTitle: 'Master Services Agreement', status: 'sent', provider: 'stub', signatoryCount: 2, createdAt: '2026-09-01T00:00:00.000Z' }],
};

describe('portfolio report exporters', () => {
  it('writes a valid PDF header and includes the report title', () => {
    const output = buildPdf(report);
    expect(output.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
    expect(output.toString('latin1')).toContain('Portfolio intelligence');
  });

  it('writes Office Open XML containers for Excel and PowerPoint', () => {
    const xlsx = buildXlsx(report);
    const pptx = buildPptx(report);
    expect(xlsx.subarray(0, 2).toString('latin1')).toBe('PK');
    expect(pptx.subarray(0, 2).toString('latin1')).toBe('PK');
    expect(xlsx.length).toBeGreaterThan(2_000);
    expect(pptx.length).toBeGreaterThan(5_000);
  });
});

describe('ReportsService role scoping', () => {
  it('does not include signature rows for a viewer', async () => {
    const service = new ReportsService(
      { listFresh: async () => [{ id: 'CLM-1', title: 'A', counterparty: 'B', type: 'SaaS', valueDisplay: 'INR 1', stage: 'review', risk: 'low', version: 'v1', source: 'stored' }] } as any,
      { list: async () => [{ id: 'OBL-SIG', contractId: 'CLM-1', contractTitle: 'A', title: 'Sign', dueDate: '2026-09-11', status: 'due-soon', type: 'signature', risk: 'medium', ownerEmail: 'signatory@example.test' }] } as any,
      { list: async () => [{ id: 'SIG-1', contractId: 'CLM-1', contractTitle: 'A', status: 'sent', provider: 'stub', signatories: [], createdAt: new Date().toISOString() }] } as any,
      { enabled: true } as any,
      { record: async () => undefined } as any,
      { enrich: async () => ({ meta: { status: 'disabled', provider: 'none', advisoryOnly: true } }) } as any,
    );
    const result = await service.portfolio('viewer');
    expect(result.signatures).toEqual([]);
    expect(result.restricted).toContain('signatures');
    expect(result.agreements[0].signatureStatus).toBeUndefined();
    expect(result.obligations).toEqual([]);
  });
});
