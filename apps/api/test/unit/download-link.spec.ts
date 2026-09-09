import { DownloadLinkService } from '../../src/security/download-link.service';

const svc = new DownloadLinkService();

describe('Signed short-lived download links (H2)', () => {
  it('accepts a valid, unexpired, correctly-signed link', () => {
    const { exp, token } = svc.sign('esign-archive:ARC-1');
    expect(svc.verify('esign-archive:ARC-1', exp, token).valid).toBe(true);
  });

  it('rejects a tampered signature', () => {
    const { exp, token } = svc.sign('esign-archive:ARC-1');
    expect(svc.verify('esign-archive:ARC-1', exp, token + 'ff').valid).toBe(false);
    // wrong resource id must also fail
    expect(svc.verify('esign-archive:OTHER', exp, token).valid).toBe(false);
  });

  it('rejects an expired link', () => {
    const { exp, token } = svc.sign('esign-archive:ARC-1', -10); // already expired
    const v = svc.verify('esign-archive:ARC-1', exp, token);
    expect(v.valid).toBe(false);
    expect(v.reason).toMatch(/expired/i);
  });
});
