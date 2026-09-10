import type { PortfolioReport, ReportAgreementRow, ReportObligationRow } from '@concord/shared';

type PdfObject = Buffer;

function ascii(value: unknown): string {
  return String(value ?? '')
    .replace(/[₹€£]/g, 'INR ')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7e]/g, '?');
}

function pdfText(value: unknown): string {
  return ascii(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrap(value: string, max = 78): string[] {
  const words = ascii(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (!line) line = word;
    else if (`${line} ${word}`.length <= max) line += ` ${word}`;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function color(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [0, 1, 2].map((i) => parseInt(clean.slice(i * 2, i * 2 + 2), 16) / 255) as [number, number, number];
}

function textLine(value: string, x: number, y: number, size: number, hex = '#243143', bold = false): string {
  const [r, g, b] = color(hex);
  return `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg 1 0 0 1 ${x} ${y} Tm (${pdfText(value)}) Tj ET\n`;
}

function rect(x: number, y: number, width: number, height: number, hex: string): string {
  const [r, g, b] = color(hex);
  return `q ${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg ${x} ${y} ${width} ${height} re f Q\n`;
}

function line(x1: number, y1: number, x2: number, y2: number, hex = '#d9e0e8'): string {
  const [r, g, b] = color(hex);
  return `q ${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG 0.7 w ${x1} ${y1} m ${x2} ${y2} l S Q\n`;
}

function pageHeader(title: string, subtitle: string): string {
  let out = rect(0, 0, 612, 792, '#fbfcfe');
  out += rect(0, 744, 612, 48, '#1d2634');
  out += textLine('CONCORD', 36, 762, 13, '#f4c76b', true);
  out += textLine(title, 36, 708, 25, '#172333', true);
  out += textLine(subtitle, 36, 684, 10.5, '#637184');
  return out;
}

function footer(page: number, generatedAt: string): string {
  return `${line(36, 34, 576, 34)}${textLine('Concord portfolio report', 36, 20, 8.5, '#768395')}${textLine(`Page ${page}`, 520, 20, 8.5, '#768395')}${textLine(generatedAt.slice(0, 10), 400, 20, 8.5, '#768395')}`;
}

function kpi(label: string, value: string, detail: string, x: number, y: number, width = 165): string {
  let out = rect(x, y, width, 70, '#f1f4f8');
  out += textLine(label, x + 12, y + 49, 9, '#637184', true);
  out += textLine(value, x + 12, y + 26, 22, '#172333', true);
  out += textLine(detail, x + 12, y + 10, 8.5, '#637184');
  return out;
}

function insightBlock(title: string, body: string, tone: string, x: number, y: number): string {
  const tint = tone === 'risk' ? '#fbe9e9' : tone === 'watch' ? '#fff4da' : '#edf4fb';
  const edge = tone === 'risk' ? '#c64a4a' : tone === 'watch' ? '#d58a20' : '#4f86b4';
  const lines = wrap(body, 74);
  let out = rect(x, y - Math.max(46, lines.length * 13 + 30), 540, Math.max(46, lines.length * 13 + 30), tint);
  out += rect(x, y - Math.max(46, lines.length * 13 + 30), 5, Math.max(46, lines.length * 13 + 30), edge);
  out += textLine(title, x + 18, y - 20, 11.5, '#172333', true);
  lines.forEach((item, i) => { out += textLine(item, x + 18, y - 38 - i * 13, 9.5, '#344255'); });
  return out;
}

function agreementLine(row: ReportAgreementRow, y: number): string {
  const risk = row.risk === 'high' ? '#b64040' : row.risk === 'medium' ? '#ae7113' : '#3e7c5a';
  let out = textLine(row.title.slice(0, 33), 36, y, 9.4, '#172333', true);
  out += textLine(`${row.counterparty.slice(0, 28)} · ${row.stage}`, 36, y - 13, 8.5, '#637184');
  out += textLine(row.risk.toUpperCase(), 410, y - 2, 8.5, risk, true);
  out += textLine(row.nextDueDate ?? 'No key date', 474, y - 2, 8.5, '#637184');
  out += line(36, y - 22, 576, y - 22);
  return out;
}

function obligationLine(row: ReportObligationRow, y: number): string {
  const risk = row.risk === 'high' ? '#b64040' : row.risk === 'medium' ? '#ae7113' : '#3e7c5a';
  let out = textLine(row.title.slice(0, 48), 36, y, 9.2, '#172333', true);
  out += textLine(row.contractTitle.slice(0, 34), 36, y - 13, 8.3, '#637184');
  out += textLine(row.dueDate, 420, y - 2, 8.6, '#172333', true);
  out += textLine(row.status, 500, y - 2, 8.5, risk, true);
  out += line(36, y - 22, 576, y - 22);
  return out;
}

function buildPages(report: PortfolioReport): string[] {
  const metrics = new Map(report.metrics.map((metric) => [metric.key, metric]));
  const pages: string[] = [];

  let first = pageHeader('Portfolio intelligence', report.ai?.status === 'generated'
    ? 'AI-assisted narrative grounded to the same snapshot; metrics remain source-of-truth'
    : 'A concise view of agreement exposure, legal work and upcoming commitments');
  first += textLine(report.dataMode === 'live' ? 'Live persisted records' : 'Illustrative fixtures', 36, 652, 10, report.dataMode === 'live' ? '#3e7c5a' : '#ae7113', true);
  first += textLine(report.ai?.status === 'generated' ? `AI narrative: ${report.ai.model ?? 'GCP Gemini'} (advisory only)` : report.ai?.status === 'fallback' ? 'AI narrative unavailable; deterministic findings retained' : 'Narrative findings: deterministic rules', 36, 632, 8.8, report.ai?.status === 'generated' ? '#3e7c5a' : '#637184', report.ai?.status === 'generated');
  first += kpi('AGREEMENTS', metrics.get('agreements')?.displayValue ?? '0', 'in the report scope', 36, 555);
  first += kpi('LEGAL REVIEW', metrics.get('legal-review')?.displayValue ?? '0', 'review + approval stages', 219, 555);
  first += kpi('HIGH RISK', metrics.get('high-risk')?.displayValue ?? '0', 'playbook risk flagged', 402, 555);
  first += kpi('DUE IN 90 DAYS', metrics.get('due-90')?.displayValue ?? '0', 'obligations and renewals', 36, 468);
  if (metrics.has('pending-signatures')) first += kpi('OPEN SIGNATURES', metrics.get('pending-signatures')?.displayValue ?? '0', 'pending execution', 219, 468);
  first += textLine('Derived insights', 36, 420, 15, '#172333', true);
  let y = 397;
  for (const insight of report.insights.slice(0, 4)) {
    first += insightBlock(insight.source === 'ai' ? `AI - ${insight.title}` : insight.title, insight.body, insight.tone, 36, y);
    y -= Math.max(66, wrap(insight.body, 74).length * 13 + 42);
  }
  first += footer(1, report.generatedAt);
  pages.push(first);

  let second = pageHeader('Agreement register', 'The export includes legal metadata and derived workload signals, not source document text');
  second += textLine('Agreement', 36, 650, 8.5, '#637184', true);
  second += textLine('Risk', 410, 650, 8.5, '#637184', true);
  second += textLine('Next due', 474, 650, 8.5, '#637184', true);
  y = 627;
  for (const row of report.agreements.slice(0, 20)) {
    second += agreementLine(row, y);
    y -= 34;
    if (y < 65) break;
  }
  if (report.agreements.length > 20) second += textLine(`Showing 20 of ${report.agreements.length} agreements. Use the Excel export for the full register.`, 36, 52, 8.7, '#637184');
  second += footer(2, report.generatedAt);
  pages.push(second);

  let third = pageHeader('Commitments and execution', 'Upcoming dates and signature activity connected to the portfolio');
  third += textLine('Obligations', 36, 650, 15, '#172333', true);
  y = 620;
  for (const row of report.obligations.slice(0, 14)) {
    third += obligationLine(row, y);
    y -= 34;
    if (y < 190) break;
  }
  if (!report.obligations.length) third += textLine('No obligation rows are in scope.', 36, 620, 10, '#637184');
  third += textLine('Definitions', 36, 154, 13, '#172333', true);
  third += textLine('Risk follows the stored playbook level. Due dates are sorted from the persisted obligation records.', 36, 134, 9.4, '#637184');
  third += textLine(report.restricted.includes('signatures') ? 'Signature detail is restricted by the signed-in role.' : `Signature rows included: ${report.signatures.length}.`, 36, 118, 9.4, '#637184');
  third += textLine(report.ai?.status === 'generated' ? 'AI narrative is advisory and linked to the supplied evidence rows; it does not change workflow state.' : 'AI narrative is not enabled; findings are produced by deterministic portfolio rules.', 36, 102, 8.7, '#637184');
  third += footer(3, report.generatedAt);
  pages.push(third);
  return pages;
}

/** Creates a valid, dependency-free PDF with a readable legal-ops layout. */
export function buildPdf(report: PortfolioReport): Buffer {
  const streams = buildPages(report).map((body) => Buffer.from(body, 'latin1'));
  const objects: PdfObject[] = [];
  const add = (body: string | Buffer) => { objects.push(Buffer.isBuffer(body) ? body : Buffer.from(body, 'latin1')); return objects.length; };
  const catalog = add('');
  const pages = add('');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const boldFont = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const pageIds: number[] = [];
  const contentIds: number[] = [];
  streams.forEach((stream) => {
    contentIds.push(add(Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, 'latin1'), stream, Buffer.from('\nendstream', 'latin1')])));
    pageIds.push(add(''));
  });
  objects[catalog - 1] = Buffer.from(`<< /Type /Catalog /Pages ${pages} 0 R >>`, 'latin1');
  objects[pages - 1] = Buffer.from(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`, 'latin1');
  pageIds.forEach((pageId, i) => {
    objects[pageId - 1] = Buffer.from(`<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R /F2 ${boldFont} 0 R >> >> /Contents ${contentIds[i]} 0 R >>`, 'latin1');
  });

  const header = Buffer.from('%PDF-1.4\n%\xff\xff\xff\xff\n', 'latin1');
  const chunks: Buffer[] = [header];
  const offsets: number[] = [0];
  let offset = header.length;
  objects.forEach((object, i) => {
    offsets[i + 1] = offset;
    const wrapped = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), object, Buffer.from('\nendobj\n', 'latin1')]);
    chunks.push(wrapped);
    offset += wrapped.length;
  });
  const xrefOffset = offset;
  const xref = [`xref\n0 ${objects.length + 1}\n`, '0000000000 65535 f \n'];
  for (let i = 1; i <= objects.length; i += 1) xref.push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  xref.push(`trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  chunks.push(Buffer.from(xref.join(''), 'latin1'));
  return Buffer.concat(chunks);
}
