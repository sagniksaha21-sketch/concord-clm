# -*- coding: utf-8 -*-
"""Build a fillable PDF form of the Concord hosting/deployment RFQ.
Body text is fixed PDF content (not editable in readers); every blank is an
interactive AcroForm text field the vendor can type into."""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
    Flowable, KeepTogether, CondPageBreak,
)

DJ_DIR = '/usr/share/fonts/truetype/dejavu'
pdfmetrics.registerFont(TTFont('DJ', f'{DJ_DIR}/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DJB', f'{DJ_DIR}/DejaVuSans-Bold.ttf'))
_obl = f'{DJ_DIR}/DejaVuSans-Oblique.ttf'
if os.path.exists(_obl):
    pdfmetrics.registerFont(TTFont('DJO', _obl))
    pdfmetrics.registerFontFamily('DJ', normal='DJ', bold='DJB', italic='DJO', boldItalic='DJB')
    ITAL = 'DJO'
else:
    pdfmetrics.registerFontFamily('DJ', normal='DJ', bold='DJB', italic='DJ', boldItalic='DJB')
    ITAL = 'DJ'

LOGO = '/home/claude/concord-clm/lakme-lever-logo-bw.png'
OUT = '/home/claude/concord-clm/Concord-Hosting-Deployment-RFQ-Form.pdf'

INK = colors.HexColor('#111111')
MUTE = colors.HexColor('#666666')
GREY_LINE = colors.HexColor('#C8C8C8')
ALT = colors.HexColor('#F5F5F5')
BLACK = colors.black
FIELD_FILL = colors.HexColor('#F4F4F4')
FIELD_BORDER = colors.HexColor('#8C8C8C')

CW = 511  # content width in pt

# ── styles ────────────────────────────────────────────────────────────────
def S(name, **kw):
    base = dict(fontName='DJ', fontSize=9.5, leading=13, textColor=INK, spaceAfter=6)
    base.update(kw)
    return ParagraphStyle(name, **base)

TITLE = S('title', fontName='DJB', fontSize=25, leading=28, spaceAfter=3)
SUB = S('sub', fontSize=15, leading=18, spaceAfter=3)
TAG = S('tag', fontName=ITAL, fontSize=10.5, textColor=MUTE, spaceAfter=2)
NOTE = S('note', fontName=ITAL, fontSize=9, textColor=MUTE, spaceAfter=8)
H1 = S('h1', fontName='DJB', fontSize=14.5, leading=17, spaceBefore=15, spaceAfter=7, textColor=INK, keepWithNext=1)
H2 = S('h2', fontName='DJB', fontSize=11.5, leading=14, spaceBefore=10, spaceAfter=4, textColor=INK, keepWithNext=1)
BODY = S('body', spaceAfter=7)
LBL = S('lbl', fontName='DJB')
BULLET = S('bullet', leftIndent=15, bulletIndent=2, spaceAfter=4, leading=13)
SMALL = S('small', fontSize=8, textColor=MUTE, leading=10.5)
CELL = S('cell', fontSize=8.7, leading=11, spaceAfter=0)
CELLB = S('cellb', fontName='DJB', fontSize=8.7, leading=11, spaceAfter=0)
CELLH = S('cellh', fontName='DJB', fontSize=8.7, leading=11, textColor=colors.white, spaceAfter=0)


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def P(text, style=BODY):
    return Paragraph(text, style)


def bullet(text):
    return Paragraph(text, BULLET, bulletText='•')


# ── interactive form field ─────────────────────────────────────────────────
class Field(Flowable):
    _n = 0

    def __init__(self, name, width, height, fontSize=9, multiline=False, tip=''):
        Flowable.__init__(self)
        self.name = name
        self._w = width
        self._h = height
        self.fontSize = fontSize
        self.multiline = multiline
        self.tip = tip or name.replace('_', ' ')

    def wrap(self, aw, ah):
        return (self._w, self._h)

    def draw(self):
        self.canv.acroForm.textfield(
            name=self.name, tooltip=self.tip, x=0, y=0, width=self._w, height=self._h,
            borderStyle='inset', borderWidth=0.5, borderColor=FIELD_BORDER,
            fillColor=FIELD_FILL, textColor=BLACK, fontName='Helvetica', fontSize=self.fontSize,
            fieldFlags='multiline' if self.multiline else '', relative=True, forceBorder=True,
        )


