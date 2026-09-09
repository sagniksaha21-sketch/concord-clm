// ─── Concord CLM · seed data ─────────────────────────────────────────────────
// Illustrative sample contracts + the built-in AI Review analysis for the
// Zenoti MSA. Swap the AI analysis for a live Azure OpenAI call by setting the
// AZURE_OPENAI_* env vars (see ai-review.service.ts).

import {
  AiReview,
  Clause,
  Contract,
  ExtractedAgreement,
  IntakeRequest,
  Obligation,
  SignatureRequest,
  Template,
} from './types';

export const CONTRACTS: Contract[] = [
  {
    id: 'CLM-2026-0442',
    title: 'Master Services Agreement',
    counterparty: 'Zenoti Technologies',
    type: 'IT / SaaS',
    valueDisplay: '₹18.4 Cr',
    stage: 'review',
    risk: 'high',
    version: 'v3',
    source: 'received from counterparty',
  },
  {
    id: 'CLM-2026-0391',
    title: 'Payroll Outsourcing Agreement',
    counterparty: 'Hinduja Global Solutions (HGS)',
    type: 'HR / Services',
    valueDisplay: '₹6.2 Cr',
    stage: 'review',
    risk: 'medium',
    version: 'v4',
    source: 'internal draft',
  },
  {
    id: 'CLM-2026-0203',
    title: 'DPDP Data Processing Addendum',
    counterparty: 'Think Walnut Digital',
    type: 'Compliance',
    valueDisplay: '—',
    stage: 'approval',
    risk: 'medium',
    version: 'v2',
    source: 'internal draft',
  },
];

/** Deterministic analysis for the Zenoti MSA, mirroring the concept prototype. */
export const AI_REVIEWS: Record<string, AiReview> = {
  'CLM-2026-0442': {
    contractId: 'CLM-2026-0442',
    riskScore: 74,
    riskLevel: 'high',
    clausesParsed: 28,
    model: 'built-in',
    summary:
      '4 deviations from LLPL standard positions — 2 high, 2 medium. Recommend senior-counsel sign-off before approval.',
    extractedTerms: [
      { key: 'Counterparty', value: 'Zenoti Technologies', flagged: false },
      { key: 'Contract value', value: '₹18.4 Cr', flagged: false },
      { key: 'Initial term', value: '3 years', flagged: false },
      { key: 'Renewal', value: 'Evergreen (3-yr auto)', flagged: true },
      { key: 'Governing law', value: 'Singapore', flagged: true },
      { key: 'Liability cap', value: '1× fees / 3 months', flagged: true },
    ],
    clauses: [
      {
        id: 'cl-8',
        clauseNo: '8',
        heading: 'Limitation of Liability',
        excerpt:
          'the total aggregate liability of the Service Provider under this Agreement shall not exceed the fees paid by the Customer in the three (3) months immediately preceding the claim',
        risk: 'high',
        pin: 'H1',
      },
      {
        id: 'cl-12',
        clauseNo: '12',
        heading: 'Term & Renewal',
        excerpt:
          'it shall automatically renew for successive three (3) year terms unless either party gives ninety (90) days’ notice of non-renewal',
        risk: 'medium',
        pin: 'M1',
      },
      {
        id: 'cl-19',
        clauseNo: '19',
        heading: 'Governing Law & Dispute Resolution',
        excerpt:
          'This Agreement shall be governed by the laws of Singapore, and disputes shall be referred to arbitration seated in Singapore under the SIAC Rules',
        risk: 'medium',
        pin: 'M2',
      },
      {
        id: 'cl-22',
        clauseNo: '22',
        heading: 'Data Protection',
        excerpt:
          'No Data Processing Addendum is annexed, and the Agreement does not reference India’s Digital Personal Data Protection Act, 2023',
        risk: 'high',
        pin: 'H2',
      },
    ],
    deviations: [
      {
        id: 'd1',
        clauseNo: '8',
        title: 'Limitation of Liability',
        severity: 'high',
        description:
          'Cap of 1× fees over 3 months is far below the LLPL floor of 3× fees over 12 months, with no carve-outs for confidentiality, data breach or IP indemnity.',
        redline: {
          original:
            '…shall not exceed the fees paid in the preceding three (3) months.',
          suggested:
            '…shall not exceed 3× the fees paid in the preceding twelve (12) months; this cap shall not apply to breach of confidentiality, data-protection obligations or IP indemnity.',
        },
        actionLabel: 'Accept redline',
      },
      {
        id: 'd2',
        clauseNo: '12',
        title: 'Auto-renewal',
        severity: 'medium',
        description:
          'Three-year evergreen renewal locks LLPL in. Playbook prefers a 1-year renewal with a 60-day exit and a price-review trigger.',
        actionLabel: 'Apply fallback',
      },
      {
        id: 'd3',
        clauseNo: '19',
        title: 'Governing law',
        severity: 'medium',
        description:
          'Singapore seat conflicts with the LLPL standard of Indian law / Mumbai arbitration for domestic vendors. Cost and enforceability implications flagged.',
        actionLabel: 'Apply fallback',
      },
      {
        id: 'd4',
        clauseNo: '22',
        title: 'Data protection',
        severity: 'high',
        description:
          'No DPA and no reference to the DPDP Act, 2023. Insert the LLPL standard DPDP addendum and processor obligations from the clause library.',
        actionLabel: 'Insert DPDP addendum',
      },
    ],
  },
};

