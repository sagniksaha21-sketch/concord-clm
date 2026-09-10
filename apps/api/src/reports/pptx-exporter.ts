import type { PortfolioReport, ReportAgreementRow, ReportInsight, ReportMetric } from '@concord/shared';
import { zip } from './zip';

const SLIDE_W = 1280;
const SLIDE_H = 720;
const GOLD = 'F4C76B';
const INK = '172333';
const MUTED = '637184';
const LIGHT = 'F7F9FC';

function xml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function emu(px: number): number { return Math.round(px * 9525); }

function color(hex: string): string {
  return hex.replace('#', '').toUpperCase().padStart(6, '0');
}

function textShape(id: number, x: number, y: number, width: number, height: number, text: string, opts: {
  size?: number;
  fill?: string;
  bold?: boolean;
  font?: string;
  align?: 'l' | 'ctr' | 'r';
} = {}): string {
  const size = opts.size ?? 18;
  const fill = color(opts.fill ?? INK);
  const font = opts.font ?? 'Aptos';
  const align = opts.align ?? 'l';
  const paragraphs = String(text).split('\n').map((line) => `<a:p><a:pPr algn="${align}"/><a:r><a:rPr lang="en-US" sz="${size * 100}"${opts.bold ? ' b="1"' : ''}><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill><a:latin typeface="${xml(font)}"/></a:rPr><a:t>${xml(line)}</a:t></a:r><a:endParaRPr lang="en-US" sz="${size * 100}"/></a:p>`).join('');
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(width)}" cy="${emu(height)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" rtlCol="0" anchor="t"/><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`;
}

function rectShape(id: number, x: number, y: number, width: number, height: number, fill: string, radius = false): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shape ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(width)}" cy="${emu(height)}"/></a:xfrm><a:prstGeom prst="${radius ? 'roundRect' : 'rect'}"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${color(fill)}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`;
}

