const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, PageBreak,
  Header, Footer, PageNumber, LevelFormat, ImageRun,
} = require('docx');

const LOGO = fs.readFileSync('/home/claude/concord-clm/lakme-lever-logo-bw.png');

// ── palette (black & white) ──────────────────────────────────────────────
const GOLD = '000000', GOLD_L = 'EDEDED', INK = '111111', MUTE = '666666';
const FILLNOTE = '000000', HEADFILL = '000000', LINE = 'C8C8C8', ALT = 'F5F5F5';
const A4 = { width: 11906, height: 16838 };

// ── helpers ─────────────────────────────────────────────────────────────
const t = (text, o = {}) => new TextRun({ text, font: 'Calibri', color: o.color || INK, size: o.size || 20, bold: o.bold, italics: o.italics });
const p = (children, o = {}) => {
  let k = Array.isArray(children) ? children : [children];
  k = k.map((x) => (typeof x === 'string' ? t(x, o) : x));
  return new Paragraph({ children: k, spacing: { after: o.after ?? 130, before: o.before ?? 0, line: 278 }, alignment: o.align });
};
// fill-in marker for LLPL to complete (grey highlight so fields stand out in B&W)
const fill = (label) => new TextRun({ text: `[ ${label} ]`, font: 'Calibri', color: FILLNOTE, size: 20, bold: true, shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'E4E4E4' } });
const h1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 340, after: 150 }, children: [new TextRun({ text, font: 'Calibri', bold: true, color: INK, size: 30 })] });
const h2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 100 }, children: [new TextRun({ text, font: 'Calibri', bold: true, color: GOLD, size: 23 })] });
const cb = { style: BorderStyle.SINGLE, size: 4, color: LINE };
const borders = { top: cb, bottom: cb, left: cb, right: cb };

function cell(text, w, o = {}) {
  const runs = Array.isArray(text) ? text : [typeof text === 'string' ? t(text, { size: o.size || 18, bold: o.bold, color: o.color }) : text];
  return new TableCell({
    width: { size: w, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 95, right: 95 },
    shading: o.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fill } : undefined,
    verticalAlign: 'center', borders,
    children: runs.map((r) => new Paragraph({ children: [r], spacing: { after: 0, line: 250 }, alignment: o.align })),
  });
}
function headCell(text, w) {
  return new TableCell({
    width: { size: w, type: WidthType.DXA }, margins: { top: 70, bottom: 70, left: 95, right: 95 },
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: HEADFILL }, verticalAlign: 'center', borders,
    children: [new Paragraph({ children: [t(text, { color: 'FFFFFF', bold: true, size: 18 })], spacing: { after: 0 } })],
  });
}
function table(widths, headers, rows) {
  const trs = [new TableRow({ tableHeader: true, children: headers.map((hd, i) => headCell(hd, widths[i])) })];
  rows.forEach((r, ri) => trs.push(new TableRow({
    children: r.map((c, i) => {
      const o = (c && typeof c === 'object' && !Array.isArray(c) && !c.constructor?.name?.includes('Run')) ? c : {};
      const val = o.text !== undefined ? o.text : c;
      return cell(val, widths[i], { size: 18, fill: ri % 2 ? ALT : undefined, bold: o.bold, color: o.color, align: o.align });
    }),
  })));
  return new Table({ columnWidths: widths, width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA }, rows: trs });
}
const bullet = (children) => new Paragraph({ numbering: { reference: 'b', level: 0 }, spacing: { after: 66, line: 272 }, children: (Array.isArray(children) ? children : [children]).map((x) => (typeof x === 'string' ? t(x) : x)) });
const num = (children) => new Paragraph({ numbering: { reference: 'n', level: 0 }, spacing: { after: 66, line: 272 }, children: (Array.isArray(children) ? children : [children]).map((x) => (typeof x === 'string' ? t(x) : x)) });
const sp = (n = 1) => new Paragraph({ children: [t('')], spacing: { after: n * 70 } });

