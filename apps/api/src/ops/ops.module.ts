import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { HealthController } from './health.controller';
import { TimeoutInterceptor } from './timeout.interceptor';

/**
 * Operational protections (GPT 5.6 P1): liveness/readiness health checks and a
 * global request-timeout interceptor. Rate limiting, security headers and
 * request-id/correlation are applied as middleware in main.ts (they must run
 * before the guards).
 */
@Module({
  controllers: [HealthController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: TimeoutInterceptor }],
})
export class OpsModule {}
