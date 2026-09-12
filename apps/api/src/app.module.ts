import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ContractsModule } from './contracts/contracts.module';
import { AiReviewModule } from './ai-review/ai-review.module';
import { WorkflowModule } from './workflow/workflow.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RepositoryModule } from './repository/repository.module';
import { ObligationsModule } from './obligations/obligations.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { IntakeModule } from './intake/intake.module';
import { AuthoringModule } from './authoring/authoring.module';
import { PersistenceModule } from './persistence/persistence.module';
import { AuditModule } from './audit/audit.module';
import { SecurityModule } from './security/security.module';
import { JobsModule } from './jobs/jobs.module';
import { OpsModule } from './ops/ops.module';
import { AuthModule } from './auth/auth.module';
import { StorageModule } from './storage/storage.module';
import { DocumentsModule } from './documents/documents.module';
import { EmbeddingsModule } from './embeddings/embeddings.module';
import { ESignModule } from './esign/esign.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { ReportsModule } from './reports/reports.module';
import { ClientRequestsModule } from './client-requests/client-requests.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PersistenceModule,
    AuditModule,
    SecurityModule,
    JobsModule,
    OpsModule,
    StorageModule,
    EmbeddingsModule,
    AuthModule,
    DocumentsModule,
    ContractsModule,
    AiReviewModule,
    WorkflowModule,
    NotificationsModule,
    RepositoryModule,
    ObligationsModule,
    IngestionModule,
    IntakeModule,
    AuthoringModule,
    ESignModule,
    WorkspaceModule,
    ReportsModule,
    ClientRequestsModule,
  ],
})
export class AppModule {}
