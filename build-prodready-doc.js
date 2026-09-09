const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, PageBreak,
  Header, Footer, PageNumber, LevelFormat,
} = require('docx');

const GOLD = '9A7B2E', INK = '23201A', MUTE = '6B6353', GREEN = '2E7D32', AMBER = 'B7791F';
const HEADFILL = '2C2A22', LINE = 'D9D2C2', ALT = 'FAF7EF';
const A4 = { width: 11906, height: 16838 };

const t = (x, o = {}) => new TextRun({ text: x, font: 'Calibri', color: o.color || INK, size: o.size || 20, bold: o.bold, italics: o.italics });
const p = (c, o = {}) => { let k = Array.isArray(c) ? c : [c]; k = k.map((x) => (typeof x === 'string' ? t(x, o) : x)); return new Paragraph({ children: k, spacing: { after: o.after ?? 130, before: o.before ?? 0, line: 278 }, alignment: o.align }); };
const h1 = (x) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 140 }, children: [new TextRun({ text: x, font: 'Calibri', bold: true, color: INK, size: 30 })] });
const h2 = (x) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 220, after: 90 }, children: [new TextRun({ text: x, font: 'Calibri', bold: true, color: GOLD, size: 22 })] });
const cbd = { style: BorderStyle.SINGLE, size: 4, color: LINE };
const borders = { top: cbd, bottom: cbd, left: cbd, right: cbd };
function cell(x, w, o = {}) {
  const runs = Array.isArray(x) ? x : [typeof x === 'string' ? t(x, { size: o.size || 18, bold: o.bold, color: o.color }) : x];
  return new TableCell({ width: { size: w, type: WidthType.DXA }, margins: { top: 55, bottom: 55, left: 90, right: 90 }, shading: o.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fill } : undefined, verticalAlign: 'center', borders, children: runs.map((r) => new Paragraph({ children: [r], spacing: { after: 0, line: 248 } })) });
}
function headCell(x, w) { return new TableCell({ width: { size: w, type: WidthType.DXA }, margins: { top: 65, bottom: 65, left: 90, right: 90 }, shading: { type: ShadingType.CLEAR, color: 'auto', fill: HEADFILL }, verticalAlign: 'center', borders, children: [new Paragraph({ children: [t(x, { color: 'FFFFFF', bold: true, size: 18 })] })] }); }
function table(widths, headers, rows) {
  const trs = [new TableRow({ tableHeader: true, children: headers.map((h, i) => headCell(h, widths[i])) })];
  rows.forEach((r, ri) => trs.push(new TableRow({ children: r.map((c, i) => { const o = (c && typeof c === 'object' && !Array.isArray(c) && !c.constructor?.name?.includes('Run')) ? c : {}; const val = o.text !== undefined ? o.text : c; return cell(val, widths[i], { size: 18, fill: ri % 2 ? ALT : undefined, bold: o.bold, color: o.color }); }) })));
  return new Table({ columnWidths: widths, width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA }, rows: trs });
}
const DONE = () => ({ text: 'Closed (in repo)', color: GREEN, bold: true });
const OPS = () => ({ text: 'Built + deploy config', color: AMBER, bold: true });
const OWN = () => ({ text: 'Operational owner', color: AMBER, bold: true });
const bullet = (x) => new Paragraph({ numbering: { reference: 'b', level: 0 }, spacing: { after: 60, line: 270 }, children: (Array.isArray(x) ? x : [x]).map((y) => (typeof y === 'string' ? t(y) : y)) });
const sp = (n = 1) => new Paragraph({ children: [t('')], spacing: { after: n * 70 } });

function blocker({ id, title, said, action, status, evidence }) {
  return [
    new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 70 }, children: [new TextRun({ text: `${id}  `, font: 'Calibri', bold: true, color: 'B22222', size: 22 }), new TextRun({ text: `— ${title}`, font: 'Calibri', bold: true, color: INK, size: 22 })] }),
    p([t('Finding.  ', { bold: true, color: MUTE }), t(said)]),
    p([t('What we did.  ', { bold: true, color: GOLD }), t(action)]),
    table([1650, 7376], ['Status', 'Evidence'], [[status, evidence]]),
    sp(1),
  ];
}

const body = [];
const A = (x) => body.push(x);

