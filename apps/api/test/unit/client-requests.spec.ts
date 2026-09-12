import { randomUUID } from 'crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { can, normalizeRole, requestReturnPath, resolveRole } from '@concord/shared';
import { CreateClientRequestDto } from '../../src/client-requests/client-request.dto';
import { ClientRequestsService, validateTermDates } from '../../src/client-requests/client-requests.service';
import { escapeEmail } from '../../src/client-requests/request-inbox.service';

const input = (): CreateClientRequestDto => ({ submissionKey: randomUUID(), title: 'Equipment supply', counterparty: 'UAT Supplier', businessUnit: 'Procurement', contractType: 'Vendor Agreement', assignedLegalUserId: 'lawyer', requestedByDate: '2026-10-01', urgency: 'standard', terms: { scope: 'Supply ten salon chairs.', currency: 'INR', dataInvolved: 'none' } });
const errors = (dto: unknown) => validate(plainToInstance(CreateClientRequestDto, dto), { whitelist: true, forbidNonWhitelisted: true });
describe('Department request input and boundaries', () => {
  it('recognises the department role without portfolio or legal-workflow rights', () => {
    expect(normalizeRole('Concord.Requester')).toBe('requester'); expect(resolveRole(['Concord.Requester'])).toBe('requester');
    expect(can('requester', 'request:write')).toBe(true);
    for (const permission of ['contract:read', 'contract:write', 'audit:read', 'admin', 'request:manage', 'approve', 'esign:send'] as const) expect(can('requester', permission)).toBe(false);
  });
  it.each(['/requests', '/requests/new', '/requests/INT-2026-001', '/inbox'])('preserves safe login destination %s', p => expect(requestReturnPath(p)).toBe(p));
  it.each(['//evil.test', '/\\evil.test', '/requests/../api/auth', '/requests?next=https://evil.test', 'https://evil.test', '/requests/%2f%2fevil.test', '/requests/new\n', undefined])('rejects unsafe login destination %p', p => expect(requestReturnPath(p)).toBeUndefined());
  it('accepts a valid term sheet', async () => { expect(await errors(input())).toEqual([]); expect(() => validateTermDates(input())).not.toThrow(); });
  it.each([
    { terms: undefined }, { terms: null }, { terms: { currency: 'INR', scope: ' ', dataInvolved: 'none' } },
    { requesterId: 'someone-else' }, { assignedLegalUserId: '' }, { contractType: 'unknown' }, { title: ' ' }, { submissionKey: 'not-a-uuid' },
  ])('rejects incomplete or forged input %p', async patch => { expect((await errors({ ...input(), ...patch })).length).toBeGreaterThan(0); });
  it.each(['-1', 'NaN', '1e8', '120.001', '1000000000000'])('rejects malformed value %s', async amount => { const dto = input(); dto.terms.amount = amount; expect((await errors(dto)).length).toBeGreaterThan(0); });
  it.each(['2026-02-30', '2026-13-01', '2026-09-00', 'bad-date'])('rejects invalid calendar date %s', date => { const dto = input(); dto.requestedByDate = date; expect(() => validateTermDates(dto)).toThrow(); });
  it('requires payment terms for a positive value and rejects reversed dates', () => {
    const dto = input(); dto.terms.amount = '25000'; expect(() => validateTermDates(dto)).toThrow('payment terms'); dto.terms.paymentTerms = '30 days';
    dto.terms.startDate = '2026-10-10'; dto.terms.endDate = '2026-10-01'; expect(() => validateTermDates(dto)).toThrow('end date');
  });
  it('fails safely when there is no durable database', async () => {
    const service = new ClientRequestsService({ enabled: false } as any, {} as any, {} as any);
    await expect(service.create(input(), { id: 'client', name: 'Client', email: 'client@example.test', role: 'requester' })).rejects.toThrow('database');
  });
  it('escapes untrusted text in Outlook HTML', () => expect(escapeEmail('<img src="x" onerror=\'alert(1)\'>&')).toBe('&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;&gt;&amp;'));
});
