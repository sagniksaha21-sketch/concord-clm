// MUST be the first import in the process.
//
// OpenTelemetry's auto-instrumentation patches modules as they are required, so
// anything already loaded when the SDK starts is never traced. Importing Nest,
// Prisma or http above this line silently produces a service that reports no
// spans while appearing configured — so this stays at the top, and the
// invariant checker asserts it.
import { startTelemetry } from './telemetry/telemetry';

const telemetry = startTelemetry();

import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { assertBootSecurity, degradedModes } from './security/security.config';

/** In-memory sliding-window rate limiter (per client IP). */
function rateLimiter() {
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
  const max = Number(process.env.RATE_LIMIT_MAX || 300);
  const hits = new Map<string, number[]>();
  // Stricter budget for credential endpoints (brute-force resistance).
  const loginMax = Number(process.env.RATE_LIMIT_LOGIN_MAX || 10);
  return (req: any, res: any, next: any) => {
    // req.ip is trustworthy because 'trust proxy' is configured; never read
    // X-Forwarded-For directly (a client can forge a fresh value per request).
    const ip = req.ip || 'unknown';
    const isLogin = typeof req.path === 'string' && req.path.endsWith('/auth/login');
    const key = isLogin ? `login:${ip}` : ip;
    const limit = isLogin ? loginMax : max;
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(key, recent);
    // Bounded LRU-ish eviction: drop the oldest keys instead of clearing all
    // (clearing would hand every client a fresh budget).
    if (hits.size > 20000) {
      for (const k of Array.from(hits.keys()).slice(0, 5000)) hits.delete(k);
    }
    if (recent.length > limit) {
      res.status(429).json({ statusCode: 429, message: 'Too many requests' });
      return;
    }
    next();
  };
}

/**
 * CSRF defence for cookie-authenticated browser mutations. SameSite=Lax is a
 * strong baseline, but an explicit Origin check also protects deployments with
 * sibling subdomains and future cookie-policy changes. Bearer-only API clients
 * and signed provider webhooks are unaffected because they do not present the
 * Concord session cookie.
 */
function browserMutationOriginGuard() {
  const allowed = new Set(
    (process.env.WEB_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((x) => x.trim().replace(/\/$/, ''))
      .filter(Boolean),
  );
  const safe = new Set(['GET', 'HEAD', 'OPTIONS']);
  return (req: any, res: any, next: any) => {
    if (safe.has(String(req.method).toUpperCase())) return next();
    const cookie = String(req.headers?.cookie ?? '');
    if (!/(?:^|;\s*)concord_token=/.test(cookie)) return next();
    const origin = String(req.headers?.origin ?? '').replace(/\/$/, '');
    if (!origin || !allowed.has(origin)) {
      res.status(403).json({ statusCode: 403, message: 'Request origin is not allowed' });
      return;
    }
    next();
  };
}

async function bootstrap() {
  const logger = new Logger('Concord');

  // Fail fast on an unsafe production posture (placeholder secrets, demo logins,
  // and — in strict mode — degraded/fallback integrations).
  assertBootSecurity(logger);

  // rawBody: the Melento webhook HMAC must be computed over the exact bytes the
  // sender signed — re-serialising the parsed JSON would not match.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  // Trust exactly one proxy hop (the WAF / load balancer) so req.ip is the real
  // client. Without this, X-Forwarded-For is attacker-controlled.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Correlation id + baseline security headers (run before guards).
  app.use((req: any, res: any, next: any) => {
    const id = (req.headers['x-request-id'] as string) || randomUUID();
    (req as any).id = id;
    res.setHeader('X-Request-Id', id);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });
  app.use(browserMutationOriginGuard());
  app.use(rateLimiter());

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  app.enableCors({
    origin: process.env.WEB_ORIGIN?.split(',') ?? 'http://localhost:3000',
    credentials: true,
  });

  const modes = degradedModes();
  if (modes.length) {
    logger.warn(`[degraded] active fallback modes: ${modes.join(' · ')}`);
  }

  // Say plainly whether telemetry is on. "Monitoring is configured" is exactly
  // the kind of claim this codebase has already been caught making about an
  // absent control, so the boot log states which of the three states applies.
  if (telemetry.state === 'active') {
    logger.log(`[telemetry] exporting to ${telemetry.exporters.join(', ')} as ${telemetry.serviceName}`);
  } else if (telemetry.state === 'failed') {
    logger.error(`[telemetry] NOT exporting — ${telemetry.reason}`);
  } else {
    logger.warn(`[telemetry] disabled — ${telemetry.reason}`);
  }

  // Graceful shutdown: without these, SIGTERM on a rolling deploy kills the
  // process with in-flight requests and open Prisma connections, and
  // OnModuleDestroy hooks never run.
  app.enableShutdownHooks();
  for (const sig of ['SIGTERM', 'SIGINT'] as const) {
    process.on(sig, () => {
      logger.log(`${sig} received — draining and shutting down`);
      app.close().then(
        () => process.exit(0),
        (e) => {
          logger.error(`Shutdown error: ${String(e)}`);
          process.exit(1);
        },
      );
    });
  }

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  logger.log(`API ready on http://localhost:${port}/api  (health: /api/health)`);
}

// Defence in depth: Node 22 terminates the process on an unhandled rejection.
// A single missed `.catch()` on a background promise (an audit write, a nudge
// sweep) must not take the API down — log it loudly and keep serving.
process.on('unhandledRejection', (reason) => {
  const logger = new Logger('Concord');
  logger.error(
    `Unhandled promise rejection: ${
      reason instanceof Error ? reason.stack ?? reason.message : String(reason)
    }`,
  );
  // In production, an unhandled rejection may leave state partially applied.
  // Fail the replica and let the orchestrator replace it rather than continuing
  // to serve from an unknown state. Development remains debuggable in-process.
  if ((process.env.NODE_ENV ?? '').toLowerCase() === 'production') process.exit(1);
});

// A boot failure must be a clear fatal log + non-zero exit, not an unhandled
// rejection (the boot guard throws deliberately on an unsafe production posture).
bootstrap().catch((e) => {
  new Logger('Concord').error(`Fatal startup error: ${e?.message ?? String(e)}`);
  process.exit(1);
});
