import { evaluateApprovalPolicies, ApprovalPolicy } from '@concord/shared';
import { validateCommitments, extractCommitments } from '../../src/obligations/obligation-extraction';
import { validateRoundAnalysis, analyzeNegotiation } from '../../src/negotiation/round-analysis';
import { negotiationMetrics } from '../../src/reports/negotiation-metrics';
import { preserveWord, cleanWordForSharing, wordLockedSections } from '../../src/agreements/preserve-word';
import { readEditableDocument, readWordPackage } from '../../src/agreements/read-document';
import { zip } from '../../src/reports/zip';
const policy = (conditions: ApprovalPolicy['conditions']): ApprovalPolicy => ({ id: 'finance', revision: 2, name: 'Finance', enabled: true, conditions, approvers: ['finance@example.test'] });
describe('Mandatory approval policy decisions', () => {
  it('matches combined conditions and records the exact policy revision', () => {
    const rule = policy({ minimumValue: 10000, currency: 'INR', risks: ['high'], businessUnits: ['Marketing'], personalData: true });
    const c = { risk: 'high', intakeRequest: { businessUnit: 'marketing', terms: { amount: '12500.50', currency: 'INR', dataInvolved: 'personal' } } };
    expect(evaluateApprovalPolicies([rule],c)[0]).toMatchObject({ revision: 2, approvers: ['finance@example.test'] });
    expect(evaluateApprovalPolicies([rule],{ ...c, risk: 'low' })).toEqual([]);
  });
  it('does not waive a value approval for missing facts or mixed currencies', () => {
    const rule = policy({ minimumValue: 10000, currency: 'INR' });
    for (const terms of [{}, { amount: '200', currency: 'USD' }, { amount: '1 Cr', currency: 'INR' }]) expect(evaluateApprovalPolicies([rule],{ intakeRequest: { terms } })[0].reason).toContain('conservatively');
    expect(evaluateApprovalPolicies([rule],{ intakeRequest: { terms: { amount: '999.99', currency: 'INR' } } })).toEqual([]);
  });
  it('supports disabled policies, exact agreement types, privacy and explicit negative terms', () => {
    expect(evaluateApprovalPolicies([{ ...policy({}), enabled: false }],{})).toEqual([]);
    expect(evaluateApprovalPolicies([policy({ exclusivity: true })],{ intakeRequest: { terms: { exclusivity: 'None' } } })).toEqual([]);
    expect(evaluateApprovalPolicies([policy({ personalData: true })],{ intakeRequest: { terms: { dataInvolved: 'none' } } })).toEqual([]);
    expect(evaluateApprovalPolicies([policy({ agreementTypes: ['MSA'] })],{ type: 'NDA' })).toEqual([]);
  });
});
describe('Source-grounded lifecycle intelligence', () => {
  const excerpt = 'The Supplier shall maintain insurance and provide annual certificates.';
  afterEach(() => { delete process.env.AI_REVIEW_PROVIDER; });
  it('accepts verifiable commitments without inventing dates or owners', () => {
    expect(validateCommitments({ commitments: [{ title: 'Insurance certificate', type: 'insurance', excerpt, dueDate: '' }] },excerpt)).toHaveLength(1);
    expect(() => validateCommitments({ commitments: [{ title: 'Certificate', type: 'insurance', excerpt, dueDate: '2027-01-01' }] },excerpt)).toThrow('date');
    expect(() => validateCommitments({ commitments: [{ title: 'Pay', type: 'payment', excerpt: 'Unrelated fabricated source language.' }] },excerpt)).toThrow('source');
  });
  it('extracts transparent candidate provisions when no AI is configured', async () => {
    process.env.AI_REVIEW_PROVIDER = 'none';
    const r = await extractCommitments(excerpt+'\n\nCustomer shall pay invoices within 30 days.');
    expect(r.model).toBe('rules:source-provisions');
    expect(r.candidates.map(c => c.type)).toEqual(['insurance','payment']);
    expect(r.candidates.every(c => c.dueDate === '')).toBe(true);
  });
  const change: any = { id: 'liability', kind: 'modified', heading: 'Liability', before: 'Liability shall not exceed fees paid.', after: 'Liability shall not exceed twice the fees paid.' };
  const assessment = { changeId: 'liability', risk: 'medium', explanation: 'The proposed cap increases.', excerpt: change.after, playbookId: 'cap', playbookExcerpt: change.before, fallback: 'Consider a negotiated cap.', businessQuestion: 'Confirm commercial exposure.', approvalConsideration: 'Review Finance requirements.' };
  it('requires evidence for both changed language and every asserted playbook position', () => {
    const clauses = [{ id: 'cap', text: change.before }];
    expect(validateRoundAnalysis({ assessments: [assessment] },[change],clauses)).toHaveLength(1);
    expect(() => validateRoundAnalysis({ assessments: [{ ...assessment, excerpt: 'A fabricated counterparty sentence.' }] },[change],clauses)).toThrow('evidence');
    expect(() => validateRoundAnalysis({ assessments: [assessment] },[change],[])).toThrow('playbook');
    expect(() => validateRoundAnalysis({ assessments: [assessment,assessment] },[change],clauses)).toThrow('exactly once');
  });
  it('does not manufacture risk classifications without a provider', async () => {
    process.env.AI_REVIEW_PROVIDER = 'none';
    expect(await analyzeNegotiation([change],[])).toMatchObject({ status: 'unavailable', assessments: [] });
  });
});
describe('Recorded negotiation analytics', () => {
  it('uses actual response events and excludes open negotiations from completion medians', () => {
    const rows = [{ id: 'a', title: 'A', counterparty: 'Acme', agreedAt: '2026-09-05T00:00:00Z' },{ id: 'b', title: 'B', counterparty: 'Beta' }];
    const rounds = [{ contractId: 'a', createdAt: '2026-09-01T00:00:00Z', responses: [{ createdAt: '2026-09-03T00:00:00Z', reviewedAt: '2026-09-04T00:00:00Z', invitation: { createdAt: '2026-09-02T00:00:00Z' }, changes: [{ heading: 'Liability', before: '1x fees', after: '2x fees' }] }] },{ contractId: 'b', createdAt: '2026-09-01T00:00:00Z', responses: [] }];
    const n = negotiationMetrics(rows,rounds,'2026-09-10T00:00:00Z');
    expect(n).toMatchObject({ medianCompletionDays: 4, completedCount: 1, medianLegalHours: 24, medianCounterpartyHours: 24, legalResponseSamples: 1 });
    expect(n.agreements[1].counterpartyResponseHours).toBeNull();
    expect(n.clausePatterns[0].agreementIds).toEqual(['a']);
  });
});
const word = (body: string, extras: { name: string; data: string | Buffer }[] = []) => zip([{ name: '[Content_Types].xml', data: '<Types/>' },{ name: 'word/document.xml', data: `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>` },...extras]);
describe('Word structural preservation and clean sharing', () => {
  it('retains spacer paragraphs without shifting the editable outline or protected sections', () => {
    const spacer = '<w:p><w:r><w:t xml:space="preserve">   </w:t></w:r></w:p>';
    const file = word(`${spacer}<w:p><w:r><w:t>Payment within 30 days.</w:t></w:r></w:p>${spacer}<w:p><w:r><w:t>Illustration</w:t><w:drawing/></w:r></w:p>`);
    const source = readEditableDocument(file,'spaced.docx');
    expect(wordLockedSections(file)).toEqual(['paragraph-1']);
    const output = preserveWord(file,[{ ...source.sections[0],body:'Payment within 45 days.' },source.sections[1]]);
    const xml = readWordPackage(output).find(p=>p.name === 'word/document.xml')!.data.toString();
    expect(xml.split(spacer)).toHaveLength(3);
    expect(readEditableDocument(output,'saved.docx').sections.map(s=>s.body)).toEqual(['Payment within 45 days.','Illustration']);
  });
  it('edits table-cell text while preserving drawings, table properties and other document parts', () => {
    const file = word('<w:tbl><w:tblPr><w:tblW w:w="5000"/></w:tblPr><w:tr><w:tc><w:p><w:r><w:t>Payment within 30 days.</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:drawing/></w:r></w:p>',[{ name:'word/media/image1.png',data:Buffer.from([1,2,3]) },{ name:'word/header1.xml',data:'<w:hdr><w:p>Brand</w:p></w:hdr>' }]);
    const source = readEditableDocument(file,'table.docx');
    const output = preserveWord(file,[{ ...source.sections[0], body: 'Payment within 45 days.' }]);
    const parts = readWordPackage(output);
    expect(parts.find(p => p.name === 'word/document.xml')!.data.toString()).toContain('<w:tblPr><w:tblW w:w="5000"/></w:tblPr>');
    expect(parts.find(p => p.name === 'word/document.xml')!.data.toString()).toContain('<w:drawing/>');
    expect(parts.find(p => p.name === 'word/media/image1.png')!.data).toEqual(Buffer.from([1,2,3]));
    expect(parts.find(p => p.name === 'word/header1.xml')!.data.toString()).toContain('Brand');
    expect(readEditableDocument(output,'saved.docx').sections[0].body).toContain('45 days');
  });
  it('blocks structural changes and editing of anchored content', () => {
    const file = word('<w:p><w:r><w:t>Payment terms</w:t><w:drawing/></w:r></w:p>');
    const source = readEditableDocument(file,'source.docx');
    expect(wordLockedSections(file)).toEqual(['paragraph-0']);
    expect(() => preserveWord(file,[{ ...source.sections[0],body:'Changed text' }])).toThrow('drawing');
    expect(() => preserveWord(file,[])).toThrow('insert, remove or reorder');
  });
  it('preserves run-level redlines until explicitly accepted', () => {
    const file = word('<w:p><w:r><w:t>Liability: </w:t></w:r><w:del><w:r><w:delText>one year fees</w:delText></w:r></w:del><w:ins><w:r><w:t>two years fees</w:t></w:r></w:ins></w:p>');
    const source = readEditableDocument(file,'redline.docx');
    expect(() => cleanWordForSharing(file)).toThrow('tracked changes');
    const accepted = preserveWord(file,source.sections,true);
    expect(readEditableDocument(accepted,'accepted.docx').trackedChanges).toBe(false);
    expect(readEditableDocument(accepted,'accepted.docx').sections[0].body).toBe('Liability: two years fees');
  });
  it('removes private package metadata and comments without discarding document structure', () => {
    const file = word('<w:p><w:commentRangeStart w:id="1"/><w:r><w:t>Visible language</w:t></w:r><w:commentRangeEnd w:id="1"/></w:p>',[{ name:'word/comments.xml',data:'<comments>Internal privileged note</comments>' },{ name:'docProps/core.xml',data:'<core>Private author</core>' },{ name:'customXml/item1.xml',data:'<secret>Private data</secret>' }]);
    const clean = cleanWordForSharing(file), parts = readWordPackage(clean);
    expect(parts.map(p => p.name)).toEqual(['[Content_Types].xml','word/document.xml']);
    expect(parts[1].data.toString()).not.toContain('commentRange');
    expect(parts[1].data.toString()).toContain('Visible language');
    expect(cleanWordForSharing(clean)).toEqual(clean);
  });
  it('refuses unknown parts, hidden text and dangerous relationships before external sharing', () => {
    expect(() => cleanWordForSharing(word('<w:p><w:r><w:rPr><w:vanish/></w:rPr><w:t>Strategy</w:t></w:r></w:p>'))).toThrow('hidden');
    expect(() => cleanWordForSharing(word('<w:p/>',[{ name:'word/unknown.xml', data:'<private/>' }]))).toThrow('inspection');
    expect(() => cleanWordForSharing(word('<w:p/>',[{ name:'word/_rels/document.xml.rels', data:'<Relationships><Relationship Type="evil" Target="https://example.test" TargetMode="External"/></Relationships>' }]))).toThrow('references');
  });
});