def fcell(name, colw, h=15, fontSize=9, multiline=False):
    """A form field sized to sit inside a table cell of width colw."""
    return Field(name, colw - 8, h, fontSize=fontSize, multiline=multiline)


# ── table helper ────────────────────────────────────────────────────────────
def mk_table(data, colw, header=True, rowHeights=None, aligns=None):
    ts = [
        ('FONT', (0, 0), (-1, -1), 'DJ', 8.7),
        ('TEXTCOLOR', (0, 0), (-1, -1), INK),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, GREY_LINE),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('TOPPADDING', (0, 0), (-1, -1), 3.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5),
    ]
    if header:
        ts += [
            ('BACKGROUND', (0, 0), (-1, 0), BLACK),
            ('TOPPADDING', (0, 0), (-1, 0), 5),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 5),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, ALT]),
        ]
    else:
        ts += [('ROWBACKGROUNDS', (0, 0), (-1, -1), [colors.white, ALT])]
    return Table(data, colWidths=colw, rowHeights=rowHeights, style=TableStyle(ts), hAlign='LEFT')


# ── page furniture: letterhead + footer ─────────────────────────────────────
def on_page(canvas, doc):
    pw, ph = A4
    lw = 32 * mm
    lh = lw * 110.0 / 155.0
    canvas.drawImage(LOGO, pw - 42 - lw, ph - 16 - lh, width=lw, height=lh,
                     mask='auto', preserveAspectRatio=True)
    canvas.setFont('DJ', 7.5)
    canvas.setFillGray(0.4)
    canvas.drawCentredString(pw / 2.0, 13 * mm,
                             f'Confidential — Lakmē Lever Private Limited   ·   Page {doc.page}')


story = []
A = story.append


def spacer(h):
    A(Spacer(1, h))


# ══ COVER ══════════════════════════════════════════════════════════════════
A(Paragraph('PRIVATE LIMITED  ·  LEGAL FUNCTION', S('kick', fontName='DJB', fontSize=10, textColor=INK, spaceAfter=4)))
A(Table([['']], colWidths=[CW], rowHeights=[2],
        style=TableStyle([('LINEBELOW', (0, 0), (-1, -1), 1.1, BLACK)])))
spacer(12)
A(P('Request for Quotation', TITLE))
A(P('Hosting, Deployment &amp; Go-Live', SUB))
A(P('Concord — Contract Lifecycle Management platform', TAG))
spacer(4)
A(P('This is a fillable form. Type your responses into the shaded fields; the rest of the document is fixed and cannot be edited.', NOTE))
spacer(4)

cover = [
    [P('Field', CELLH), P('Detail', CELLH)],
    [P('Issued by', CELLB), P('Lakmē Lever Private Limited — Legal function', CELL)],
    [P('Project', CELLB), P('Concord — AI-native Contract Lifecycle Management (CLM)', CELL)],
    [P('This document', CELLB), P('Vendor scope note &amp; request for quotation for hosting, deployment and go-live', CELL)],
    [P('Quotation basis', CELLB), P('Quote <b>BOTH Microsoft Azure and Amazon Web Services (AWS)</b> separately, so the two can be compared', CELL)],
    [P('Pricing components', CELLB), P('One-time deployment / go-live + monthly managed hosting + support (SLA) tiers', CELL)],
    [P('AI hosting', CELLB), P('<b>Managed AI services only (no GPU / self-hosted inference)</b>', CELL)],
    [P('Issued to (vendor)', CELLB), fcell('vendor_name', 371)],
    [P('Date issued', CELLB), fcell('date_issued', 371)],
    [P('Response due by', CELLB), fcell('date_due', 371)],
    [P('Point of contact', CELLB), fcell('llpl_contact', 371)],
    [P('Classification', CELLB), P('Confidential — for the named recipient only', CELL)],
]
rh = [None, None, None, None, None, None, None, 20, 20, 20, 20, None]
A(mk_table(cover, [140, 371], rowHeights=rh))