const body = [];

// ── cover ───────────────────────────────────────────────────────────────
body.push(
  new Paragraph({ spacing: { before: 60, after: 40 }, children: [t('PRIVATE LIMITED  ·  LEGAL FUNCTION', { color: INK, bold: true, size: 18 })] }),
  new Paragraph({ spacing: { after: 20 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: GOLD } }, children: [t('')] }),
  new Paragraph({ spacing: { before: 240, after: 60 }, children: [new TextRun({ text: 'Request for Quotation', font: 'Calibri', bold: true, color: INK, size: 52 })] }),
  new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: 'Hosting, Deployment & Go-Live', font: 'Calibri', color: INK, size: 30 })] }),
  new Paragraph({ spacing: { after: 240 }, children: [t('Concord — Contract Lifecycle Management platform', { italics: true, color: MUTE, size: 22 })] }),
);
body.push(table([3200, 6726], ['Field', 'Detail'], [
  ['Issued by', [t('Lakmē Lever Private Limited — Legal function')]],
  ['Project', [t('Concord — AI-native Contract Lifecycle Management (CLM)')]],
  ['This document', [t('Vendor scope note & request for quotation for hosting, deployment and go-live')]],
  ['Quotation basis', [t('Quote '), t('BOTH Microsoft Azure and Amazon Web Services (AWS)', { bold: true }), t(' separately, so the two can be compared')]],
  ['Pricing components', [t('One-time deployment / go-live + monthly managed hosting + support (SLA) tiers')]],
  ['AI hosting', [t('Managed AI services only (no GPU / self-hosted inference)', { bold: true })]],
  ['Issued to', [fill('Vendor name')]],
  ['Date issued', [fill('DD Month 2026')]],
  ['Response due by', [fill('DD Month 2026')]],
  ['Point of contact', [fill('Name · email · phone')]],
  ['Classification', [t('Confidential — for the named recipient only')]],
]));
body.push(new Paragraph({ children: [new PageBreak()] }));

// ── 1. Introduction ───────────────────────────────────────────────────
body.push(h1('1.  Introduction & purpose'));
body.push(p('Lakmē Lever Private Limited (“LLPL”) has developed Concord, an AI-native Contract Lifecycle Management platform for its Legal function. The application is built and functionally complete; it is delivered as containerised services with infrastructure-as-code and a CI/CD pipeline. LLPL now seeks to move Concord into production.'));
body.push(p('This document invites your firm to quote for hosting, deploying and operating Concord through to go-live and steady-state running. It describes the application, the target architecture, the scope of work, and the security and residency requirements, and it sets out exactly how we would like your quotation structured so that responses are directly comparable.'));
body.push(p([t('We are asking you to price on both Microsoft Azure and Amazon Web Services. ', { bold: true }), t('Concord is cloud-portable by design and runs on either platform; LLPL will select the cloud partly on the basis of these quotations. Please quote each cloud as a separate, self-contained option.')]));

// ── 2. What we are asking you to quote ─────────────────────────────────
body.push(h1('2.  What we are asking you to quote'));
body.push(p('Please provide a quotation covering the following, for each of the two clouds (Azure and AWS):'));
body.push(table([2400, 7526], ['Component', 'What to price'], [
  [[t('A. Deployment & go-live', { bold: true })], 'One-time, fixed-price project cost to provision the infrastructure, set up the environments, deploy the application, configure identity/AI/security, migrate/seed data, and take the system live (Section 7).'],
  [[t('B. Managed hosting', { bold: true })], 'Monthly recurring cost of running the production platform — compute, database, storage, networking, AI service consumption estimate, monitoring and backups — itemised by service and per environment (Section 8).'],
  [[t('C. Support & SLA', { bold: true })], 'One or more monthly support tiers with defined response/restore SLAs and coverage hours (Section 8).'],
  [[t('D. Optional items', { bold: true })], 'Anything you recommend but consider optional (e.g. enhanced DR, 24×7 cover, additional non-production environments). Price separately so we can include or exclude them.'],
]));
body.push(p([t('AI hosting — important.  ', { bold: true, color: GOLD }), t('Quote managed AI services only. Concord uses managed AI on each cloud (Azure OpenAI + Azure AI Document Intelligence on Azure; Amazon Bedrock + Amazon Textract on AWS). Do not include any GPU or self-hosted inference infrastructure. Treat AI as a consumption line item and state your assumptions.')]));

