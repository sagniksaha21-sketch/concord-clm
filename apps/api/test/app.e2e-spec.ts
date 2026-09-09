import { createHmac } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { AppModule } from '../src/app.module';

const SECRET = process.env.AUTH_JWT_SECRET as string;
const token = (role: string, email = 'user@lakmelever.com') =>
  jwt.sign({ id: 'u-' + role, email, name: role, role }, SECRET, {
    expiresIn: '1h', algorithm: 'HS256', issuer: 'concord-api', audience: 'concord-web',
  });

describe('Concord API (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  it('rejects unauthenticated access with 401', async () => {
    await http().get('/api/contracts').expect(401);
  });

  it('exposes a public liveness health check', async () => {
    const r = await http().get('/api/health').expect(200);
    expect(r.body.status).toBe('ok');
  });

  it('reports readiness with degraded modes surfaced', async () => {
    const r = await http().get('/api/health/ready').expect(200);
    expect(Array.isArray(r.body.degradedModes)).toBe(true);
  });

  it('sets an HttpOnly session cookie on demo login and returns the user from /me', async () => {
    const r = await http()
      .post('/api/auth/login')
      .send({ email: 'concord.admin@example.test', password: 'concord' })
      .expect(201);
    expect(r.body.token).toBeUndefined();
    expect(r.body.user?.email).toBe('concord.admin@example.test');
    const setCookie = r.headers['set-cookie'];
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    const session = cookies.find((c: string | undefined) => c?.startsWith('concord_token='));
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=Lax/i);
    const me = await http()
      .get('/api/auth/me')
      .set('Cookie', String(session).split(';')[0])
      .expect(200);
    expect(me.body.email).toBe('concord.admin@example.test');
  });

  it('enforces RBAC on template creation (lead 201, viewer 403)', async () => {
    const body = { name: 'Test NDA', contractType: 'NDA', description: 'integration test' };
    await http()
      .post('/api/authoring/templates')
      .set('Authorization', `Bearer ${token('Lead – Legal')}`)
      .send(body)
      .expect(201);
    await http()
      .post('/api/authoring/templates')
      .set('Authorization', `Bearer ${token('Viewer')}`)
      .send(body)
      .expect(403);
  });

  it('gates the audit trail (counsel 403, lead 200) and verifies the chain', async () => {
    await http().get('/api/audit').set('Authorization', `Bearer ${token('Board Counsel')}`).expect(403);
    const r = await http().get('/api/audit').set('Authorization', `Bearer ${token('Lead – Legal')}`).expect(200);
    // Paged response (finding C-D5) — the endpoint no longer returns the whole table.
    expect(Array.isArray(r.body.events)).toBe(true);
    expect(typeof r.body.total).toBe('number');
    expect(r.body.events.length).toBeLessThanOrEqual(r.body.limit);
    const v = await http().get('/api/audit/verify').set('Authorization', `Bearer ${token('admin')}`).expect(200);
    expect(v.body.ok).toBe(true);
  });

  it('caps the audit page size and honours offset (unbounded-read regression)', async () => {
    const auth = { Authorization: `Bearer ${token('Lead – Legal')}` };
    const capped = await http().get('/api/audit?limit=999999').set(auth).expect(200);
    expect(capped.body.limit).toBe(1000);
    const page = await http().get('/api/audit?limit=1&offset=1').set(auth).expect(200);
    expect(page.body.offset).toBe(1);
    expect(page.body.events.length).toBeLessThanOrEqual(1);
  });

  it('exposes role management to admins only (SSO approver lockout regression)', async () => {
    // Nobody could approve via SSO because no role claim was ever mapped and
    // there was no way to assign a role except direct SQL.
    await http().get('/api/auth/users').set('Authorization', `Bearer ${token('Lead – Legal')}`).expect(403);
    const r = await http().get('/api/auth/users').set('Authorization', `Bearer ${token('admin')}`).expect(200);
    expect(Array.isArray(r.body)).toBe(true);

    const roles = await http().get('/api/auth/roles').set('Authorization', `Bearer ${token('admin')}`).expect(200);
    expect(roles.body.map((x: any) => x.role)).toEqual(
      expect.arrayContaining(['admin', 'lead', 'counsel', 'approver', 'viewer']),
    );

    // An unknown role is refused rather than silently stored.
    await http()
      .patch('/api/auth/users/concord.admin%40example.test/role')
      .set('Authorization', `Bearer ${token('admin')}`)
      .send({ role: 'superuser' })
      .expect(400);

    // A real assignment succeeds and reports the canonical role.
    const set = await http()
      .patch('/api/auth/users/concord.reviewer%40example.test/role')
      .set('Authorization', `Bearer ${token('admin')}`)
      .send({ role: 'approver' })
      .expect(200);
    expect(set.body.canonicalRole).toBe('approver');
  });

  it('serves the Command Center, pipeline and nav counts to a signed-in user', async () => {
    const auth = { Authorization: `Bearer ${token('Lead – Legal')}` };
    const d = await http().get('/api/dashboard').set(auth).expect(200);
    expect(Array.isArray(d.body.stats)).toBe(true);
    expect(typeof d.body.sampleData).toBe('boolean');

    const p = await http().get('/api/pipeline').set(auth).expect(200);
    expect(Array.isArray(p.body.lanes)).toBe(true);

    const n = await http().get('/api/nav-counts').set(auth).expect(200);
    expect(typeof n.body.obligations).toBe('number');
  });

  it('does NOT leak e-sign envelopes through global search to a viewer', async () => {
    // Search must not become a second route to the envelope ids that were step
    // one of the execution-forgery chain (S-C1).
    const lead = await http()
      .get('/api/search?q=zenoti')
      .set('Authorization', `Bearer ${token('Lead – Legal')}`)
      .expect(200);
    const leadKinds = new Set((lead.body.hits as any[]).map((h) => h.kind));
    expect(leadKinds.has('signature')).toBe(true);

    const viewer = await http()
      .get('/api/search?q=zenoti')
      .set('Authorization', `Bearer ${token('Viewer')}`)
      .expect(200);
    const viewerKinds = new Set((viewer.body.hits as any[]).map((h) => h.kind));
    expect(viewerKinds.has('signature')).toBe(false);
    expect(viewer.body.restricted).toContain('signature');
    expect(JSON.stringify(viewer.body)).not.toMatch(/MEL-ENV/);
  });

  /**
   * The notification history is a VIEW OVER THE AUDIT TRAIL and carries the
   * trail's own permission.
   *
   * It shipped on `contract:read` — which every signed-in role holds — and so
   * handed a read-only viewer the routed approver addresses, signatory
   * addresses and provider envelope ids embedded in the echoed audit summaries.
   * That is the reconnaissance step of the execution-forgery chain closed as
   * S-C1, re-opened under a new route name. Both halves of the fix are pinned
   * here: the route's gate, and the fact that the payload is rebuilt from safe
   * fields rather than echoed.
   */
  it('does NOT expose the notification history below audit:read', async () => {
    for (const role of ['Viewer', 'Approver', 'Counsel']) {
      await http()
        .get('/api/notifications')
        .set('Authorization', `Bearer ${token(role)}`)
        .expect(403);
    }

    const lead = await http()
      .get('/api/notifications')
      .set('Authorization', `Bearer ${token('Lead – Legal')}`)
      .expect(200);
    expect(Array.isArray(lead.body)).toBe(true);
    // Even for a role that MAY read it, the line is rebuilt from the action and
    // the entity id — the raw audit summary (which embeds envelope ids and
    // counterparty addresses) is never echoed through this route.
    expect(JSON.stringify(lead.body)).not.toMatch(/MEL-ENV/);
  });

  it('requires authentication for every workspace read', async () => {
    for (const path of ['/api/dashboard', '/api/pipeline', '/api/search?q=x', '/api/nav-counts', '/api/notifications']) {
      await http().get(path).expect(401);
    }
  });

  it('reports the audit trail on the readiness probe', async () => {
    const r = await http().get('/api/health/ready').expect(200);
    expect(r.body.checks.auditTrail).toBe('ok');
  });

  it('does not leak envelope IDs to a read-only viewer', async () => {
    // A viewer previously read every envelopeId, which was step 1 of the
    // unauthenticated execution-forgery chain.
    await http().get('/api/esign').set('Authorization', `Bearer ${token('Viewer')}`).expect(403);
  });

  it('REJECTS an unsigned e-signature webhook (execution-forgery regression)', async () => {
    const list = await http()
      .get('/api/esign')
      .set('Authorization', `Bearer ${token('Lead – Legal')}`)
      .expect(200);
    const env = (list.body as any[]).find((r) => r.envelopeId)?.envelopeId;
    expect(env).toBeTruthy();

    // No signature header → must be refused, not applied.
    await http()
      .post('/api/esign/webhook')
      .send({ envelopeId: env, event: 'completed' })
      .expect(401);

    // And nothing was executed as a result.
    const archive = await http()
      .get('/api/esign/archive')
      .set('Authorization', `Bearer ${token('Lead – Legal')}`)
      .expect(200);
    expect((archive.body as any[]).some((a) => a.requestId && a.contractId === env)).toBe(false);
  });

  it('accepts a correctly signed webhook and dedupes replays (idempotency)', async () => {
    const list = await http()
      .get('/api/esign')
      .set('Authorization', `Bearer ${token('Lead – Legal')}`)
      .expect(200);
    const env = (list.body as any[]).find((r) => r.envelopeId)?.envelopeId;
    const payload = JSON.stringify({ envelopeId: env, event: 'viewed' });
    const sig = createHmac('sha256', process.env.MELENTO_WEBHOOK_SECRET as string)
      .update(payload)
      .digest('hex');
    const send = () =>
      http()
        .post('/api/esign/webhook')
        .set('Content-Type', 'application/json')
        .set('x-melento-signature', sig)
        .send(payload)
        .expect(201);
    await send();
    const second = await send();
    expect(second.body.duplicate).toBe(true);
  });
});