/** Obligations & key dates extracted from the portfolio. */
export const OBLIGATIONS: Obligation[] = [
  {
    id: 'OBL-0001',
    title: 'SLA credit reconciliation',
    contractId: 'CLM-2026-0442',
    contractTitle: 'Zenoti MSA',
    ownerEmail: 'sagnik.saha@lakmelever.com',
    ownerInitials: 'SS',
    dueDate: '2026-09-30',
    status: 'at-risk',
    type: 'financial',
    risk: 'high',
    outlookScheduled: true,
  },
  {
    id: 'OBL-0002',
    title: 'Rent escalation review',
    contractId: 'CLM-2026-0288',
    contractTitle: 'Phoenix Salon Lease',
    ownerEmail: 'anaya.kapoor@lakmelever.com',
    ownerInitials: 'AK',
    dueDate: '2026-10-11',
    status: 'due-soon',
    type: 'financial',
    risk: 'medium',
    outlookScheduled: true,
  },
  {
    id: 'OBL-0003',
    title: 'Quarterly compliance report',
    contractId: 'CLM-2026-0117',
    contractTitle: 'Dermalogica Distribution',
    ownerEmail: 'rohan.pillai@lakmelever.com',
    ownerInitials: 'RP',
    dueDate: '2026-10-25',
    status: 'on-track',
    type: 'deliverable',
    risk: 'low',
    outlookScheduled: false,
  },
  {
    id: 'OBL-0004',
    title: 'DPDP re-consent cycle',
    contractId: 'CLM-2026-0203',
    contractTitle: 'Think Walnut DPA',
    ownerEmail: 'sagnik.saha@lakmelever.com',
    ownerInitials: 'SS',
    dueDate: '2026-11-03',
    status: 'scheduled',
    type: 'compliance',
    risk: 'medium',
    outlookScheduled: true,
  },
  {
    id: 'OBL-0005',
    title: 'Insurance certificate renewal',
    contractId: 'CLM-2026-0459',
    contractTitle: 'Facility Management',
    ownerEmail: 'anaya.kapoor@lakmelever.com',
    ownerInitials: 'AK',
    dueDate: '2026-11-20',
    status: 'on-track',
    type: 'compliance',
    risk: 'low',
    outlookScheduled: false,
  },
  {
    id: 'OBL-0006',
    title: 'Volume rebate true-up',
    contractId: 'CLM-2026-0117',
    contractTitle: 'Dermalogica Distribution',
    ownerEmail: 'rohan.pillai@lakmelever.com',
    ownerInitials: 'RP',
    dueDate: '2026-11-24',
    status: 'on-track',
    type: 'financial',
    risk: 'low',
    outlookScheduled: false,
  },
];

