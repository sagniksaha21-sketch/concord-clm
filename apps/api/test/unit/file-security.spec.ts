import { FileSecurityService } from '../../src/security/file-security.service';

const svc = new FileSecurityService();

const pdf = Buffer.from('%PDF-1.7\n...rest of a pdf...');
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const exe = Buffer.concat([Buffer.from([0x4d, 0x5a]), Buffer.from('this is really an executable')]);
const withNul = Buffer.from([0x54, 0x00, 0x65, 0x78, 0x74]); // T\0ext
const text = Buffer.from('This Master Services Agreement is dated 2026-01-01 between A and B.');

describe('Document upload security (H2)', () => {
  it('sniffs real content type from magic bytes, not the extension', () => {
    expect(svc.detectType(pdf)).toBe('application/pdf');
    expect(svc.detectType(png)).toBe('image/png');
    expect(svc.detectType(exe)).toBe('application/x-msdownload');
    expect(svc.detectType(withNul)).toBe('application/octet-stream');
    expect(svc.detectType(text)).toBe('text/plain');
  });

  it('quarantines an executable disguised as a PDF', async () => {
    const v = await svc.check({ originalname: 'contract.pdf', buffer: exe, mimetype: 'application/pdf' });
    expect(v.ok).toBe(false);
    expect(v.detectedType).toBe('application/x-msdownload');
    expect(v.reason).toBeTruthy();
  });

  it('rejects oversize uploads', async () => {
    const prev = process.env.UPLOAD_MAX_BYTES;
    process.env.UPLOAD_MAX_BYTES = '10';
    const v = await svc.check({ originalname: 'big.txt', buffer: Buffer.from('way more than ten bytes') });
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/exceeds/i);
    process.env.UPLOAD_MAX_BYTES = prev;
  });

  it('accepts a legitimate text/PDF document', async () => {
    const v = await svc.check({ originalname: 'msa.txt', buffer: text, mimetype: 'text/plain' });
    expect(v.ok).toBe(true);
    expect(v.detectedType).toBe('text/plain');
  });
});

/**
 * The malware scan used to be a seam with the real HTTP call COMMENTED OUT.
 * With no endpoint set it returned `unscanned`, which is honest. With an
 * endpoint set it *still* returned `unscanned` — engine `'seam'` — having
 * contacted nothing, logged nothing and thrown nothing.
 *
 * That is the worst shape a security control can take: an operator sets
 * MALWARE_SCAN_URL, sees clean boots and successful uploads, and concludes
 * scanning is on. It is off, and the absence is invisible precisely because the
 * control reports itself as present.
 *
 * These tests stand a real HTTP server up and pin all four outcomes.
 */
describe('Malware scanning actually contacts the scanner', () => {
  const http = require('node:http');
  const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(256, 0x20)]);
  const file = { originalname: 'msa.pdf', buffer: pdf, mimetype: 'application/pdf' };
  const ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ENV };
  });

  async function withScanner(
    handler: (req: any, res: any) => void,
    run: (url: string) => Promise<void>,
  ) {
    const srv = http.createServer(handler);
    await new Promise<void>((r) => srv.listen(0, r));
    const url = `http://127.0.0.1:${srv.address().port}/scan`;
    try {
      await run(url);
    } finally {
      srv.close();
    }
  }

  it('reports clean only when the scanner says so', async () => {
    const svc = new FileSecurityService();
    let hits = 0;
    await withScanner(
      (_q: any, s: any) => {
        hits += 1;
        s.end('{"clean":true}');
      },
      async (url) => {
        process.env.MALWARE_SCAN_URL = url;
        const v = await svc.check(file as any);
        expect(v.ok).toBe(true);
        expect(v.scan).toBe('clean');
      },
    );
    // The assertion that would have caught the original bug: the scanner was
    // actually contacted. A stub returns 'unscanned' without ever hitting this.
    expect(hits).toBe(1);
  });

  it('quarantines what the scanner calls infected', async () => {
    const svc = new FileSecurityService();
    await withScanner(
      (_q: any, s: any) => s.end('{"malware":true}'),
      async (url) => {
        process.env.MALWARE_SCAN_URL = url;
        const v = await svc.check(file as any);
        expect(v.ok).toBe(false);
        expect(v.scan).toBe('infected');
        expect(v.reason).toMatch(/malware/i);
      },
    );
  });

  it('never downgrades an unreachable scanner to a pass', async () => {
    const svc = new FileSecurityService();
    process.env.MALWARE_SCAN_URL = 'http://127.0.0.1:1/scan';
    const v = await svc.check(file as any);
    expect(v.scan).toBe('unscanned');
    // 'error', not 'none' and not 'seam' — the distinction is what tells an
    // operator that a configured scanner failed rather than being absent.
    expect(v.scanEngine).toBe('error');
  });

  it('does not guess "clean" from a verdict it cannot parse', async () => {
    const svc = new FileSecurityService();
    await withScanner(
      (_q: any, s: any) => s.end('something unexpected'),
      async (url) => {
        process.env.MALWARE_SCAN_URL = url;
        const v = await svc.check(file as any);
        expect(v.scan).toBe('unscanned');
        expect(v.scanEngine).toBe('error');
      },
    );
  });

  it('is honest when no scanner is configured at all', async () => {
    const svc = new FileSecurityService();
    delete process.env.MALWARE_SCAN_URL;
    delete process.env.CLAMAV_HOST;
    const v = await svc.check(file as any);
    expect(v.scan).toBe('unscanned');
    expect(v.scanEngine).toBe('none');
  });
});

/**
 * Production must not run in a state where scanning is half-configured.
 */
describe('Boot guard on the scanning configuration', () => {
  const ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...ENV };
  });

  function errorsAbout(re: RegExp): string[] {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { inspectSecurityConfig } = require('../../src/security/security.config');
    return inspectSecurityConfig()
      .filter((i: any) => i.level === 'error' && re.test(i.message))
      .map((i: any) => i.message);
  }

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_JWT_SECRET = 'V9x2Lm7Qr4Ts8Wz1Bn6Kd3Hj5Pf0Ac';
    delete process.env.MALWARE_SCAN_URL;
    delete process.env.CLAMAV_HOST;
    delete process.env.UPLOAD_REQUIRE_SCAN;
  });

  it('refuses UPLOAD_REQUIRE_SCAN=true with no scanner (every upload would quarantine)', () => {
    process.env.UPLOAD_REQUIRE_SCAN = 'true';
    expect(errorsAbout(/UPLOAD_REQUIRE_SCAN=true but neither/)).toHaveLength(1);
  });

  it('refuses a configured scanner whose verdict is not enforced', () => {
    process.env.MALWARE_SCAN_URL = 'https://scan.internal/scan';
    expect(errorsAbout(/configured but UPLOAD_REQUIRE_SCAN is not true/)).toHaveLength(1);
  });

  it('accepts the one coherent production configuration', () => {
    process.env.MALWARE_SCAN_URL = 'https://scan.internal/scan';
    process.env.UPLOAD_REQUIRE_SCAN = 'true';
    expect(errorsAbout(/malware scanner|MALWARE_SCAN_URL|CLAMAV_HOST|UPLOAD_REQUIRE_SCAN/i)).toHaveLength(0);
  });
});