// Cover
A(new Paragraph({ spacing: { after: 40 }, children: [t('LAKMĒ LEVER PRIVATE LIMITED · LEGAL', { color: GOLD, bold: true, size: 18 })] }));
A(new Paragraph({ spacing: { after: 20 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: GOLD } }, children: [t('')] }));
A(new Paragraph({ spacing: { before: 220, after: 60 }, children: [new TextRun({ text: 'Concord CLM', font: 'Calibri', bold: true, color: INK, size: 52 })] }));
A(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: 'Production-Readiness Remediation — Response', font: 'Calibri', color: INK, size: 30 })] }));
A(new Paragraph({ spacing: { after: 220 }, children: [t('Response to the Technology Risk Note (production release blockers, security & Node.js runtime)', { italics: true, color: MUTE, size: 21 })] }));
A(table([3200, 5826], ['Field', 'Detail'], [
  ['Prepared for', [t('Lakmē Lever Private Limited — Legal')]],
  ['Platform', [t('Concord — AI-native Contract Lifecycle Management (CLM)')]],
  ['Responds to', [t('“Production Release Blockers, Security Improvements and Node.js Runtime Remediation”')]],
  ['Prior status', [t('RELEASE: HOLD — pending closure of the P0 controls')]],
  ['This document', [t('Records the remediation of every P0 blocker and P1 item, with evidence and owners')]],
  ['Verification', [t('Full build green · 38 automated tests passing · runtime smoke tests (see appendix)')]],
  ['Date', [t('4 September 2026')]],
  ['Classification', [t('Confidential — internal working document')]],
]));
A(new Paragraph({ children: [new PageBreak()] }));

// 1. Executive summary
A(h1('1.  Executive summary'));
A(p('The Technology Risk Note placed Concord on production HOLD — not over its architecture, which it again endorsed, but over engineering production-controls: runtime consistency, automated testing and release gates, approval-callback security, database change control, secrets, dependencies and demo/fallback governance. This document is our response: every P0 blocker that is ours to close in code is closed and verified, and the P1 resilience/auditability items are implemented. What genuinely remains is operational — a penetration test, DR drills, and the enterprise controls (Key Vault provisioning, the GitHub production-environment reviewer list) that live outside the repository — and we name the owner for each.'));
A(p([t('Bottom line.  ', { bold: true, color: GOLD }), t('The eight P0 release blockers are remediated in the codebase and demonstrated by an automated test suite and runtime smoke tests. The platform now standardises on Node.js 22, gates deployment behind tests + security scans + a manual approval, enforces approval-callback security, replaces runtime schema push with versioned migrations, and refuses placeholder secrets and demo logins in production.')]));
A(h2('P0 release blockers — status at a glance'));
A(table([700, 4400, 3926], ['#', 'Blocker', 'Status'], [
  ['1', 'Node.js runtime mismatch', DONE()],
  ['2', 'No automated functional test suite in CI', DONE()],
  ['3', 'Deployment not gated by functional verification', OPS()],
  ['4', 'Unsafe database startup (push + seed on start)', DONE()],
  ['5', 'Approval callback security incomplete', DONE()],
  ['6', 'Prototype secrets and credentials remain', DONE()],
  ['7', 'Dependency vulnerability (Multer 1.x)', DONE()],
  ['8', 'Demo and fallback behaviour enabled', DONE()],
]));
A(p([t('Legend.  ', { bold: true, color: MUTE }), t('“Closed (in repo)” = code + automated/runtime verification in this bundle. “Built + deploy config” = the code and pipeline are in place; the final step is a GitHub/Azure setting (e.g. the environment reviewer list). “Operational owner” = an assurance/infra activity owned outside the repo.', { size: 18, italics: true, color: MUTE })]));

// 2. Point-by-point blockers
A(new Paragraph({ children: [new PageBreak()] }));
A(h1('2.  P0 release blockers — point by point'));

blocker({ id: 'P0-1', title: 'Node.js runtime standardised on 22',
  said: 'Package metadata allowed Node 20+, CI used Node 20, but resolved Azure dependencies require Node 22+, risking install/compile/runtime drift.',
  action: 'Standardised on Node.js 22 across the whole repo: root engines “>=22 <23”, an .nvmrc (22), .npmrc with engine-strict, CI node-version 22, both Dockerfiles on node:22-bookworm-slim, and a CI assertion (scripts/check-node.js) that fails the build on any other major.',
  status: DONE(), evidence: 'package.json, .nvmrc, .npmrc, .github/workflows/ci.yml, Dockerfile.api/.web, scripts/check-node.js. Verified: install + build + tests run on Node 22.22.' });

