import { GeminiSchema } from './gcp-ai';

const string = { type: 'STRING' };
const risk = { type: 'STRING', enum: ['low', 'medium', 'high'] };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)): GeminiSchema =>
  ({ type: 'OBJECT', properties, required });
const array = (items: GeminiSchema): GeminiSchema => ({ type: 'ARRAY', items });

/** Provider schemas complement the runtime/domain validators; neither replaces the other. */
export const REVIEW_SCHEMA = object({
  riskScore: { type: 'NUMBER', minimum: 0, maximum: 100 }, riskLevel: risk,
  clausesParsed: { type: 'INTEGER', minimum: 0 }, summary: string,
  extractedTerms: array(object({ key: string, value: string, flagged: { type: 'BOOLEAN' } })),
  clauses: array(object({ id: string, clauseNo: string, heading: string, excerpt: string, risk, pin: string })),
  deviations: array(object({
    id: string, clauseNo: string, title: string, severity: risk, description: string, actionLabel: string,
    redline: object({ original: string, suggested: string }),
  }, ['id', 'clauseNo', 'title', 'severity', 'description', 'actionLabel'])),
});

export const EXTRACTION_SCHEMA = object({
  effectiveDate: string, term: string, expiryDate: string,
  parties: array(object({ role: string, name: string, address: string, pan: string, gstin: string }, [])),
}, ['parties']);

export const DRAFT_SCHEMA = object({ sections: array(object({ heading: string, body: string })) });

/**
 * Portfolio reporting deliberately lets Gemini author narrative only. Numeric
 * metrics, dates and rows stay outside this schema and are always rendered
 * from the role-scoped database snapshot.
 */
export const REPORT_INSIGHTS_SCHEMA = object({
  summary: { type: 'STRING' },
  insights: array(object({
    id: string,
    title: string,
    body: string,
    tone: { type: 'STRING', enum: ['info', 'watch', 'risk'] },
    evidenceIds: array(string),
    confidence: { type: 'NUMBER', minimum: 0, maximum: 1 },
  })),
});
