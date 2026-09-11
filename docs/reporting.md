# Concord portfolio reporting

Concord exposes one role-scoped portfolio snapshot at `GET /api/reports/portfolio`.
The export routes are:

- `GET /api/reports/portfolio/xlsx` for the Excel workbook.
- `GET /api/reports/portfolio/pdf` for the PDF brief.
- `GET /api/reports/portfolio/pptx` for the editable PowerPoint insight deck.

All routes require `contract:read` and use the current session role. A role that
cannot read e-signature records receives no provider envelope or signatory
detail. Agreement source text is not included in the exports.

The report is calculated from the persisted contract, obligation, document and
signature stores. Stage mix, playbook risk, legal review volume, due dates and
pending execution are calculated from the selected records. Each preview or
export reads a fresh snapshot using the applied filters; records changed after
a preview can therefore appear in the next export. When the API is running without
PostgreSQL or with `DEMO_SAMPLES=true`, the export labels itself as
illustrative. It does not present fixture rows as a live portfolio.

## Personalised presentations

The Reports page offers two editable PowerPoint styles, using Concord's original
palette: **Black & Gold** and **Golden Champagne**. The choice affects the next
PowerPoint download; it does not change the application's appearance preference.
Slides include the selected scope, calculated figures, every insight, supporting
record references, priority rows and a provenance page. Longer insights and briefs
continue onto additional slides. The Excel register retains every selected row.

Choose a report cut (portfolio, high risk, dates and renewals, review and approvals,
or signatures), optionally match an agreement title, counterparty or type, then
select a date horizon. Dates and renewals include overdue obligations and those due
within the horizon. Other cuts use the horizon for their upcoming-obligations
metric. Signature access restrictions are applied before filtering or AI processing.

Add an optional brief of up to 1,500 characters to guide audience, emphasis and
tone. For example: "Prepare a leadership brief. Prioritise high-risk agreements,
the decisions needed and supporting records." Explicit filters define the records
in scope; prompt wording does not silently change the dataset. Apply the brief
and filters before downloading. Example briefs provide useful starting points.

Personalised requests use `POST /api/reports/portfolio` and
`POST /api/reports/portfolio/:format`, with the same permissions as the GET routes.
They accept this validated JSON body (all fields are optional):

```json
{
  "theme": "golden-champagne",
  "focus": "risk",
  "query": "vendor name",
  "horizonDays": 90,
  "prompt": "Explain the decisions needed for a leadership audience."
}
```

Valid theme values are `black-gold` and `golden-champagne`. Valid focus values are
`portfolio`, `risk`, `renewals`, `approvals` and `signatures`. The horizon accepts
1–365 days; the UI offers 30, 90, 180 and 365. Agreement matching accepts up to 160
characters. Existing GET clients keep the default portfolio view and Black & Gold
deck. Brief text is sent in the request body, not in URL query strings.

## Optional AI narrative

Set `REPORT_AI_PROVIDER=gcp` together with the approved `GCP_PROJECT_ID`,
`GCP_LOCATION` and `GCP_GEMINI_MODEL` configuration to enable grounded Gemini
narrative. The model receives the optional user brief and role-scoped, filtered
report metadata (metrics, stages, risks, dates and row IDs); stored raw contract
text, owner emails and provider tokens are not sent. It returns advisory titles and explanations with evidence
row IDs and a confidence score. Metrics and dates in every export remain the
database snapshot, never model-generated values.

If Vertex AI is unavailable, returns invalid JSON, or produces an ungrounded
evidence ID, Concord keeps the deterministic findings and labels the report
`Deterministic fallback`. Generated exports record the provider/model and
advisory provenance in the audit event. AI never approves, signs, changes a
workflow state or executes an agreement.

Themes, filters and calculated findings work without an AI connection. A custom
AI brief requires the configured provider; when unavailable, both the page and
PowerPoint explicitly say the brief was not applied. The system does not present
calculated findings as personalised AI commentary. Cached AI responses are scoped
to the selected facts, brief and model, so different briefs cannot reuse one
another's responses.

Each successful binary export appends a `report.exported` event to the
hash-chained audit trail with the signed-in actor, format, row counts, data mode,
theme, focus and horizon. Audit metadata records whether a brief or agreement
filter was supplied, without copying their raw text.