// ── 3. Solution overview ───────────────────────────────────────────────
body.push(h1('3.  Solution overview — the application you will host'));
body.push(p('Concord is a modular monolith: a small number of stateless container services in front of a managed database and object storage. It is not a large microservice estate. The moving parts are:'));
body.push(bullet([t('Web portal', { bold: true }), t(' — a Next.js (React/TypeScript) server-rendered web application. One container service.')]));
body.push(bullet([t('API', { bold: true }), t(' — a NestJS (Node.js/TypeScript) REST API covering intake, authoring, document ingestion/OCR, AI review, repository search, obligations, e-signature and notifications. One container service.')]));
body.push(bullet([t('Database', { bold: true }), t(' — PostgreSQL with the pgvector extension (transactional data + semantic-search embeddings in one instance).')]));
body.push(bullet([t('Object storage', { bold: true }), t(' — original contract documents and sealed executed copies (Azure Blob / Amazon S3), with versioning and soft-delete.')]));
body.push(bullet([t('Identity', { bold: true }), t(' — Microsoft Entra ID single sign-on (the LLPL Microsoft 365 tenant). Cloud-agnostic; used on both Azure and AWS.')]));
body.push(bullet([t('Email / approvals', { bold: true }), t(' — Microsoft Graph (Outlook) for notifications and in-Outlook approval cards. Cloud-agnostic.')]));
body.push(bullet([t('Managed AI', { bold: true }), t(' — OCR, structured extraction, review and retrieval-grounded Q&A via the cloud’s managed AI (Azure OpenAI + Document Intelligence / Amazon Bedrock + Textract). No GPU.')]));
body.push(bullet([t('E-signature', { bold: true }), t(' — integration with Melento (LLPL’s e-signature and digital e-stamp vendor) over HTTPS + webhook. Cloud-agnostic third-party SaaS.')]));
body.push(p([t('Already provided by LLPL: ', { bold: true }), t('Dockerfiles for both services, infrastructure-as-code (Azure Bicep today; a Terraform equivalent can be produced or the vendor may use their own), GitHub Actions CI/CD workflows, and full deployment documentation. You are hosting and deploying an existing application — not building it.')]));