# ══ 1. Introduction ═════════════════════════════════════════════════════════
A(P('1.  Introduction &amp; purpose', H1))
A(P('Lakmē Lever Private Limited (“LLPL”) has developed Concord, an AI-native Contract Lifecycle Management platform for its Legal function. The application is built and functionally complete; it is delivered as containerised services with infrastructure-as-code and a CI/CD pipeline. LLPL now seeks to move Concord into production.'))
A(P('This document invites your firm to quote for hosting, deploying and operating Concord through to go-live and steady-state running. It describes the application, the target architecture, the scope of work, and the security and residency requirements, and sets out how to structure your quotation so that responses are directly comparable.'))
A(P('<b>We are asking you to price on both Microsoft Azure and Amazon Web Services.</b> Concord is cloud-portable by design and runs on either platform; LLPL will select the cloud partly on the basis of these quotations. Please quote each cloud as a separate, self-contained option.'))

# ══ 2. What we are asking ════════════════════════════════════════════════════
A(P('2.  What we are asking you to quote', H1))
A(P('Please provide a quotation covering the following, for each of the two clouds (Azure and AWS):'))
ask = [
    [P('Component', CELLH), P('What to price', CELLH)],
    [P('<b>A. Deployment &amp; go-live</b>', CELL), P('One-time, fixed-price project cost to provision the infrastructure, set up the environments, deploy the application, configure identity / AI / security, migrate/seed data, and take the system live (Section 7).', CELL)],
    [P('<b>B. Managed hosting</b>', CELL), P('Monthly recurring cost of running the production platform — compute, database, storage, networking, AI consumption estimate, monitoring and backups — itemised by service and per environment (Section 8).', CELL)],
    [P('<b>C. Support &amp; SLA</b>', CELL), P('One or more monthly support tiers with defined response / restore SLAs and coverage hours (Section 8).', CELL)],
    [P('<b>D. Optional items</b>', CELL), P('Anything you recommend but consider optional (e.g. enhanced DR, 24×7 cover, extra non-production environments). Price separately.', CELL)],
]
A(mk_table(ask, [120, 391]))
spacer(4)
A(P('<b>AI hosting — important.</b>  Quote managed AI services only (Azure OpenAI + Azure AI Document Intelligence on Azure; Amazon Bedrock + Amazon Textract on AWS). Do not include any GPU or self-hosted inference. Treat AI as a consumption line item and state your assumptions.'))

# ══ 3. Solution overview ═════════════════════════════════════════════════════
A(P('3.  Solution overview — the application you will host', H1))
A(P('Concord is a modular monolith: a small number of stateless container services in front of a managed database and object storage — not a large microservice estate. The moving parts are:'))
for b in [
    '<b>Web portal</b> — a Next.js (React/TypeScript) server-rendered web application. One container service.',
    '<b>API</b> — a NestJS (Node.js/TypeScript) REST API covering intake, authoring, ingestion/OCR, AI review, repository search, obligations, e-signature and notifications. One container service.',
    '<b>Database</b> — PostgreSQL with the pgvector extension (transactional data + semantic-search embeddings in one instance).',
    '<b>Object storage</b> — original contract documents and sealed executed copies (Azure Blob / Amazon S3), with versioning and soft-delete.',
    '<b>Identity</b> — Microsoft Entra ID single sign-on (LLPL Microsoft 365 tenant). Cloud-agnostic; used on both clouds.',
    '<b>Email / approvals</b> — Microsoft Graph (Outlook) for notifications and in-Outlook approval cards. Cloud-agnostic.',
    '<b>Managed AI</b> — OCR, structured extraction, review and retrieval-grounded Q&amp;A via the cloud’s managed AI. No GPU.',
    '<b>E-signature</b> — integration with Melento (LLPL’s e-signature / e-stamp vendor) over HTTPS + webhook. Third-party SaaS.',
]:
    A(bullet(b))