// ─── Sample documents for the ingestion demo ─────────────────────────────────
// Raw extractions (as an LLM would return). The ingestion service runs the real
// PAN/GSTIN validators over these, so the checksums must be genuine.

const LLPL = {
  name: 'Lakmē Lever Private Limited',
  address: 'Lever House, B. D. Sawant Marg, Andheri (E), Mumbai 400 099',
  pan: 'AAACL2345N',
  gstin: '27AAACL2345N1ZC',
};

export interface SampleDoc {
  documentType: string;
  pages: number;
  baseConfidence: number;
  notes: string[];
  extraction: ExtractedAgreement;
}

/** Keyed by a lowercase substring matched against the uploaded filename. */
export const SAMPLE_DOCS: Record<string, SampleDoc> = {
  zenoti: {
    documentType: 'Master Services Agreement (born-digital PDF)',
    pages: 24,
    baseConfidence: 98,
    notes: [],
    extraction: {
      effectiveDate: '2024-04-01',
      term: '3 years',
      expiryDate: '2027-03-31',
      parties: [
        { role: 'Customer', ...LLPL },
        { role: 'Service Provider', name: 'Zenoti Technologies Pvt. Ltd.', address: 'Prestige Tech Park, Marathahalli, Bengaluru 560 103', pan: 'AAACZ1234F', gstin: '29AAACZ1234F1ZH' },
      ],
    },
  },
  hgs: {
    documentType: 'Payroll Outsourcing Agreement (DOCX)',
    pages: 18,
    baseConfidence: 96,
    notes: [],
    extraction: {
      effectiveDate: '2025-06-15',
      term: '3 years',
      expiryDate: '2028-06-14',
      parties: [
        { role: 'Principal', ...LLPL },
        { role: 'Service Provider', name: 'Hinduja Global Solutions Ltd.', address: 'No. 44, Whitefield Main Road, Bengaluru 560 048', pan: 'AAACH5678M', gstin: '29AAACH5678M1ZW' },
      ],
    },
  },
  phoenix: {
    documentType: 'Salon Lease Deed (scanned PDF)',
    pages: 41,
    baseConfidence: 88,
    notes: ['Registered address of the lessor extracted at 71% OCR confidence — flagged for human check.'],
    extraction: {
      effectiveDate: '2023-01-01',
      term: '9 years',
      expiryDate: '2031-12-31',
      parties: [
        { role: 'Lessee', ...LLPL },
        { role: 'Lessor', name: 'Island Star Mall Developers Pvt. Ltd.', address: 'Phoenix Marketcity, LBS Marg, Kurla (W), Mumbai 400 070', pan: 'AAACP9012Q', gstin: '27AAACP9012Q1Z0' },
      ],
    },
  },
  dermalogica: {
    documentType: 'Distribution Agreement (PDF)',
    pages: 12,
    baseConfidence: 97,
    notes: [],
    extraction: {
      effectiveDate: '2024-07-01',
      term: '2 years',
      expiryDate: '2026-06-30',
      parties: [
        { role: 'Distributor', ...LLPL },
        { role: 'Principal', name: 'Dermalogica India Pvt. Ltd.', address: 'Kalpataru Square, Andheri (E), Mumbai 400 059', pan: 'AAACD3456R', gstin: '27AAACD3456R1Z6' },
      ],
    },
  },
  walnut: {
    documentType: 'DPDP Data Processing Addendum (PDF)',
    pages: 9,
    baseConfidence: 95,
    notes: [],
    extraction: {
      effectiveDate: '2025-02-10',
      term: 'Coterminous with the principal MSA',
      expiryDate: '—',
      parties: [
        { role: 'Data Fiduciary', ...LLPL },
        { role: 'Data Processor', name: 'Think Walnut Digital Pvt. Ltd.', address: 'Salt Lake Sector V, Kolkata 700 091', pan: 'AAACT7890K', gstin: '19AAACT7890K1ZN' },
      ],
    },
  },
  glow: {
    documentType: 'FOFO Franchise Agreement (PDF)',
    pages: 27,
    baseConfidence: 94,
    notes: ['Franchisee GSTIN not on record — below registration threshold.'],
    extraction: {
      effectiveDate: '2025-09-01',
      term: '5 years',
      expiryDate: '2030-08-31',
      parties: [
        { role: 'Franchisor', ...LLPL },
        { role: 'Franchisee', name: 'M/s Glow & Co.', address: 'Linking Road, Bandra (W), Mumbai 400 050', pan: 'AAFFG5678C' },
      ],
    },
  },
};