// ── 4. Target architecture ─────────────────────────────────────────────
body.push(h1('4.  Target architecture & required platform services'));
body.push(p('The table maps each component to the managed service we expect on each cloud. You may propose equivalents (e.g. AKS/EKS instead of the serverless container option) with a short rationale; please keep the security posture in Section 9.'));
body.push(table([2500, 3713, 3713], ['Component', 'Azure', 'AWS'], [
  [[t('Container compute', { bold: true })], 'Azure Container Apps (or AKS)', 'Amazon ECS Fargate (or EKS)'],
  [[t('Database', { bold: true })], 'Azure Database for PostgreSQL Flexible Server + pgvector', 'Amazon RDS or Aurora PostgreSQL + pgvector'],
  [[t('Object storage', { bold: true })], 'Azure Blob Storage (versioning + soft-delete)', 'Amazon S3 (versioning + lifecycle)'],
  [[t('Container registry', { bold: true })], 'Azure Container Registry (ACR)', 'Amazon ECR'],
  [[t('Secrets', { bold: true })], 'Azure Key Vault + Managed Identity', 'AWS Secrets Manager + IAM roles'],
  [[t('Managed AI', { bold: true })], 'Azure OpenAI + Azure AI Document Intelligence', 'Amazon Bedrock + Amazon Textract'],
  [[t('Edge / WAF', { bold: true })], 'Azure Front Door + WAF', 'Amazon CloudFront + AWS WAF'],
  [[t('Private networking', { bold: true })], 'VNet + Private Endpoints', 'VPC + PrivateLink / VPC endpoints'],
  [[t('Malware scanning', { bold: true })], 'Defender for Storage or a scanning endpoint', 'GuardDuty Malware Protection or a scanning endpoint'],
  [[t('Monitoring', { bold: true })], 'Azure Monitor + Application Insights', 'Amazon CloudWatch (+ X-Ray)'],
  [[t('Backup', { bold: true })], 'Automated PostgreSQL backups + Blob retention', 'Automated RDS backups + S3 lifecycle/Backup'],
]));
body.push(p([t('AI regional availability & residency.  ', { bold: true, color: GOLD }), t('Please confirm the exact region in which each managed AI service will run and that inputs/outputs remain within India (see Section 9). If a specific managed AI service is not available in the India region on a cloud, state this and propose the nearest compliant option.')]));

// ── 5. Environments ────────────────────────────────────────────────────
body.push(h1('5.  Environments'));
body.push(p('Please provision and price three environments (state any you would consolidate):'));
body.push(table([2000, 5426, 2500], ['Environment', 'Purpose', 'Scale'], [
  ['Development', 'Integration and internal testing', 'Minimal / scaled-down'],
  ['Staging / UAT', 'Pre-production, user acceptance, dress-rehearsal cutover', 'Production-like, smaller'],
  ['Production', 'Live confidential contracts; India region', 'Full (Section 6)'],
]));

// ── 6. Sizing ──────────────────────────────────────────────────────────
body.push(h1('6.  Indicative sizing & scale'));
body.push(p('Concord is an internal Legal tool — modest, mostly business-hours load, not a high-throughput public service. Use the following as a starting point and size production for reasonable headroom and autoscaling; state your assumptions.'));
body.push(table([3400, 6526], ['Dimension', 'Indicative figure'], [
  ['Named users', [t('Up to ~50 named users; typically 5–15 active concurrently')]],
  ['Usage profile', [t('Business hours (India), low concurrency, interactive (not real-time/bulk)')]],
  ['Existing contracts', [t('~10,000 agreements at go-live')]],
  ['Document storage', [t('~128 GB of original documents at go-live; growing ~25% per year')]],
  ['Database', [t('PostgreSQL with pgvector; ~64 GB provisioned (transactional + embeddings)')]],
  ['Compute (per service)', [t('~1–2 vCPU / 2–4 GiB baseline per container service, autoscaling on load')]],
  ['Document ingestion', [t('Periodic batches (OCR + AI extraction); not continuous high volume')]],
  ['Availability target', [t('Business-critical for Legal; propose 99.5% or 99.9% and price each if it changes cost')]],
]));

// ── 7. Scope of work — deployment & go-live ────────────────────────────
body.push(h1('7.  Scope of work — deployment & go-live (one-time)'));
body.push(p('The one-time deployment engagement is expected to include, at minimum:'));
body.push(num('Provision all infrastructure via infrastructure-as-code (you may use LLPL’s Bicep, a Terraform equivalent, or your own IaC — state which), across the three environments.'));
body.push(num('Set up the CI/CD pipeline to build the container images and deploy to each environment (LLPL provides GitHub Actions workflows; adapt or replace as needed).'));
body.push(num('Configure identity: Microsoft Entra ID SSO (app registration, roles/groups mapping) and Microsoft Graph permissions for Outlook notifications/approvals.'));
body.push(num('Configure the managed AI services (Azure OpenAI + Document Intelligence / Bedrock + Textract), including endpoints, models/deployments and access — no GPU.'));
body.push(num('Configure security controls: private networking, WAF, TLS/certificates, secrets in Key Vault / Secrets Manager via managed identity, storage encryption and a malware-scanning endpoint the application calls.'));
body.push(num('Configure the database (PostgreSQL + pgvector), run schema migrations, and seed/migrate initial data.'));
body.push(num('Configure backups, monitoring, logging and alerting to the requirements in Sections 9–10.'));
body.push(num('Support user acceptance testing and a go-live cutover, followed by a short hypercare / warranty period (state its length).'));
body.push(num('Hand over environment documentation, runbooks and access.'));
body.push(p([t('Please state your assumptions, your proposed timeline (weeks) and any dependencies you need from LLPL.', { italics: true, color: MUTE })]));