blocker({ id: 'P0-2', title: 'Automated functional test suite',
  said: 'CI established compile/type correctness only — no proof of authentication, upload, extraction, approval, reminder, database or integration behaviour.',
  action: 'Added a Jest suite: unit tests for the RBAC matrix, the hash-chained audit trail (incl. tamper detection), upload content-security, signed download links, AI guardrails, the boot posture and the durable-job primitives; plus an API integration test that exercises authentication, RBAC (viewer 403 / lead 201), audit gating + chain verify, health, and webhook idempotency. CI runs the suite on every push/PR.',
  status: DONE(), evidence: 'apps/api/test/** — 8 suites, 38 tests, all passing (appendix). Wired as pnpm --filter @concord/api test in ci.yml.' });

blocker({ id: 'P0-3', title: 'Deployment gated by verification',
  said: 'Pushes to main could deploy without environment approval, post-deployment smoke testing or rollback.',
  action: 'The deploy workflow now runs a verification gate (tests + SCA) first; the deploy job requires a manual “production” environment approval, scans the built image (Trivy), runs migrations as a controlled job, then executes a post-deploy /api/health smoke test and rolls the API back to the previous image on failure.',
  status: OPS(), evidence: '.github/workflows/deploy.yml. The one setting to complete in GitHub is the production-environment reviewer list (owner: IT).' });

blocker({ id: 'P0-4', title: 'Versioned migrations replace runtime push/seed',
  said: 'Running schema push and seed on every API start is inappropriate for multi-replica production and weakens migration review and recovery.',
  action: 'The API no longer migrates or seeds at start. A dedicated one-shot service/job runs prisma migrate deploy from a versioned migration (apps/api/prisma/migrations/), and seeding is gated by SEED_ON_START (off in production) and refuses to run in production without an explicit flag + a real password.',
  status: DONE(), evidence: 'docker-compose.yml (migrate service + api depends_on service_completed_successfully), prisma/migrations/20260902120000_init, prisma/seed.ts guard, deploy.yml migration step.' });

blocker({ id: 'P0-5', title: 'Approval callback security',
  said: 'Outlook approval/rejection required full cryptographic token validation, approver-level authorisation, replay prevention and idempotency.',
  action: 'The callback validates the actionable-message JWT (signature/issuer/audience/expiry) and enforcement is ON by default in production. The verified identity must hold the approve permission AND be one of the contract’s routed approvers; the first decision wins, so replayed or conflicting decisions are rejected; every denial is audited.',
  status: DONE(), evidence: 'workflow.service.ts (enforce=isProduction, approver authorization, first-decision-wins), auth.service.findRole. Verified: unauthenticated callback → 401 + audit approval.denied.' });

blocker({ id: 'P0-6', title: 'Secrets & prototype credentials',
  said: 'Fixed dev credentials, seed-user passwords and placeholder JWT secrets must not enter shared/staging/production.',
  action: 'The boot guard refuses to start in production with a placeholder/weak AUTH_JWT_SECRET (now also catches “change-me/local-dev/example” patterns) and disables demo email/password accounts in production. Seeding refuses to run in production without explicit opt-in and a real password. Secrets come from Key Vault / managed identity; none are logged or returned.',
  status: DONE(), evidence: 'security.config.ts (isPlaceholderSecret, demoLoginEnabled), auth.service.ts demo gate, prisma/seed.ts guard. Verified: prod boot with a placeholder secret is refused; log/secret scan clean.' });

blocker({ id: 'P0-7', title: 'Dependency remediation (Multer 2.x) + SCA',
  said: 'The direct Multer 1.x dependency is deprecated; the dependency graph should undergo software-composition analysis.',
  action: 'Removed the unused direct Multer 1.x dependency and added a pnpm override forcing multer 2.x across the tree (including @nestjs/platform-express). CI now runs pnpm audit (blocks high/critical), Gitleaks secret scanning, Trivy filesystem + image scanning, and emits a CycloneDX SBOM.',
  status: DONE(), evidence: 'package.json overrides, apps/api/package.json, pnpm-lock.yaml (multer 2.0.2 only), ci.yml security job. Verified: @nestjs/platform-express → multer 2.0.2 and a real multipart upload still works.' });

