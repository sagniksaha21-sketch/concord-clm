// Test environment bootstrap: metadata reflection + a real (non-placeholder)
// JWT secret so auth works, and a non-production NODE_ENV so demo login is on.
import 'reflect-metadata';

process.env.NODE_ENV = 'test';
process.env.AUTH_JWT_SECRET =
  process.env.AUTH_JWT_SECRET || 'jest-secret-not-a-placeholder-0123456789';
delete process.env.DATABASE_URL; // force in-memory stores for deterministic tests

process.env.MELENTO_WEBHOOK_SECRET = 'jest-webhook-hmac-secret';