// ── 8. Managed hosting & support ───────────────────────────────────────
body.push(h1('8.  Managed hosting & support (recurring)'));
body.push(h2('8.1  Managed hosting'));
body.push(p('Monthly operation of the production platform (and non-production as applicable), including: infrastructure run cost, platform patching and updates, capacity/scaling management, monitoring and alerting, backup operation and periodic restore testing, and security-control upkeep. Itemise the monthly cost by service so LLPL can see where cost sits, and show it per environment.'));
body.push(h2('8.2  Support & SLA'));
body.push(p('Propose one or more support tiers. For each tier, state coverage hours, incident-severity definitions, response and restore/resolution SLAs, the escalation path, and what is included versus billed separately. Indicate your recommended tier for a business-critical internal Legal system.'));
body.push(table([2400, 4600, 2926], ['Tier (example)', 'Coverage & SLA (you define)', 'Monthly price'], [
  ['Standard', [t('Business hours; P1 response « you specify »', { color: MUTE })], [fill('₹ / mo')]],
  ['Enhanced', [t('Extended hours; faster SLA « you specify »', { color: MUTE })], [fill('₹ / mo')]],
  ['24×7 (optional)', [t('Round-the-clock; strict SLA « you specify »', { color: MUTE })], [fill('₹ / mo')]],
]));

// ── 9. Security & residency ────────────────────────────────────────────
body.push(h1('9.  Security, data residency & compliance requirements'));
body.push(p('Concord will hold confidential contracts and personal data and is subject to LLPL/Unilever assurance. The application already enforces application-layer controls (role-based access, an immutable audit trail, document-security checks, AI guardrails). Your platform must provide and operate the infrastructure controls below.'));
body.push(bullet([t('Data residency — India.  ', { bold: true }), t('All data at rest and in processing — database, documents, backups, logs, and managed-AI inputs/outputs — must remain within India (Azure Central India / AWS Asia Pacific (Mumbai)). Confirm the region for every service, AI included, and that no personal data egresses India.')]));
body.push(bullet([t('Identity.  ', { bold: true }), t('Entra ID SSO only for production; support MFA / Conditional Access; no local/demo accounts in production.')]));
body.push(bullet([t('Encryption.  ', { bold: true }), t('TLS in transit; encryption at rest with managed keys; secrets in Key Vault / Secrets Manager via managed identity — no long-lived secrets in config.')]));
body.push(bullet([t('Network.  ', { bold: true }), t('Private networking between tiers, WAF at the edge, restricted ingress/egress; database and storage not publicly reachable.')]));
body.push(bullet([t('Document security.  ', { bold: true }), t('Provide a malware-scanning capability the application integrates with for uploaded files; storage versioning and soft-delete enabled.')]));
body.push(bullet([t('Audit & logs.  ', { bold: true }), t('Support immutable, retained audit/log storage (the application writes an append-only audit trail); protect log access; synchronise clocks.')]));
body.push(bullet([t('Monitoring & alerting.  ', { bold: true }), t('Central logs, metrics and alerts on errors, failed jobs, storage and availability, with defined operational ownership.')]));
body.push(bullet([t('Assurance support.  ', { bold: true }), t('Support an independent penetration test and provide the evidence (architecture diagram, configuration, backup/restore and DR test results) required for LLPL/Unilever TPRM, PRA and security sign-off.')]));