A(P('<b>Already provided by LLPL:</b> Dockerfiles for both services, infrastructure-as-code (Azure Bicep today; a Terraform equivalent can be produced or you may use your own), GitHub Actions CI/CD workflows, and full deployment documentation. You are hosting and deploying an existing application — not building it.'))

# ══ 4. Target architecture ═══════════════════════════════════════════════════
A(P('4.  Target architecture &amp; required platform services', H1))
A(P('The table maps each component to the managed service we expect on each cloud. You may propose equivalents (e.g. AKS / EKS instead of the serverless container option) with a short rationale; please keep the security posture in Section 9.'))
arch = [[P('Component', CELLH), P('Azure', CELLH), P('AWS', CELLH)]]
for comp, az, aws in [
    ('Container compute', 'Azure Container Apps (or AKS)', 'Amazon ECS Fargate (or EKS)'),
    ('Database', 'Azure Database for PostgreSQL Flexible Server + pgvector', 'Amazon RDS or Aurora PostgreSQL + pgvector'),
    ('Object storage', 'Azure Blob Storage (versioning + soft-delete)', 'Amazon S3 (versioning + lifecycle)'),
    ('Container registry', 'Azure Container Registry (ACR)', 'Amazon ECR'),
    ('Secrets', 'Azure Key Vault + Managed Identity', 'AWS Secrets Manager + IAM roles'),
    ('Managed AI', 'Azure OpenAI + Azure AI Document Intelligence', 'Amazon Bedrock + Amazon Textract'),
    ('Edge / WAF', 'Azure Front Door + WAF', 'Amazon CloudFront + AWS WAF'),
    ('Private networking', 'VNet + Private Endpoints', 'VPC + PrivateLink / VPC endpoints'),
    ('Malware scanning', 'Defender for Storage or a scanning endpoint', 'GuardDuty Malware Protection or a scanning endpoint'),
    ('Monitoring', 'Azure Monitor + Application Insights', 'Amazon CloudWatch (+ X-Ray)'),
    ('Backup', 'Automated PostgreSQL backups + Blob retention', 'Automated RDS backups + S3 lifecycle / Backup'),
]:
    arch.append([P(f'<b>{comp}</b>', CELL), P(az, CELL), P(aws, CELL)])
A(mk_table(arch, [120, 195, 196]))
spacer(4)
A(P('<b>AI regional availability &amp; residency.</b>  Please confirm the exact region in which each managed AI service will run and that inputs/outputs remain within India (Section 9). If a managed AI service is not available in the India region on a cloud, state this and propose the nearest compliant option.'))

# ══ 5. Environments ══════════════════════════════════════════════════════════
A(P('5.  Environments', H1))
A(P('Please provision and price three environments (state any you would consolidate):'))
envs = [[P('Environment', CELLH), P('Purpose', CELLH), P('Scale', CELLH)]]
for e, pu, sc in [
    ('Development', 'Integration and internal testing', 'Minimal / scaled-down'),
    ('Staging / UAT', 'Pre-production, user acceptance, dress-rehearsal cutover', 'Production-like, smaller'),
    ('Production', 'Live confidential contracts; India region', 'Full (Section 6)'),
]:
    envs.append([P(e, CELL), P(pu, CELL), P(sc, CELL)])
A(mk_table(envs, [95, 300, 116]))

# ══ 6. Sizing ════════════════════════════════════════════════════════════════
A(P('6.  Indicative sizing &amp; scale', H1))
A(P('Concord is an internal Legal tool — modest, mostly business-hours load, not a high-throughput public service. Use the following as a starting point and size production for reasonable headroom and autoscaling; state your assumptions.'))
siz = [[P('Dimension', CELLH), P('Indicative figure', CELLH)]]
for d, v in [
    ('Named users', 'Up to ~50 named users; typically 5–15 active concurrently'),
    ('Usage profile', 'Business hours (India), low concurrency, interactive (not real-time / bulk)'),
    ('Existing contracts', '~10,000 agreements at go-live'),
    ('Document storage', '~128 GB of original documents at go-live; growing ~25% per year'),
    ('Database', 'PostgreSQL with pgvector; ~64 GB provisioned (transactional + embeddings)'),
    ('Compute (per service)', '~1–2 vCPU / 2–4 GiB baseline per container service, autoscaling on load'),
    ('Document ingestion', 'Periodic batches (OCR + AI extraction); not continuous high volume'),
    ('Availability target', 'Business-critical for Legal; propose 99.5% or 99.9% and price each if it changes cost'),
]:
    siz.append([P(d, CELL), P(v, CELL)])