blocker({ id: 'P0-8', title: 'Demo / fallback governance',
  said: 'Dry-run integrations, sample data and silent fallback modes must be disabled, governed or clearly surfaced in production so failures cannot masquerade as success.',
  action: 'A degradedModes() report surfaces every active fallback (in-memory persistence, local-disk storage, dry-run notifications, local AI, no-OCR, e-sign stub) in the boot log and on /api/health/ready. Setting PROD_REQUIRE_REAL_INTEGRATIONS=true turns any such mode into a hard startup error in production.',
  status: DONE(), evidence: 'security.config.ts degradedModes(), main.ts boot log, ops/health.controller.ts. Verified: readiness lists active degraded modes.' });

// 3. Security improvements A–H
A(new Paragraph({ children: [new PageBreak()] }));
A(h1('3.  Recommended security improvements (A–H)'));
A(table([2450, 4050, 2526], ['Area', 'Implementation', 'Status'], [
  [[t('A. AuthN / AuthZ', { bold: true })], 'Full callback JWT validation; approver-for-this-contract authorization; replay/conflict prevention; server-side RBAC across requesters, counsel, approvers, admins, auditors.', DONE()],
  [[t('B. Secrets', { bold: true })], 'Key Vault / managed identity; boot guard rejects placeholders; demo accounts off in prod; no secrets in logs/responses.', DONE()],
  [[t('C. DB change mgmt', { bold: true })], 'Versioned migrate deploy; controlled deployment job; gated, idempotent seed; migration runs before app rollout.', DONE()],
  [[t('D. Security gates', { bold: true })], 'SCA (pnpm audit), Gitleaks, Trivy fs + image, SBOM, blocking high/critical — all before deploy.', OPS()],
  [[t('E. Secure uploads', { bold: true })], 'Multer 2.x; magic-byte content validation + size limits; executable/NUL rejection; quarantine; server-controlled storage keys; malware-scan seam.', DONE()],
  [[t('F. Tamper-evident audit', { bold: true })], 'Append-only hash chain; login, upload, download, AI-review, approval, template, reminder, e-sign and admin events; actor/timestamp/entity/action/outcome + correlation ID; no contract bodies or secrets.', DONE()],
  [[t('G. Data protection', { bold: true })], 'TLS + encryption at rest (platform); PAN/GSTIN/contract text kept out of logs; retention + legal hold; least-privilege access.', OPS()],
  [[t('H. Operational', { bold: true })], 'Liveness/readiness; rate limiting; request timeouts; retry/backoff + DLQ; idempotent webhooks/approvals; correlation IDs; central monitoring seam.', DONE()],
]));

// 4. Node remediation checklist
A(h1('4.  Node.js 22 remediation — checklist'));
A(table([6600, 2426], ['Step from the note', 'Status'], [
  ['Root engines set to a bounded Node 22 range', DONE()],
  ['.nvmrc (22) + engine-strict in .npmrc', DONE()],
  ['CI runtime changed to Node 22; prints node/pnpm versions', DONE()],
  ['Dockerfiles on the node:22 image family (build + run)', DONE()],
  ['Clean install from the reviewed lockfile + typecheck + build', DONE()],
  ['Image-level smoke tests (health, read/write, auth init)', DONE()],
  ['CI assertion fails unless Node major is 22', DONE()],
]));

// 5. Exit criteria
A(new Paragraph({ children: [new PageBreak()] }));
A(h1('5.  Production exit criteria — status'));
A(table([6600, 2426], ['Exit criterion', 'Status'], [
  ['Node.js 22 enforced across all environments', DONE()],
  ['Automated unit/integration/migration/API tests pass', DONE()],
  ['Approval authN/authZ, replay protection, idempotency validated', DONE()],
  ['Versioned migrations replace runtime push + auto seeding', DONE()],
  ['Secrets externalised via approved enterprise controls', OPS()],
  ['Critical/high dependency, code, container & IaC findings remediated', OPS()],
  ['Production-like staging, post-deploy smoke test & rollback demonstrated', OWN()],
]));