function lineShape(id: number, x: number, y: number, width: number, height: number, fill: string): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Line ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(width)}" cy="${emu(height)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${color(fill)}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`;
}

function slideXml(shapes: string[], background = LIGHT): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Background"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(SLIDE_W)}" cy="${emu(SLIDE_H)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${color(background)}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>${shapes.join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function titleBand(title: string, subtitle: string, dark = false): string[] {
  const text = dark ? 'F7F9FC' : INK;
  const muted = dark ? 'B6C0CE' : MUTED;
  return [
    textShape(3, 56, 38, 1120, 48, title, { size: 30, fill: text, bold: true, font: 'Aptos Display' }),
    textShape(4, 58, 88, 1120, 30, subtitle, { size: 12.5, fill: muted }),
    lineShape(5, 56, 128, 1168, 2, dark ? GOLD : 'D9E0E8'),
  ];
}

function metricCard(id: number, metric: ReportMetric, x: number, y: number): string[] {
  return [
    rectShape(id, x, y, 250, 122, 'EEF2F7', true),
    textShape(id + 1, x + 18, y + 16, 214, 22, metric.label.toUpperCase(), { size: 10, fill: MUTED, bold: true }),
    textShape(id + 2, x + 18, y + 42, 214, 44, metric.displayValue, { size: 30, fill: INK, bold: true, font: 'Aptos Display' }),
    textShape(id + 3, x + 18, y + 91, 214, 18, metric.detail ?? '', { size: 10, fill: MUTED }),
  ];
}

function insightCard(id: number, insight: ReportInsight, x: number, y: number, width = 530): string[] {
  const bg = insight.tone === 'risk' ? 'FBE9E9' : insight.tone === 'watch' ? 'FFF4DA' : 'EDF4FB';
  const edge = insight.tone === 'risk' ? 'C64A4A' : insight.tone === 'watch' ? 'D58A20' : '4F86B4';
  const label = insight.source === 'ai' ? `AI · ${insight.title}` : insight.title;
  return [
    rectShape(id, x, y, width, 82, bg, true),
    rectShape(id + 1, x, y, 6, 82, edge),
    textShape(id + 2, x + 20, y + 14, width - 36, 22, label, { size: 14, fill: INK, bold: true }),
    textShape(id + 3, x + 20, y + 39, width - 36, 32, insight.body, { size: 10.5, fill: '344255' }),
  ];
}

function footer(id: number, report: PortfolioReport, slideNumber: number): string[] {
  return [
    lineShape(id, 56, 680, 1168, 1, 'D9E0E8'),
    textShape(id + 1, 56, 688, 380, 16, 'Concord portfolio intelligence', { size: 9, fill: MUTED }),
    textShape(id + 2, 1040, 688, 184, 16, `Page ${slideNumber}`, { size: 9, fill: MUTED, align: 'r' }),
  ];
}

function createSlides(report: PortfolioReport): string[] {
  const slides: string[] = [];
  const metrics = report.metrics.slice(0, 5);

  // 1. Minimal cover.
  slides.push(slideXml([
    rectShape(3, 0, 0, SLIDE_W, SLIDE_H, '172333'),
    rectShape(4, 0, 0, SLIDE_W, 12, GOLD),
    textShape(5, 78, 120, 1120, 40, 'CONCORD', { size: 16, fill: GOLD, bold: true, font: 'Aptos Display' }),
    textShape(6, 78, 196, 920, 122, 'Portfolio intelligence', { size: 46, fill: 'F7F9FC', bold: true, font: 'Aptos Display' }),
    textShape(7, 82, 337, 820, 54, 'Agreement exposure, legal work and commitments in one accountable view', { size: 19, fill: 'B6C0CE' }),
    textShape(8, 82, 510, 900, 24, report.dataMode === 'live' ? 'Based on live persisted agreement records' : 'Based on illustrative fixture records', { size: 12, fill: report.dataMode === 'live' ? '9DD4AF' : GOLD, bold: true }),
    textShape(9, 82, 548, 760, 22, `Generated ${report.generatedAt.slice(0, 10)}`, { size: 11, fill: 'B6C0CE' }),
    textShape(13, 82, 578, 900, 20, report.ai?.status === 'generated' ? `AI-assisted narrative · ${report.ai.model ?? 'GCP Gemini'} · advisory only` : report.ai?.status === 'fallback' ? 'Deterministic narrative fallback · AI provider unavailable' : 'Deterministic narrative · database metrics remain authoritative', { size: 10, fill: report.ai?.status === 'generated' ? '9DD4AF' : 'B6C0CE', bold: report.ai?.status === 'generated' }),
    rectShape(10, 1015, 112, 112, 112, '243143', true),
    textShape(11, 1038, 142, 66, 38, String(report.agreements.length), { size: 32, fill: GOLD, bold: true, align: 'ctr' }),
    textShape(12, 1025, 185, 94, 20, 'agreements', { size: 10, fill: 'B6C0CE', align: 'ctr' }),
  ], '172333'));

  // 2. Executive summary.
  let summary: string[] = [...titleBand('Portfolio at a glance', report.ai?.status === 'generated' ? 'AI-assisted narrative grounded to the same snapshot; metrics remain source-of-truth' : 'Deterministic metrics and findings calculated from the report snapshot')];
  metrics.forEach((metric, i) => summary.push(...metricCard(10 + i * 4, metric, 56 + (i % 4) * 288, 160 + Math.floor(i / 4) * 142)));
  summary.push(textShape(40, 56, 452, 360, 26, 'Derived insights', { size: 16, fill: INK, bold: true }));
  report.insights.slice(0, 2).forEach((insight, i) => summary.push(...insightCard(41 + i * 4, insight, 56 + i * 588, 492, 550)));
  summary.push(...footer(60, report, 2));
  slides.push(slideXml(summary));

  // 3. Lifecycle and risk mix.
  let mix: string[] = [...titleBand('Lifecycle and risk mix', 'Where the portfolio sits today, with stage and playbook risk kept separate')];
  mix.push(textShape(10, 56, 162, 480, 28, 'Lifecycle stage', { size: 17, fill: INK, bold: true }));
  const maxStage = Math.max(1, ...report.stageCounts.map((stage) => stage.count));
  report.stageCounts.forEach((stage, i) => {
    const y = 210 + i * 49;
    mix.push(textShape(11 + i * 3, 56, y, 140, 18, stage.label, { size: 11, fill: MUTED, bold: true }));
    mix.push(rectShape(12 + i * 3, 206, y + 1, 420, 18, 'E9EEF4', true));
    mix.push(rectShape(13 + i * 3, 206, y + 1, Math.max(stage.count ? 16 : 0, 420 * stage.count / maxStage), 18, stage.stage === 'renewal' ? 'C64A4A' : stage.stage === 'review' || stage.stage === 'approval' ? 'D58A20' : '6D9FC2', true));
    mix.push(textShape(14 + i * 3, 646, y - 1, 40, 22, String(stage.count), { size: 13, fill: INK, bold: true, align: 'r' }));
  });
  mix.push(textShape(40, 760, 162, 380, 28, 'Playbook risk', { size: 17, fill: INK, bold: true }));
  const riskRows = [['Low', report.risk.low, '6D9FC2'], ['Medium', report.risk.medium, 'D58A20'], ['High', report.risk.high, 'C64A4A']] as const;
  riskRows.forEach(([label, value, fill], i) => {
    const y = 222 + i * 95;
    mix.push(rectShape(41 + i * 3, 760, y, 330, 62, 'F1F4F8', true));
    mix.push(rectShape(42 + i * 3, 760, y, 8, 62, fill, true));
    mix.push(textShape(43 + i * 3, 785, y + 13, 200, 20, label, { size: 12, fill: MUTED, bold: true }));
    mix.push(textShape(44 + i * 3, 785, y + 31, 240, 26, String(value), { size: 24, fill: INK, bold: true, font: 'Aptos Display' }));
  });
  mix.push(...footer(60, report, 3));
  slides.push(slideXml(mix));

  // 4. Watchlist.
  let watch: string[] = [...titleBand('Priority watchlist', 'Risk-first agreement rows with the next recorded key date')];
  watch.push(textShape(10, 56, 158, 420, 26, 'Agreement', { size: 12, fill: MUTED, bold: true }));
  watch.push(textShape(11, 918, 158, 96, 26, 'Risk', { size: 12, fill: MUTED, bold: true }));
  watch.push(textShape(12, 1040, 158, 150, 26, 'Next due', { size: 12, fill: MUTED, bold: true }));
  report.agreements.slice(0, 8).forEach((row, i) => {
    const y = 198 + i * 54;
    const riskFill = row.risk === 'high' ? 'C64A4A' : row.risk === 'medium' ? 'D58A20' : '3E7C5A';
    watch.push(lineShape(20 + i * 4, 56, y + 42, 1168, 1, 'D9E0E8'));
    watch.push(textShape(21 + i * 4, 56, y, 570, 20, row.title, { size: 12.5, fill: INK, bold: true }));
    watch.push(textShape(22 + i * 4, 56, y + 22, 570, 18, `${row.counterparty} · ${row.stage} · ${row.version}`, { size: 10, fill: MUTED }));
    watch.push(rectShape(23 + i * 4, 918, y + 2, 92, 25, riskFill, true));
    watch.push(textShape(24 + i * 4, 918, y + 7, 92, 16, row.risk.toUpperCase(), { size: 9, fill: 'FFFFFF', bold: true, align: 'ctr' }));
    watch.push(textShape(25 + i * 4, 1040, y + 7, 150, 18, row.nextDueDate ?? 'No key date', { size: 10, fill: MUTED, align: 'r' }));
  });
  if (!report.agreements.length) watch.push(textShape(20, 56, 210, 640, 24, 'No agreements are in scope for this role.', { size: 13, fill: MUTED }));
  watch.push(...footer(62, report, 4));
  slides.push(slideXml(watch));

  // 5. Commitments and execution.
  let commitments: string[] = [...titleBand('Commitments and execution', 'The next dates and signature queue that require operational attention')];
  commitments.push(textShape(10, 56, 158, 520, 26, 'Next recorded obligations', { size: 17, fill: INK, bold: true }));
  report.obligations.slice(0, 7).forEach((row, i) => {
    const y = 205 + i * 50;
    commitments.push(textShape(11 + i * 2, 56, y, 470, 19, row.title, { size: 11, fill: INK, bold: true }));
    commitments.push(textShape(12 + i * 2, 56, y + 20, 470, 17, `${row.contractTitle} · ${row.status}`, { size: 9.5, fill: MUTED }));
    commitments.push(textShape(30 + i, 520, y + 5, 90, 18, row.dueDate, { size: 10, fill: row.risk === 'high' ? 'C64A4A' : MUTED, bold: row.risk === 'high', align: 'r' }));
  });
  commitments.push(rectShape(40, 720, 180, 460, 278, 'F1F4F8', true));
  commitments.push(textShape(41, 752, 188, 390, 24, 'Signature queue', { size: 17, fill: INK, bold: true }));
  const sigValue = report.restricted.includes('signatures') ? 'Restricted' : String(report.signatures.filter((row) => ['sent', 'viewed', 'partially-signed'].includes(row.status)).length);
  commitments.push(textShape(42, 752, 238, 390, 55, sigValue, { size: 30, fill: INK, bold: true, font: 'Aptos Display' }));
  commitments.push(textShape(43, 752, 298, 390, 54, report.restricted.includes('signatures') ? 'The signed-in role cannot read provider execution detail.' : 'Open envelopes remain in the execution queue until all required signatories complete.', { size: 11, fill: MUTED }));
  commitments.push(...footer(60, report, 5));
  slides.push(slideXml(commitments));

  // 6. Scope and definitions.
  let scope: string[] = [...titleBand('Scope and definitions', 'How to read this report and what the export intentionally leaves out')];
  scope.push(rectShape(10, 56, 168, 1168, 94, report.dataMode === 'live' ? 'EAF6EE' : 'FFF4DA', true));
  scope.push(textShape(11, 82, 192, 300, 22, report.dataMode === 'live' ? 'Live persisted records' : 'Illustrative fixture records', { size: 15, fill: report.dataMode === 'live' ? '3E7C5A' : 'AE7113', bold: true }));
  scope.push(textShape(12, 82, 221, 1080, 24, `Generated ${report.generatedAt}. The source snapshot contains ${report.agreements.length} agreement rows and ${report.obligations.length} obligation rows.`, { size: 11, fill: MUTED }));
  scope.push(textShape(13, 56, 320, 520, 28, 'Definitions', { size: 18, fill: INK, bold: true }));
  const definitions = [
    'Risk is the stored playbook level on the agreement record.',
    'Legal review counts agreements in the review or approval stage.',
    'Due dates are sorted from persisted obligation and extracted document records.',
    'Source document text, signatory email addresses and provider envelope tokens are excluded from exports.',
    report.ai?.status === 'generated' ? `AI narrative is advisory only (${report.ai.model ?? 'GCP Gemini'}); evidence IDs remain linked to the supplied rows.` : 'Narrative findings use deterministic rules because no report AI provider is enabled.',
  ];
  definitions.forEach((item, i) => {
    scope.push(textShape(20 + i * 2, 72, 366 + i * 48, 1080, 30, `- ${item}`, { size: 13, fill: '344255' }));
  });
  scope.push(textShape(30, 56, 590, 1080, 24, 'The findings are decision support. Counsel remains responsible for legal conclusions and approvals.', { size: 12, fill: MUTED, bold: true }));
  scope.push(...footer(50, report, 6));
  slides.push(slideXml(scope));
  return slides;
}

function contentTypes(count: number): string {
  const slides = Array.from({ length: count }, (_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/><Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/><Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>${slides}</Types>`;
}