// ─── Authoring: clause library + templates ───────────────────────────────────

export const CLAUSES: Clause[] = [
  { id: 'CL-LIAB', title: 'Limitation of Liability', category: 'Risk', playbookStandard: true, text: 'The aggregate liability of each party shall not exceed three (3) times the fees paid in the preceding twelve (12) months; liability for breach of confidentiality, data-protection obligations and IP indemnity shall be uncapped.' },
  { id: 'CL-LAW', title: 'Governing Law & Dispute Resolution', category: 'Boilerplate', playbookStandard: true, text: 'This Agreement is governed by the laws of India. Disputes shall be referred to arbitration seated in Mumbai under the Arbitration and Conciliation Act, 1996.' },
  { id: 'CL-DPDP', title: 'Data Protection (DPDP)', category: 'Compliance', playbookStandard: true, text: 'Each party shall comply with the Digital Personal Data Protection Act, 2023. The Data Processing Addendum at Annexure A forms part of this Agreement.' },
  { id: 'CL-TERM', title: 'Term & Termination', category: 'Commercial', playbookStandard: true, text: 'Either party may terminate for convenience on sixty (60) days written notice, and immediately on material breach uncured within thirty (30) days.' },
  { id: 'CL-CONF', title: 'Confidentiality', category: 'Boilerplate', playbookStandard: true, text: 'Each party shall keep the other party’s Confidential Information secret during the term and for five (5) years thereafter.' },
  { id: 'CL-INDEM', title: 'Indemnity', category: 'Risk', playbookStandard: true, text: 'The Service Provider shall indemnify Lakmē Lever against third-party claims arising from IP infringement or violation of applicable law.' },
];

export const TEMPLATES: Template[] = [
  { id: 'TPL-MSA', name: 'Master Services Agreement', contractType: 'IT / SaaS', description: 'Standard MSA for vendors and SaaS providers.', clauseIds: ['CL-LIAB', 'CL-LAW', 'CL-DPDP', 'CL-TERM', 'CL-CONF', 'CL-INDEM'] },
  { id: 'TPL-NDA', name: 'Mutual NDA', contractType: 'Compliance', description: 'Two-way non-disclosure agreement.', clauseIds: ['CL-CONF', 'CL-LAW', 'CL-TERM'] },
  { id: 'TPL-LEASE', name: 'Salon Lease Deed', contractType: 'Real Estate', description: 'Lease deed for salon premises.', clauseIds: ['CL-LAW', 'CL-TERM', 'CL-INDEM'] },
  { id: 'TPL-FOFO', name: 'FOFO Franchise Agreement', contractType: 'Franchise', description: 'Franchise-owned, franchise-operated agreement.', clauseIds: ['CL-LAW', 'CL-TERM', 'CL-CONF', 'CL-INDEM', 'CL-DPDP'] },
];

// ─── Intake requests ─────────────────────────────────────────────────────────

export const INTAKE_REQUESTS: IntakeRequest[] = [
  { id: 'INT-2026-001', title: 'SAP S/4HANA AMS renewal', counterparty: 'SAP India', businessUnit: 'IT', requestor: 'priya.menon@lakmelever.com', contractType: 'IT / SaaS', description: 'Renew annual application management support for SAP.', suggestedTemplateId: 'TPL-MSA', triageRisk: 'low', status: 'triaged', createdAt: '2026-08-20' },
  { id: 'INT-2026-002', title: 'Influencer engagement — Nykaa', counterparty: 'Nykaa Beauty', businessUnit: 'Marketing', requestor: 'arjun.rao@lakmelever.com', contractType: 'Marketing', description: 'Engage Nykaa for a festive influencer campaign.', suggestedTemplateId: 'TPL-MSA', triageRisk: 'low', status: 'new', createdAt: '2026-08-25' },
];