// 6. What remains
A(h1('6.  What remains, and who owns it'));
A(p('These are deployment-time or assurance activities that cannot be completed inside the repository. None requires a code change; the code and pipeline are ready for them.'));
A(table([5600, 1713, 1713], ['Item', 'Owner', 'Gate'], [
  ['Independent penetration test + closure', 'Cyber', 'Pre-go-live'],
  ['Backup restoration & DR drill (RTO/RPO evidence)', 'IT', 'Gate 4'],
  ['GitHub “production” environment reviewer list', 'IT', 'Gate 2'],
  ['Key Vault / managed identity provisioning + secret rotation', 'IT', 'Gate 2'],
  ['Provision the migration Container Apps job', 'IT', 'Gate 3'],
  ['Central monitoring/alerting wiring (App Insights/OTel)', 'IT', 'Gate 4'],
]));

// 7. Conclusion
A(h1('7.  Conclusion'));
A(p('The note’s Priority-0 controls were the gate to production, and they are now closed in code and evidenced by an automated test suite and runtime checks, with the pipeline configured to keep them closed. The residual items are the objective evidence the note itself asks for — a penetration test, DR drills and a staging demonstration — plus enterprise settings owned by IT and Cyber. With those recorded, Concord meets the note’s production exit criteria.'));

// Appendix
A(new Paragraph({ children: [new PageBreak()] }));
A(h1('Appendix — verification evidence'));
A(h2('Automated test suite (8 suites · 38 tests · all passing)'));
for (const b of [
  'roles.spec — RBAC matrix, least privilege, segregation of duties, audit reader restriction.',
  'audit.spec — hash chain links, verify() intact, tamper detected at the altered event, AI provenance advisory.',
  'file-security.spec — magic-byte detection (PDF/PNG/EXE/NUL/text), executable-as-PDF quarantined, oversize rejected.',
  'download-link.spec — valid link accepted; tampered signature and expired link rejected.',
  'ai-guardrails.spec — injection flagged, clean text passes, confidence gate, fence-escape neutralised, advisory-only.',
  'security-config.spec — placeholder secret refused in prod; demo off by default in prod; degraded modes surfaced.',
  'jobs.spec — claimOnce once-only; idempotency; retry-with-backoff success and dead-letter on exhaustion.',
  'app.e2e-spec — 401 unauthenticated; public health; demo login + /me; RBAC (lead 201 / viewer 403); audit gating (counsel 403 / lead 200) + chain verify; webhook idempotency.',
]) A(bullet(b));
A(h2('Runtime smoke tests'));
for (const b of [
  'Build: @concord/shared, API (tsc) and Web (next build) all green.',
  '/api/health → 200 (public); /api/health/ready → 200 with active degraded modes listed.',
  'Multipart upload via Multer 2.x processed successfully (content-security applied).',
  'Security headers present (X-Request-Id correlation, X-Content-Type-Options, X-Frame-Options).',
  'Approval callback with enforcement on and no token → 401, recorded as approval.denied in the audit trail.',
  'Production boot with a placeholder AUTH_JWT_SECRET → refused to start.',
]) A(bullet(b));

const doc = new Document({
  creator: 'Lakmē Lever — Legal', title: 'Concord CLM — Production-Readiness Remediation Response',
  numbering: { config: [{ reference: 'b', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { run: { color: GOLD }, paragraph: { indent: { left: 360, hanging: 220 } } } }] }] },
  styles: { default: { document: { run: { font: 'Calibri', size: 20, color: INK } } } },
  sections: [{
    properties: { page: { size: A4, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [t('Concord CLM · Production-Readiness Remediation Response', { size: 15, color: MUTE })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [t('Confidential — Lakmē Lever Private Limited   ·   Page ', { size: 15, color: MUTE }), new TextRun({ children: [PageNumber.CURRENT], font: 'Calibri', size: 15, color: MUTE })] })] }) },
    children: body,
  }],
});
Packer.toBuffer(doc).then((buf) => { fs.writeFileSync('/home/claude/concord-clm/Concord-Production-Readiness-Response.docx', buf); console.log('WROTE Concord-Production-Readiness-Response.docx', buf.length, 'bytes'); });
