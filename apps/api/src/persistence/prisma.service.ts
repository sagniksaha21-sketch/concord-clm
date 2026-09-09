import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

/**
 * Optional Postgres persistence via Prisma. Loaded dynamically so the build
 * never depends on a generated client: with DATABASE_URL set and the client
 * generated (`pnpm db:generate`) it connects; otherwise `enabled` stays false
 * and services fall back to in-memory stores.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  enabled = false;
  client: any = null;

  async onModuleInit(): Promise<void> {
    const prod = (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
    if (!process.env.DATABASE_URL) {
      if (prod) throw new Error('DATABASE_URL is required in production');
      this.logger.log('DATABASE_URL not set — using in-memory stores (development only)');
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('@prisma/client');
      this.client = new mod.PrismaClient();
      await this.client.$connect();
      this.enabled = true;
      this.logger.log('Connected to Postgres via Prisma');
    } catch (e) {
      this.client = null; this.enabled = false;
      if (prod) throw new Error(`Postgres/Prisma unavailable in production: ${String(e)}`);
      this.logger.warn(`Prisma unavailable (${String(e)}) — using in-memory stores (development only)`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      try {
        await this.client.$disconnect();
      } catch {
        /* noop */
      }
    }
  }
}
