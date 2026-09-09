import { createHmac } from 'crypto';
import { MelentoService } from '../../src/esign/melento.service';

const svc = new MelentoService();
const sign = (secret: string, body: string) =>
  createHmac('sha256', secret).update(body).digest('hex');

describe('E-signature webhook authentication (regression: unauthenticated execution forgery)', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('REJECTS a callback when no webhook secret is configured (fail-closed)', () => {
    delete process.env.MELENTO_WEBHOOK_SECRET;
    // Previously this returned true, letting an unauthenticated caller mark a
    // contract "completed" and mint a sealed certificate nobody signed.
    expect(svc.verifyWebhook(undefined, '{"envelopeId":"X","event":"completed"}')).toBe(false);
    expect(svc.verifyWebhook('deadbeef', '{"envelopeId":"X","event":"completed"}')).toBe(false);
  });

  it('rejects a callback with no signature header even when a secret is set', () => {
    process.env.MELENTO_WEBHOOK_SECRET = 's3cret-hmac-key';
    expect(svc.verifyWebhook(undefined, '{"a":1}')).toBe(false);
  });

  it('rejects a tampered body and a wrong-key signature', () => {
    process.env.MELENTO_WEBHOOK_SECRET = 's3cret-hmac-key';
    const body = '{"envelopeId":"MEL-1","event":"completed"}';
    const good = sign('s3cret-hmac-key', body);
    expect(svc.verifyWebhook(good, '{"envelopeId":"MEL-1","event":"declined"}')).toBe(false);
    expect(svc.verifyWebhook(sign('other-key', body), body)).toBe(false);
  });

  it('accepts a correctly signed callback', () => {
    process.env.MELENTO_WEBHOOK_SECRET = 's3cret-hmac-key';
    const body = '{"envelopeId":"MEL-1","event":"completed"}';
    expect(svc.verifyWebhook(sign('s3cret-hmac-key', body), body)).toBe(true);
  });
});