A(mk_table(siz, [165, 346]))

# ══ 7. Scope of work ═════════════════════════════════════════════════════════
A(P('7.  Scope of work — deployment &amp; go-live (one-time)', H1))
A(P('The one-time deployment engagement is expected to include, at minimum:'))
steps = [
    'Provision all infrastructure via infrastructure-as-code (LLPL’s Bicep, a Terraform equivalent, or your own — state which), across the three environments.',
    'Set up the CI/CD pipeline to build the container images and deploy to each environment (LLPL provides GitHub Actions workflows; adapt or replace as needed).',
    'Configure identity: Microsoft Entra ID SSO (app registration, roles / groups mapping) and Microsoft Graph permissions for Outlook notifications / approvals.',
    'Configure the managed AI services (Azure OpenAI + Document Intelligence / Bedrock + Textract) — endpoints, models / deployments, access. No GPU.',
    'Configure security controls: private networking, WAF, TLS / certificates, secrets in Key Vault / Secrets Manager via managed identity, storage encryption and a malware-scanning endpoint the application calls.',
    'Configure the database (PostgreSQL + pgvector), run schema migrations, and seed / migrate initial data.',
    'Configure backups, monitoring, logging and alerting to the requirements in Sections 9–10.',
    'Support user acceptance testing and a go-live cutover, then a short hypercare / warranty period (state its length).',
    'Hand over environment documentation, runbooks and access.',
]
for i, s in enumerate(steps, 1):
    A(Paragraph(s, BULLET, bulletText=f'{i}.'))
A(P('<i>Please state your assumptions, your proposed timeline (weeks) and any dependencies you need from LLPL.</i>', SMALL))

# ══ 8. Managed hosting & support ═════════════════════════════════════════════
A(P('8.  Managed hosting &amp; support (recurring)', H1))
A(P('8.1  Managed hosting', H2))
A(P('Monthly operation of the production platform (and non-production as applicable): infrastructure run cost, platform patching and updates, capacity / scaling management, monitoring and alerting, backup operation and periodic restore testing, and security-control upkeep. Itemise the monthly cost by service and show it per environment (see the cost template in Section 12).'))
A(P('8.2  Support &amp; SLA — define your tiers', H2))
A(P('Propose one or more support tiers. For each, state coverage hours, incident-severity definitions, response and restore / resolution SLAs, the escalation path, and what is included versus billed separately. Fill in the fields below.'))
sup = [
    [P('Tier', CELLH), P('Coverage &amp; SLA (you define)', CELLH), P('Monthly price', CELLH)],
    [P('Standard', CELLB), fcell('sla_standard', 256, h=34, multiline=True), fcell('price_standard', 160)],
    [P('Enhanced', CELLB), fcell('sla_enhanced', 256, h=34, multiline=True), fcell('price_enhanced', 160)],
    [P('24×7 (optional)', CELLB), fcell('sla_247', 256, h=34, multiline=True), fcell('price_247', 160)],
]
A(mk_table(sup, [95, 256, 160], rowHeights=[None, 40, 40, 40]))
A(P('<i>Indicate which tier you recommend for a business-critical internal Legal system.</i>', SMALL))