// ── 10. Backup / DR ────────────────────────────────────────────────────
body.push(h1('10.  Backup, disaster recovery & continuity'));
body.push(table([3400, 6526], ['Requirement', 'Target (confirm or propose)'], [
  ['Backup — database', [t('Automated daily backups; point-in-time recovery; ~35-day retention')]],
  ['Backup — documents', [t('Versioned object storage with retention aligned to the records schedule')]],
  ['RTO (recovery time)', [t('Target ~4 hours for production (propose and price if different)')]],
  ['RPO (recovery point)', [t('Target ~24 hours (propose and price if different)')]],
  ['DR approach', [t('Secondary India region or the alternate cloud; describe your approach')]],
  ['Restore testing', [t('Periodic restore/DR drills with evidence retained')]],
]));

// ── 11. LLPL provides / out of scope ───────────────────────────────────
body.push(h1('11.  What LLPL provides, and what is out of scope'));
body.push(h2('LLPL provides'));
body.push(bullet('The application: source, Dockerfiles, infrastructure-as-code (Bicep), CI/CD workflows and deployment documentation.'));
body.push(bullet('The Microsoft 365 / Entra ID tenant and the Melento e-signature account.'));
body.push(bullet('A technical point of contact and timely access/approvals during the engagement.'));
body.push(h2('Out of scope for this quotation'));
body.push(bullet('Application development or enhancements (the app is built). Note separately if you offer this.'));
body.push(bullet('Any GPU or self-hosted AI inference (managed AI only).'));
body.push(bullet('Microsoft 365 / Entra licensing and the Melento subscription (LLPL holds these).'));

// ── 12. How to structure your quotation ────────────────────────────────
body.push(h1('12.  How to structure your quotation'));
body.push(p('Please respond using the structure below, completing it once for Azure and once for AWS, so the two clouds are directly comparable. All prices in INR (₹), exclusive of taxes; state the validity period.'));
body.push(h2('Cost summary (complete per cloud)'));
body.push(table([4200, 2863, 2863], ['Line item', 'Azure', 'AWS'], [
  [[t('A. One-time deployment & go-live', { bold: true })], [fill('₹')], [fill('₹')]],
  ['B. Monthly managed hosting — Production', [fill('₹ / mo')], [fill('₹ / mo')]],
  ['B. Monthly managed hosting — Non-production (dev + staging)', [fill('₹ / mo')], [fill('₹ / mo')]],
  ['   of which: managed AI consumption (estimate + assumptions)', [fill('₹ / mo')], [fill('₹ / mo')]],
  ['C. Support & SLA — recommended tier', [fill('₹ / mo')], [fill('₹ / mo')]],
  ['D. Optional items (list separately)', [fill('₹')], [fill('₹')]],
  [[t('Indicative first-year total (A + 12×(B+C))', { bold: true })], [fill('₹')], [fill('₹')]],
]));
body.push(p([t('Please also provide: ', { bold: true }), t('a per-service breakdown behind the monthly figures; your assumptions (usage, AI volume, data transfer, currency/FX, reserved vs on-demand); what is excluded; and how cost scales as users and contract volume grow.')]));

// ── 13. Information requested ───────────────────────────────────────────
body.push(h1('13.  Information requested from your firm'));
body.push(bullet('Relevant experience: comparable deployments, and your Microsoft Azure and/or AWS partner status and certifications.'));
body.push(bullet('Proposed team and their roles for the engagement.'));
body.push(bullet('Proposed deployment timeline (weeks to go-live) and key milestones.'));
body.push(bullet('Your approach to the security, residency, backup and DR requirements (Sections 9–10).'));
body.push(bullet('Two client references for similar work.'));
body.push(bullet('Assumptions, dependencies and any exclusions underlying your quotation.'));

