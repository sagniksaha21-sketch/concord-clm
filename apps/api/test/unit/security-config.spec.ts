import { inspectSecurityConfig, demoLoginEnabled, degradedModes } from '../../src/security/security.config';

describe('Production security posture (H5 + fallback governance)', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('refuses a placeholder secret in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_JWT_SECRET = 'change-me-in-production';
    const errors = inspectSecurityConfig().filter((i) => i.level === 'error');
    expect(errors.some((e) => /AUTH_JWT_SECRET/.test(e.message))).toBe(true);
  });

  it('disables demo login by default in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AUTH_ALLOW_DEMO_USERS;
    delete process.env.AUTH_DISABLE_DEMO_USERS;
    expect(demoLoginEnabled()).toBe(false);
  });

  it('allows demo login in non-production', () => {
    process.env.NODE_ENV = 'test';
    expect(demoLoginEnabled()).toBe(true);
  });

  it('surfaces degraded/fallback modes so they cannot masquerade as real processing', () => {
    delete process.env.DATABASE_URL;
    delete process.env.GRAPH_CLIENT_ID;
    const modes = degradedModes();
    expect(modes.join(' ')).toMatch(/in-memory/);
    expect(modes.join(' ')).toMatch(/dry-run/);
  });

  it('passes with a strong secret and no strict-integration requirement', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_JWT_SECRET = 'a-genuinely-strong-random-secret-value-9f3b7';
    delete process.env.PROD_REQUIRE_REAL_INTEGRATIONS;
    const errors = inspectSecurityConfig().filter((i) => i.level === 'error');
    expect(errors).toHaveLength(0);
  });
});