# ══ 9. Security & residency ══════════════════════════════════════════════════
A(P('9.  Security, data residency &amp; compliance requirements', H1))
A(P('Concord holds confidential contracts and personal data and is subject to LLPL / Unilever assurance. The application already enforces application-layer controls (role-based access, an immutable audit trail, document-security checks, AI guardrails). Your platform must provide and operate the infrastructure controls below.'))
for b in [
    '<b>Data residency — India.</b> All data at rest and in processing — database, documents, backups, logs and managed-AI inputs / outputs — must remain within India (Azure Central India / AWS Asia Pacific (Mumbai)). Confirm the region for every service, AI included, and that no personal data egresses India.',
    '<b>Identity.</b> Entra ID SSO only for production; support MFA / Conditional Access; no local / demo accounts in production.',
    '<b>Encryption.</b> TLS in transit; encryption at rest with managed keys; secrets in Key Vault / Secrets Manager via managed identity — no long-lived secrets in config.',
    '<b>Network.</b> Private networking between tiers, WAF at the edge, restricted ingress / egress; database and storage not publicly reachable.',
    '<b>Document security.</b> Provide a malware-scanning capability the application integrates with for uploaded files; storage versioning and soft-delete enabled.',
    '<b>Audit &amp; logs.</b> Support immutable, retained audit / log storage (the application writes an append-only audit trail); protect log access; synchronise clocks.',
    '<b>Monitoring &amp; alerting.</b> Central logs, metrics and alerts on errors, failed jobs, storage and availability, with defined operational ownership.',
    '<b>Assurance support.</b> Support an independent penetration test and provide the evidence required for LLPL / Unilever TPRM, PRA and security sign-off.',
]:
    A(bullet(b))

# ══ 10. Backup / DR ══════════════════════════════════════════════════════════
A(P('10.  Backup, disaster recovery &amp; continuity', H1))
dr = [[P('Requirement', CELLH), P('Target (confirm or propose)', CELLH)]]
for r, tv in [
    ('Backup — database', 'Automated daily backups; point-in-time recovery; ~35-day retention'),
    ('Backup — documents', 'Versioned object storage with retention aligned to the records schedule'),
    ('RTO (recovery time)', 'Target ~4 hours for production (propose and price if different)'),
    ('RPO (recovery point)', 'Target ~24 hours (propose and price if different)'),
    ('DR approach', 'Secondary India region or the alternate cloud; describe your approach'),
    ('Restore testing', 'Periodic restore / DR drills with evidence retained'),
]:
    dr.append([P(r, CELL), P(tv, CELL)])
A(mk_table(dr, [165, 346]))

# ══ 11. Provides / out of scope ══════════════════════════════════════════════
A(P('11.  What LLPL provides, and what is out of scope', H1))
A(P('LLPL provides', H2))
for b in [
    'The application: source, Dockerfiles, infrastructure-as-code (Bicep), CI/CD workflows and deployment documentation.',
    'The Microsoft 365 / Entra ID tenant and the Melento e-signature account.',
    'A technical point of contact and timely access / approvals during the engagement.',
]:
    A(bullet(b))
A(P('Out of scope for this quotation', H2))
for b in [
    'Application development or enhancements (the app is built). Note separately if you offer this.',
    'Any GPU or self-hosted AI inference (managed AI only).',
    'Microsoft 365 / Entra licensing and the Melento subscription (LLPL holds these).',
]:
    A(bullet(b))

# ══ 12. Cost template ════════════════════════════════════════════════════════
A(P('12.  Your quotation — cost summary', H1))
A(P('Complete the cost table below. All prices in INR (₹), exclusive of taxes. The Azure and AWS columns let LLPL compare the two clouds directly.'))
cost_rows = [
    ('A. One-time deployment &amp; go-live', 'az_a', 'aws_a'),
    ('B. Monthly managed hosting — Production', 'az_bprod', 'aws_bprod'),
    ('B. Monthly managed hosting — Non-production (dev + staging)', 'az_bnon', 'aws_bnon'),
    ('    of which: managed AI consumption (estimate + assumptions)', 'az_ai', 'aws_ai'),
    ('C. Support &amp; SLA — recommended tier', 'az_c', 'aws_c'),
    ('D. Optional items (list separately)', 'az_d', 'aws_d'),
    ('Indicative first-year total (A + 12×(B+C))', 'az_total', 'aws_total'),
]
cost = [[P('Line item', CELLH), P('Azure (₹)', CELLH), P('AWS (₹)', CELLH)]]
for i, (label, an, wn) in enumerate(cost_rows):
    bold = (i == 0 or i == len(cost_rows) - 1)
    lab = P(f'<b>{label}</b>' if bold else label, CELL)
    cost.append([lab, fcell(an, 130), fcell(wn, 130)])
