import { Global, Module } from '@nestjs/common';
import { JobsService } from './jobs.service';

/**
 * Durable background-work primitives (finding H1): atomic once-only claims for
 * replica-safe scheduling + idempotency, and a retry/backoff/DLQ helper. Global
 * so schedulers and webhook handlers can inject it.
 */
@Global()
@Module({
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
