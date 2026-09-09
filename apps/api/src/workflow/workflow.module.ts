import { Module } from '@nestjs/common';
import { ContractsModule } from '../contracts/contracts.module';
import { AiReviewModule } from '../ai-review/ai-review.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';

@Module({
  imports: [ContractsModule, AiReviewModule, NotificationsModule, AuthModule],
  controllers: [WorkflowController],
  providers: [WorkflowService],
})
export class WorkflowModule {}
