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
signature stores. The insight language is deterministic: stage mix, playbook
risk, legal review volume, due dates and pending execution are calculated from
the same snapshot shown on the Reports page. When the API is running without
PostgreSQL or with `DEMO_SAMPLES=true`, the export labels itself as
illustrative. It does not present fixture rows as a live portfolio.

Each successful binary export appends a `report.exported` event to the
hash-chained audit trail with the signed-in actor, format, row counts and data
mode.

