import type { PortfolioReport } from '@concord/shared';
import { zip } from './zip';

type Cell = string | number | null | undefined;

function xml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function columnName(index: number): string {
  let n = index + 1;
  let out = '';
  while (n) {
    const remainder = (n - 1) % 26;
    out = String.fromCharCode(65 + remainder) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function cell(ref: string, value: Cell, style = 0): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

function worksheet(rows: Cell[][], widths: number[]): string {
  const maxCol = Math.max(1, ...rows.map((row) => row.length));
  const maxRow = Math.max(1, rows.length);
  const dimension = `A1:${columnName(maxCol - 1)}${maxRow}`;
  const cols = widths.length
    ? `<cols>${widths.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const body = rows.map((row, rowIndex) => {
    const headerRow = rowIndex > 1 && ['Metric', 'Insights', 'Stage', 'Risk', 'ID'].includes(String(row[0] ?? ''));
    const style = rowIndex === 0 ? 1 : rowIndex === 1 ? 5 : headerRow ? 2 : 0;
    const cells = row.map((value, colIndex) => cell(`${columnName(colIndex)}${rowIndex + 1}`, value, style)).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="${dimension}"/>${cols}
  <sheetViews><sheetView workbookViewId="0" showGridLines="0"><selection activeCell="A1" sqref="A1"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="19"/>
  <sheetData>${body}</sheetData>
  <pageMargins left="0.35" right="0.35" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
</worksheet>`;
}

function styles(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="165" formatCode="yyyy-mm-dd"/></numFmts>
  <fonts count="2"><font><sz val="10"/><name val="Aptos"/></font><font><b/><sz val="11"/><name val="Aptos Display"/></font></fonts>
  <fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF4C76B"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE9EEF4"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="2"><border/><border><left style="thin"><color rgb="FFDDE4EC"/></left><right style="thin"><color rgb="FFDDE4EC"/></right><top style="thin"><color rgb="FFDDE4EC"/></top><bottom style="thin"><color rgb="FFDDE4EC"/></bottom></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="6">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyBorder="1"/>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="0" applyFill="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function agreementRows(report: PortfolioReport): Cell[][] {
  return [
    ['Agreement register', ''],
    ['Risk first, then title. Source text is not included in this export.', ''],
    ['ID', 'Agreement', 'Counterparty', 'Type', 'Value', 'Stage', 'Risk', 'Version', 'Source', 'Obligations', 'Next due', 'Signature'],
    ...report.agreements.map((row) => [
      row.id, row.title, row.counterparty, row.type, row.valueDisplay, row.stage, row.risk,
      row.version, row.source, row.obligationCount, row.nextDueDate ?? '', row.signatureStatus ?? 'Restricted',
    ]),
  ];
}

function obligationRows(report: PortfolioReport): Cell[][] {
  return [
    ['Obligation register', ''],
    ['Key dates derived from persisted obligation and document records.', ''],
    ['ID', 'Agreement', 'Title', 'Due date', 'Status', 'Type', 'Risk', 'Owner'],
    ...report.obligations.map((row) => [row.id, row.contractTitle, row.title, row.dueDate, row.status, row.type, row.risk, row.ownerEmail]),
  ];
}

function signatureRows(report: PortfolioReport): Cell[][] {
  if (!report.signatures.length && report.restricted.includes('signatures')) {
    return [['Signature register', ''], ['Signature detail is restricted by the current role.', '']];
  }
  return [
    ['Signature register', ''],
    ['Provider envelope identifiers and signatory emails are intentionally omitted.', ''],
    ['ID', 'Agreement', 'Status', 'Provider', 'Signatories', 'Created', 'Completed'],
    ...report.signatures.map((row) => [row.id, row.contractTitle, row.status, row.provider, row.signatoryCount, row.createdAt, row.completedAt ?? '']),
  ];
}

/** Creates a compact OOXML workbook with overview, register and evidence tabs. */
export function buildXlsx(report: PortfolioReport): Buffer {
  const overview: Cell[][] = [
    ['Concord Portfolio Report', ''],
    ['Generated', report.generatedAt],
    ['Data mode', report.dataMode === 'live' ? 'Live persisted records' : 'Illustrative fixtures'],
    ['AI narrative', report.ai?.status === 'generated' ? `Generated (${report.ai.model ?? 'GCP'})` : report.ai?.status === 'fallback' ? 'Deterministic fallback (AI unavailable)' : 'Deterministic rules'],
    ['Scope', 'All agreements visible to the signed-in role'],
    ['', ''],
    ['Metric', 'Value', 'Definition'],
    ...report.metrics.map((metric) => [metric.label, metric.value, metric.detail ?? '']),
    ['', ''],
    ['Insights', 'Finding', 'Tone', 'Source', 'Evidence'],
    ...report.insights.map((insight) => [insight.title, insight.body, insight.tone, insight.source === 'ai' ? 'AI-assisted' : 'Rules', insight.evidenceIds?.join(', ') ?? '']),
    ['', ''],
    ['Stage', 'Agreements'],
    ...report.stageCounts.map((stage) => [stage.label, stage.count]),
    ['', ''],
    ['Risk', 'Agreements'],
    ['Low', report.risk.low],
    ['Medium', report.risk.medium],
    ['High', report.risk.high],
  ];

  const entries = [
    { name: '[Content_Types].xml', data: contentTypes(4) },
    { name: '_rels/.rels', data: rootRels() },
    { name: 'docProps/core.xml', data: coreProps(report.generatedAt) },
    { name: 'docProps/app.xml', data: appProps(['Overview', 'Agreements', 'Obligations', 'Signatures']) },
    { name: 'xl/workbook.xml', data: workbookXml(['Overview', 'Agreements', 'Obligations', 'Signatures']) },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRels(4) },
    { name: 'xl/styles.xml', data: styles() },
    { name: 'xl/worksheets/sheet1.xml', data: worksheet(overview, [34, 82, 28, 18, 34]) },
    { name: 'xl/worksheets/sheet2.xml', data: worksheet(agreementRows(report), [18, 34, 26, 18, 16, 14, 11, 11, 22, 12, 14, 17]) },
    { name: 'xl/worksheets/sheet3.xml', data: worksheet(obligationRows(report), [20, 30, 38, 14, 14, 14, 10, 30]) },
    { name: 'xl/worksheets/sheet4.xml', data: worksheet(signatureRows(report), [24, 30, 18, 16, 12, 24, 24]) },
  ];
  return zip(entries);
}

function contentTypes(sheetCount: number): string {
  const overrides = Array.from({ length: sheetCount }, (_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${overrides}
</Types>`;
}

function rootRels(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
}

function coreProps(date: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"><dc:title>Concord Portfolio Report</dc:title><dc:creator>Concord</dc:creator><dcterms:created>${xml(date)}</dcterms:created><dcterms:modified>${xml(date)}</dcterms:modified></cp:coreProperties>`;
}

function appProps(names: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Concord</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><HeadingPairs><vt:vector xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes" size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>${names.length}</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><vt:vector size="${names.length}" baseType="lpstr">${names.map((name) => `<vt:lpstr>${xml(name)}</vt:lpstr>`).join('')}</vt:vector></TitlesOfParts></Properties>`;
}

function workbookXml(names: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><fileVersion appName="xl" lastEdited="7"/><workbookPr defaultThemeVersion="124226"/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews><sheets>${names.map((name, i) => `<sheet name="${xml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;
}

function workbookRels(count: number): string {
  const sheets = Array.from({ length: count }, (_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets}<Relationship Id="rId${count + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}
