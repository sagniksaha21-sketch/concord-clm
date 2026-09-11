import { DEFAULT_REPORT_OPTIONS, PortfolioReport, REPORT_FOCUSES, REPORT_THEMES } from '@concord/shared';

export function xml(value: unknown): string {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

const emu = (px: number) => Math.round(px * 9525);
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';

/** Conservative line wrapping keeps exported text editable without shrinking it. */
function wrap(value: string, columns: number): string {
  return String(value).split('\n').flatMap((paragraph) => {
    const lines: string[] = [];
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const chunks = word.match(new RegExp(`.{1,${columns}}`, 'gu')) ?? [''];
      for (const chunk of chunks) {
        if (line && line.length + chunk.length + 1 > columns) { lines.push(line); line = ''; }
        line += (line ? ' ' : '') + chunk;
      }
    }
    lines.push(line);
    return lines;
  }).join('\n');
}

const short = (value: string, max: number) => value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;

export function createSlides(report: PortfolioReport): string[] {
  const options = { ...DEFAULT_REPORT_OPTIONS, ...report.options };
  const t = REPORT_THEMES[options.theme];
  const focus = REPORT_FOCUSES[options.focus];
  const slides: string[] = [];
  let shapeId = 10;

  const text = (x: number, y: number, w: number, h: number, value: string, size = 16, fill: string = t.ink, bold = false, font = 'Aptos', align = 'l') => {
    const id = shapeId++;
    const paragraphs = value.split('\n').map((line) => `<a:p><a:pPr algn="${align}"><a:lnSpc><a:spcPct val="112000"/></a:lnSpc></a:pPr><a:r><a:rPr lang="en-US" sz="${Math.round(size * 100)}"${bold ? ' b="1"' : ''}><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill><a:latin typeface="${xml(font)}"/></a:rPr><a:t>${xml(line)}</a:t></a:r><a:endParaRPr sz="${Math.round(size * 100)}"/></a:p>`).join('');
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xml(short(value.replace(/\n/g, ' '), 90))}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"/><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`;
  };
  const rect = (x: number, y: number, w: number, h: number, fill: string) => {
    const id = shapeId++;
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Rule ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`;
  };
  const footer = () => [
    rect(64, 672, 1152, 1, t.line),
    text(64, 686, 500, 20, 'Concord  /  Lakmē Legal for Lakmē Lever', 9, t.secondary),
    text(900, 686, 316, 20, `${report.sampleData ? 'Illustrative' : 'Portfolio report'}   /   ${String(slides.length + 1).padStart(2, '0')}`, 9, t.secondary, false, 'Aptos', 'r'),
  ];
  const add = (title: string | null, subtitle: string, content: string[]) => {
    const header = title ? [
      text(64, 42, 1050, 52, title, 30, t.ink, true, 'Aptos Display'),
      text(65, 103, 1120, 30, subtitle, 12, t.secondary),
      rect(64, 144, 1152, 1, t.line), rect(64, 144, 72, 2, t.gold),
    ] : [];
    slides.push(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld ${NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${t.background}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${[...header, ...content, ...footer()].join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`);
  };
  const narrativeStatus = report.ai?.status === 'generated'
    ? 'AI-assisted observations. Source metrics remain authoritative.'
    : options.prompt
      ? `Custom AI brief not applied. ${report.ai?.status === 'fallback' ? 'Provider unavailable.' : 'Report AI is not connected.'}`
      : 'Findings calculated from the selected records.';

  add(null, '', [
    rect(64, 66, 1152, 2, t.gold),
    text(64, 98, 820, 60, 'Concord', 32, t.gold, false, 'Georgia'),
    text(66, 183, 920, 28, 'LEGAL OPERATIONS  /  PORTFOLIO REPORT', 11, t.secondary, true),
    text(64, 248, 900, 150, wrap(focus.title, 28), 46, t.ink, false, 'Georgia'),
    text(67, 420, 870, 68, wrap(short(report.selectionSummary ?? focus.label, 155), 75), 17, t.secondary),
    text(67, 538, 900, 26, report.sampleData ? 'ILLUSTRATIVE SAMPLE RECORDS' : 'LIVE PERSISTED AGREEMENT RECORDS', 11, t.gold, true),
    text(67, 578, 960, 48, wrap(`${report.generatedAt.slice(0, 10)}. ${narrativeStatus}`, 105), 11, t.secondary),
    rect(1020, 250, 1, 202, t.line),
    text(1050, 270, 158, 100, String(report.agreements.length), 52, t.gold, false, 'Georgia'),
    text(1052, 377, 154, 54, 'agreements\nin scope', 13, t.secondary),
  ]);

  const summary: string[] = [];
  report.metrics.slice(0, 5).forEach((metric, index) => {
    const x = 64 + index * 232;
    summary.push(text(x, 188, 205, 50, wrap(metric.label.toUpperCase(), 23), 10.5, t.secondary, true));
    summary.push(text(x, 258, 205, 78, metric.displayValue, 40, t.gold, false, 'Georgia'));
    summary.push(rect(x, 349, 200, 1, t.line));
    summary.push(text(x, 366, 205, 72, wrap(metric.detail ?? '', 24), 12, t.secondary));
  });
  summary.push(text(64, 480, 1152, 26, report.ai?.status === 'generated' ? 'Executive perspective' : 'Report focus', 14, t.gold, true));
  summary.push(text(64, 525, 1110, 117, wrap(short(report.ai?.summary ?? report.selectionSummary ?? focus.label, 360), 98), 18, t.ink));
  add('Portfolio at a glance', `${report.agreements.length} agreement rows selected from ${report.availableAgreements ?? report.agreements.length} available. ${report.sampleData ? 'Sample data.' : 'Current records.'}`, summary);

  // Every observation receives a readable slide, with its complete evidence IDs.
  report.insights.forEach((insight, index) => {
    const accent = insight.tone === 'risk' ? t.risk : insight.tone === 'watch' ? t.watch : t.gold;
    const ids = insight.evidenceIds?.join(', ') || 'Calculated from the report metrics and selected records.';
    const title = wrap(insight.title, 64);
    const titleHeight = title.split('\n').length * 39;
    const bodyTop = Math.max(306, 191 + titleHeight + 22);
    const bodyLines = wrap(insight.body, 100).split('\n');
    const perSlide = Math.max(3, Math.floor((564 - bodyTop) / 24));
    for (let offset = 0; offset < bodyLines.length; offset += perSlide) {
      add(`Insight ${String(index + 1).padStart(2, '0')}${offset ? ' continued' : ''}`, insight.source === 'ai' ? 'AI-assisted observation for review' : 'Calculated portfolio finding', [
      rect(64, 185, 4, 384, accent),
      text(94, 181, 1085, titleHeight + 8, title, 26, t.ink, true, 'Aptos Display'),
      text(94, bodyTop, 1070, 564 - bodyTop, bodyLines.slice(offset, offset + perSlide).join('\n'), 16, t.secondary),
      text(94, 583, 1070, 18, 'SUPPORTING RECORDS', 9, t.gold, true),
      text(94, 610, 1070, 50, wrap(ids, 135), 10, t.secondary),
    ]);
    }
  });

  const mix: string[] = [text(64, 184, 620, 30, 'Lifecycle stage', 18, t.ink, true), text(865, 184, 340, 30, 'Playbook risk', 18, t.ink, true)];
  const max = Math.max(1, ...report.stageCounts.map((s) => s.count));
  report.stageCounts.forEach((stage, i) => {
    const y = 246 + i * 50;
    mix.push(text(64, y, 150, 24, stage.label, 13, t.secondary));
    mix.push(rect(223, y + 5, 453, 14, t.inset));
    if (stage.count) mix.push(rect(223, y + 5, 453 * stage.count / max, 14, t.gold));
    mix.push(text(696, y, 58, 25, String(stage.count), 14, t.ink, true, 'Aptos', 'r'));
  });
  (['high', 'medium', 'low'] as const).forEach((risk, i) => {
    const y = 245 + i * 112;
    mix.push(text(865, y, 260, 26, risk.toUpperCase(), 11, t.secondary, true));
    mix.push(text(865, y + 34, 260, 52, String(report.risk[risk]), 31, risk === 'high' ? t.risk : t.gold, false, 'Georgia'));
    mix.push(rect(865, y + 97, 326, 1, t.line));
  });
  add('Lifecycle & risk', 'Counts reflect the selected agreement scope.', mix);

  const watch = [text(64, 185, 800, 23, 'AGREEMENT / COUNTERPARTY', 10, t.secondary, true), text(884, 185, 130, 23, 'RISK', 10, t.secondary, true), text(1068, 185, 140, 23, 'NEXT DUE', 10, t.secondary, true)];
  report.agreements.slice(0, 6).forEach((row, i) => {
    const y = 237 + i * 65;
    watch.push(text(64, y, 780, 28, short(row.title, 68), 15, t.ink, true));
    watch.push(text(64, y + 32, 780, 23, short(`${row.counterparty}  /  ${row.stage}  /  ${row.id}`, 110), 11, t.secondary));
    watch.push(text(884, y + 5, 136, 26, row.risk.toUpperCase(), 12, row.risk === 'high' ? t.risk : row.risk === 'medium' ? t.watch : t.low, true));
    watch.push(text(1068, y + 5, 140, 26, row.nextDueDate ?? 'No key date', 11, t.secondary));
    watch.push(rect(64, y + 59, 1152, 1, t.line));
  });
  if (!report.agreements.length) watch.push(text(64, 270, 1120, 70, 'No agreements match this selection.', 23, t.secondary));
  add('Priority agreements', `Showing ${Math.min(6, report.agreements.length)} of ${report.agreements.length} selected agreements, ordered by risk. The Excel register includes every row.`, watch);

  const commitments: string[] = [];
  report.obligations.slice(0, 6).forEach((row, i) => {
    const y = 205 + i * 65;
    commitments.push(text(64, y, 585, 25, short(row.title, 56), 14, t.ink, true));
    commitments.push(text(64, y + 31, 585, 25, short(`${row.contractTitle}  /  ${row.status}`, 82), 10.5, t.secondary));
    commitments.push(text(662, y + 6, 150, 25, row.dueDate, 12, row.risk === 'high' ? t.risk : t.gold));
    commitments.push(rect(64, y + 59, 748, 1, t.line));
  });
  if (!report.obligations.length) commitments.push(text(64, 235, 700, 70, 'No obligations match this selection.', 21, t.secondary));
  const sigRestricted = report.restricted.includes('signatures');
  const pending = report.signatures.filter((row) => ['sent', 'viewed', 'partially-signed'].includes(row.status)).length;
  commitments.push(rect(868, 205, 1, 380, t.line), text(904, 205, 300, 30, 'SIGNATURE QUEUE', 11, t.secondary, true));
  commitments.push(text(904, 262, 300, 84, sigRestricted ? 'Restricted' : String(pending), sigRestricted ? 25 : 48, t.gold, false, 'Georgia'));
  commitments.push(text(904, 375, 290, 168, wrap(sigRestricted ? 'Execution detail is unavailable for this role or source.' : 'Open requests awaiting completion by the required signatories.', 27), 15, t.secondary));
  add('Commitments & execution', `Showing ${Math.min(6, report.obligations.length)} of ${report.obligations.length} selected obligations, ordered by recorded due date.`, commitments);

  if (options.prompt) {
    const lines = wrap(options.prompt, 98).split('\n');
    for (let offset = 0; offset < lines.length; offset += 17) {
      add(`Your reporting brief${offset ? ' continued' : ''}`, narrativeStatus, [
        text(64, 186, 1140, 450, lines.slice(offset, offset + 17).join('\n'), 16, t.ink),
      ]);
    }
  }
  add('Scope & evidence', 'The basis for this report and its observations.', [
    text(64, 184, 1120, 36, report.sampleData ? 'Illustrative sample records' : 'Live persisted records', 23, t.gold, false, 'Georgia'),
    text(64, 242, 1120, 68, wrap(short(report.selectionSummary ?? focus.label, 200), 100), 15, t.ink),
    text(64, 332, 1120, 52, `Generated ${report.generatedAt.slice(0, 19).replace('T', ' ')} UTC.\n${report.agreements.length} agreements and ${report.obligations.length} obligations in this selection.`, 13, t.secondary),
    text(64, 410, 1120, 142, wrap('Risk follows the stored playbook level. Review covers review and approval stages. Dates come from recorded obligations. Lists show priorities, while Excel contains every selected row. Raw contract text and provider credentials are excluded.', 110), 14, t.secondary),
    text(64, 567, 1120, 65, wrap(narrativeStatus, 115), 12, t.gold, true),
    text(64, 638, 1120, 20, report.ai?.status === 'generated' ? `Model: ${report.ai.model ?? 'configured AI provider'}. Observations are advisory and require review.` : 'Narrative findings use transparent portfolio rules.', 10, t.secondary),
  ]);
  return slides;
}