A(mk_table(cost, [251, 130, 130], rowHeights=[None] + [22] * len(cost_rows)))
spacer(3)
A(P('<b>Also provide (below):</b> a per-service breakdown behind the monthly figures, your assumptions, what is excluded, and how cost scales as users and contract volume grow.'))
A(P('Assumptions, per-service breakdown &amp; notes', H2))
A(Field('cost_notes', CW, 70, fontSize=9, multiline=True))
spacer(8)
A(P('Quotation validity (days):  ', LBL))
A(Field('validity', 160, 16, fontSize=9))

# ══ 13. Information requested ═════════════════════════════════════════════════
A(P('13.  Information requested from your firm', H1))
A(P('Please complete each field below.'))
info = [
    ('Relevant experience — comparable deployments; your Microsoft Azure and/or AWS partner status and certifications.', 'info_experience'),
    ('Proposed team and their roles for the engagement.', 'info_team'),
    ('Proposed deployment timeline (weeks to go-live) and key milestones.', 'info_timeline'),
    ('Your approach to the security, residency, backup and DR requirements (Sections 9–10).', 'info_security'),
    ('Two client references for similar work.', 'info_references'),
    ('Assumptions, dependencies and any exclusions underlying your quotation.', 'info_assumptions'),
]
for prompt, nm in info:
    A(P('<b>•</b>  ' + prompt, S('ip', leftIndent=2, spaceAfter=3, leading=12)))
    A(Field(nm, CW, 40, fontSize=9, multiline=True))
    spacer(6)

# ══ 14. Timeline & submission ════════════════════════════════════════════════
A(P('14.  Timeline, submission &amp; evaluation', H1))
tl = [
    [P('Item', CELLH), P('Detail', CELLH)],
    [P('Questions / clarifications by', CELLB), fcell('t_questions', 346)],
    [P('Quotation due by', CELLB), fcell('t_quote_due', 346)],
    [P('Target go-live', CELLB), fcell('t_golive', 346)],
    [P('Submit to', CELLB), fcell('t_submit', 346)],
    [P('Evaluation basis', CELLB), P('Total cost of ownership (deployment + run + support), security &amp; residency fit, delivery timeline, relevant experience and references.', CELL)],
]
A(mk_table(tl, [165, 346], rowHeights=[None, 20, 20, 20, 20, None]))

# ══ 15. Commercial & confidentiality ═════════════════════════════════════════
A(P('15.  Commercial terms &amp; confidentiality', H1))
for b in [
    'This document and any information shared are confidential to LLPL and provided solely to prepare a quotation; do not disclose or reuse them.',
    'This request does not oblige LLPL to award any work, and LLPL may amend or withdraw it.',
    'Quotations should remain valid for at least 60 days from submission (state your validity period above).',
    'All costs must be itemised and in INR, exclusive of applicable taxes (state taxes separately).',
]:
    A(bullet(b))

# ══ Sign-off ═════════════════════════════════════════════════════════════════
A(P('Submitted by', H1))
sign = [
    [P('Vendor / firm name', CELLB), fcell('v_firm', 346)],
    [P('Authorised signatory', CELLB), fcell('v_signatory', 346)],
    [P('Designation', CELLB), fcell('v_designation', 346)],
    [P('Date', CELLB), fcell('v_date', 346)],
]
A(mk_table(sign, [165, 346], header=False, rowHeights=[22, 22, 22, 22]))

# ── build ───────────────────────────────────────────────────────────────────
doc = BaseDocTemplate(
    OUT, pagesize=A4, leftMargin=42, rightMargin=42, topMargin=35 * mm, bottomMargin=20 * mm,
    title='Concord CLM — RFQ (fillable): Hosting, Deployment & Go-Live', author='Lakmē Lever — Legal',
)
frame = Frame(doc.leftMargin, doc.bottomMargin,
              doc.width, doc.height, id='main', leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
doc.addPageTemplates([PageTemplate(id='p', frames=[frame], onPage=on_page)])
doc.build(story)
print('WROTE', OUT)
