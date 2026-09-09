import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuditInterceptor } from './audit.interceptor';
import { AuditExceptionFilter } from './audit-exception.filter';

/**
 * Immutable audit trail (finding C2). Global so any service can inject
 * AuditService to record domain events; the interceptor provides baseline
 * coverage of every mutating request.
 */
@Global()
@Module({
  controllers: [AuditController],
  providers: [
    AuditService,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: AuditExceptionFilter },
  ],
  exports: [AuditService],
})
export class AuditModule {}