// ─── E-signature requests (Melento) — illustrative seed ──────────────────────
export const SIGNATURE_REQUESTS: SignatureRequest[] = [
  {
    id: 'SIG-2026-014',
    contractId: 'CLM-2026-0391',
    contractTitle: 'HGS Payroll Outsourcing Agreement',
    provider: 'stub',
    status: 'sent',
    envelopeId: 'MEL-ENV-8F3AA1',
    signingUrl: 'https://app.melento.example/sign/8F3AA1',
    message: 'Please review and sign the executed payroll outsourcing agreement.',
    signatories: [
      { name: 'Sagnik Saha', email: 'sagnik.saha@lakmelever.com', role: 'Lakmē Lever — Authorised Signatory', order: 1, status: 'signed', signedAt: '2026-08-27T10:12:00Z' },
      { name: 'Rahul Verma', email: 'rahul.verma@hgs.example', role: 'HGS — Authorised Signatory', order: 2, status: 'sent' },
    ],
    stampPaper: { state: 'Maharashtra', article: 'Art. 5(h) — Agreement', considerationAmount: 62000000, dutyAmount: 30000, paidBy: 'Lakmē Lever', certificateNo: 'IN-MH-STAMP-2026-77120', status: 'procured' },
    createdAt: '2026-08-27T09:40:00Z',
    sentAt: '2026-08-27T09:41:00Z',
    audit: [
      { event: 'created', at: '2026-08-27T09:40:00Z', by: 'sagnik.saha@lakmelever.com' },
      { event: 'stamp-procured', at: '2026-08-27T09:40:40Z', detail: 'e-stamp IN-MH-STAMP-2026-77120 (₹30,000, Maharashtra)' },
      { event: 'sent', at: '2026-08-27T09:41:00Z', detail: 'Envelope MEL-ENV-8F3AA1 dispatched to 2 signatories' },
      { event: 'signed', at: '2026-08-27T10:12:00Z', by: 'sagnik.saha@lakmelever.com' },
    ],
  },
  {
    id: 'SIG-2026-011',
    contractId: 'CLM-2026-0442',
    contractTitle: 'Zenoti Master Services Agreement',
    provider: 'stub',
    status: 'completed',
    envelopeId: 'MEL-ENV-5C21D9',
    message: 'Countersignature for the Zenoti MSA renewal.',
    signatories: [
      { name: 'Sagnik Saha', email: 'sagnik.saha@lakmelever.com', role: 'Lakmē Lever — Authorised Signatory', order: 1, status: 'signed', signedAt: '2026-08-19T14:02:00Z' },
      { name: 'Sudheer Koneru', email: 'legal@zenoti.example', role: 'Zenoti — Authorised Signatory', order: 2, status: 'signed', signedAt: '2026-08-20T06:20:00Z' },
    ],
    stampPaper: { state: 'Karnataka', article: 'Art. 5(c) — Agreement', dutyAmount: 500, paidBy: 'Zenoti', certificateNo: 'IN-KA-STAMP-2026-40318', status: 'affixed' },
    createdAt: '2026-08-19T13:50:00Z',
    sentAt: '2026-08-19T13:51:00Z',
    completedAt: '2026-08-20T06:20:00Z',
    audit: [
      { event: 'created', at: '2026-08-19T13:50:00Z', by: 'sagnik.saha@lakmelever.com' },
      { event: 'stamp-procured', at: '2026-08-19T13:50:30Z', detail: 'e-stamp IN-KA-STAMP-2026-40318 (₹500, Karnataka)' },
      { event: 'sent', at: '2026-08-19T13:51:00Z' },
      { event: 'signed', at: '2026-08-19T14:02:00Z', by: 'sagnik.saha@lakmelever.com' },
      { event: 'signed', at: '2026-08-20T06:20:00Z', by: 'legal@zenoti.example' },
      { event: 'completed', at: '2026-08-20T06:20:00Z', detail: 'All parties signed; stamped document sealed' },
    ],
  },
];