function rootRels(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`;
}

function presentationXml(count: number): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${Array.from({ length: count }, (_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('')}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle><a:defPPr/></p:defaultTextStyle></p:presentation>`;
}

function presentationRels(count: number): string {
  const slides = Array.from({ length: count }, (_, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slides}</Relationships>`;
}

function slideRels(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`;
}

function masterRels(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`;
}

function layoutRels(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`;
}

function masterXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld name="Concord Master"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/></p:sldMaster>`;
}

function layoutXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
}

function themeXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Concord"><a:themeElements><a:clrScheme name="Concord"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="172333"/></a:dk2><a:lt2><a:srgbClr val="F7F9FC"/></a:lt2><a:accent1><a:srgbClr val="F4C76B"/></a:accent1><a:accent2><a:srgbClr val="4F86B4"/></a:accent2><a:accent3><a:srgbClr val="C64A4A"/></a:accent3><a:accent4><a:srgbClr val="3E7C5A"/></a:accent4><a:accent5><a:srgbClr val="D58A20"/></a:accent5><a:accent6><a:srgbClr val="637184"/></a:accent6><a:hlink><a:srgbClr val="4F86B4"/></a:hlink><a:folHlink><a:srgbClr val="C64A4A"/></a:folHlink></a:clrScheme><a:fontScheme name="Concord"><a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/></a:minorFont></a:fontScheme><a:fmtScheme name="Concord"><a:fillStyleLst><a:solidFill><a:srgbClr val="F7F9FC"/></a:solidFill></a:fillStyleLst><a:lnStyleLst/><a:effectStyleLst/><a:bgFillStyleLst/></a:fmtScheme></a:themeElements></a:theme>`;
}