// ── 14. Timeline & submission ──────────────────────────────────────────
body.push(h1('14.  Timeline, submission & evaluation'));
body.push(table([3400, 6526], ['Item', 'Detail'], [
  ['Questions / clarifications by', [fill('DD Month 2026')]],
  ['Quotation due by', [fill('DD Month 2026')]],
  ['Target go-live', [fill('Month 2026')]],
  ['Submit to', [fill('Name · email')]],
  ['Evaluation basis', [t('Total cost of ownership (deployment + run + support), security & residency fit, delivery timeline, relevant experience and references')]],
]));

// ── 15. Commercial & confidentiality ───────────────────────────────────
body.push(h1('15.  Commercial terms & confidentiality'));
body.push(bullet('This document and any information shared are confidential to LLPL and provided solely to prepare a quotation; do not disclose or reuse them.'));
body.push(bullet('This request does not oblige LLPL to award any work, and LLPL may amend or withdraw it.'));
body.push(bullet('Quotations should remain valid for at least 60 days from submission (state your validity period).'));
body.push(bullet('All costs must be itemised and in INR, exclusive of applicable taxes (state taxes separately).'));

// ── Appendix A ─────────────────────────────────────────────────────────
body.push(h1('Appendix A — technical facts for sizing'));
body.push(p('For your reference when sizing and pricing:'));
body.push(bullet('Two stateless container services (Next.js web, NestJS API), Linux, Node.js runtime; horizontally scalable behind the edge/WAF.'));
body.push(bullet('One PostgreSQL instance with the pgvector extension (transactional data and semantic-search vectors together).'));
body.push(bullet('Object storage for original documents and sealed executed copies; versioning and soft-delete required.'));
body.push(bullet('Managed AI is called on demand for OCR, extraction, review and Q&A; a fully-local fallback exists but is out of scope here (managed AI only).'));
body.push(bullet('Two scheduled jobs run in-app (a daily obligations digest and a signature reminder), and are replica-safe; alternatively they can be driven by a managed scheduler hitting two endpoints.'));
body.push(bullet('External integrations over HTTPS: Microsoft Graph (Outlook) and Melento (e-signature/e-stamp) — both internet-reachable SaaS, no inbound needed beyond the Melento webhook.'));
body.push(sp(1));
body.push(p([t('A detailed deployment, sizing and security guide (deployment.md) and the infrastructure-as-code will be shared with shortlisted vendors under this engagement.', { italics: true, color: MUTE })]));

// ── document ───────────────────────────────────────────────────────────
const doc = new Document({
  creator: 'Lakmē Lever — Legal', title: 'Concord CLM — RFQ: Hosting, Deployment & Go-Live',
  numbering: { config: [
    { reference: 'b', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { run: { color: GOLD }, paragraph: { indent: { left: 360, hanging: 220 } } } }] },
    { reference: 'n', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { run: { color: GOLD, bold: true }, paragraph: { indent: { left: 400, hanging: 260 } } } }] },
  ] },
  styles: { default: { document: { run: { font: 'Calibri', size: 20, color: INK } } } },
  sections: [{
    properties: { page: { size: A4, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 40 }, children: [new ImageRun({ data: LOGO, type: 'png', transformation: { width: 122, height: 87 } })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [t('Confidential — Lakmē Lever Private Limited   ·   Page ', { size: 15, color: MUTE }), new TextRun({ children: [PageNumber.CURRENT], font: 'Calibri', size: 15, color: MUTE })] })] }) },
    children: body,
  }],
});
Packer.toBuffer(doc).then((buf) => { fs.writeFileSync('/home/claude/concord-clm/Concord-Hosting-Deployment-RFQ.docx', buf); console.log('WROTE Concord-Hosting-Deployment-RFQ.docx', buf.length, 'bytes'); });
