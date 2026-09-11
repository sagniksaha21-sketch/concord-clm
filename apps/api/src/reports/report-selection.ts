import { BadRequestException } from '@nestjs/common';
import { Contract, Obligation, SignatureRequest, ReportOptions, DEFAULT_REPORT_OPTIONS, REPORT_FOCUSES, REPORT_THEMES } from '@concord/shared';

export function normalizeReportOptions(input: ReportOptions = {}): Required<ReportOptions> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Invalid report options');
  const options = { ...DEFAULT_REPORT_OPTIONS, ...Object.fromEntries(Object.entries(input).filter(([, value]) => value != null)) };
  if (!Object.prototype.hasOwnProperty.call(REPORT_THEMES, options.theme) ||
      !Object.prototype.hasOwnProperty.call(REPORT_FOCUSES, options.focus) ||
      typeof options.prompt !== 'string' || options.prompt.length > 1500 ||
      typeof options.query !== 'string' || options.query.length > 160 ||
      !Number.isInteger(options.horizonDays) || options.horizonDays < 1 || options.horizonDays > 365) {
    throw new BadRequestException('Choose a valid report theme, focus and date horizon. The brief may contain up to 1,500 characters.');
  }
  return { ...options, prompt: options.prompt.trim(), query: options.query.trim() };
}

/** Filters authorised records before metrics, AI or exports can read them. */
export function selectReportRows(
  records: { contracts: Contract[]; obligations: Obligation[]; signatures: SignatureRequest[] },
  options: Required<ReportOptions>,
  asOf: string,
) {
  const query = options.query.toLocaleLowerCase();
  let contracts = records.contracts.filter((row) => !query ||
    [row.title, row.counterparty, row.type].some((value) => String(value).toLocaleLowerCase().includes(query)));
  let ids = new Set(contracts.map((row) => row.id));
  let obligations = records.obligations.filter((row) => !query || ids.has(row.contractId));
  let signatures = records.signatures.filter((row) => !query || ids.has(row.contractId));

  if (options.focus === 'risk') contracts = contracts.filter((row) => row.risk === 'high');
  if (options.focus === 'approvals') contracts = contracts.filter((row) => ['review', 'approval'].includes(row.stage));
  if (options.focus === 'renewals') {
    const cutoff = Date.parse(asOf.slice(0, 10)) + options.horizonDays * 86_400_000;
    obligations = obligations.filter((row) => Date.parse(row.dueDate.slice(0, 10)) <= cutoff);
    const dueIds = new Set(obligations.map((row) => row.contractId));
    contracts = contracts.filter((row) => dueIds.has(row.id));
  }
  if (options.focus === 'signatures') {
    signatures = signatures.filter((row) => ['sent', 'viewed', 'partially-signed'].includes(row.status));
    const pendingIds = new Set(signatures.map((row) => row.contractId));
    contracts = contracts.filter((row) => pendingIds.has(row.id));
  }
  ids = new Set(contracts.map((row) => row.id));
  if (options.focus !== 'portfolio') {
    if (options.focus !== 'renewals') obligations = obligations.filter((row) => ids.has(row.contractId));
    signatures = signatures.filter((row) => ids.has(row.contractId));
  }
  return { contracts, obligations, signatures };
}

export function describeReportSelection(options: Required<ReportOptions>): string {
  return [REPORT_FOCUSES[options.focus].label,
    options.query ? `Agreement match: ${options.query}` : 'All counterparties',
    options.focus === 'renewals' ? `Overdue and due within ${options.horizonDays} days` : '',
  ].filter(Boolean).join(' · ');
}