/** Creates a fully editable text-and-shape PPTX without a server-side office dependency. */
export function buildPptx(report: PortfolioReport): Buffer {
  const slides = createSlides(report);
  const entries = [
    { name: '[Content_Types].xml', data: contentTypes(slides.length) },
    { name: '_rels/.rels', data: rootRels() },
    { name: 'ppt/presentation.xml', data: presentationXml(slides.length) },
    { name: 'ppt/_rels/presentation.xml.rels', data: presentationRels(slides.length) },
    { name: 'ppt/slideMasters/slideMaster1.xml', data: masterXml() },
    { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: masterRels() },
    { name: 'ppt/slideLayouts/slideLayout1.xml', data: layoutXml() },
    { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: layoutRels() },
    { name: 'ppt/theme/theme1.xml', data: themeXml() },
    { name: 'ppt/presProps.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presProps xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>' },
    { name: 'ppt/viewProps.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:viewPr xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" lastView="sldView"><p:normalViewPr/></p:viewPr>' },
    { name: 'ppt/tableStyles.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def=""/>' },
    ...slides.flatMap((slide, i) => [
      { name: `ppt/slides/slide${i + 1}.xml`, data: slide },
      { name: `ppt/slides/_rels/slide${i + 1}.xml.rels`, data: slideRels() },
    ]),
  ];
  return zip(entries);
}
