import { Module } from '@nestjs/common';
import { ContractsModule } from '../contracts/contracts.module';
import { AiReviewModule } from '../ai-review/ai-review.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';
import { WorkflowController } from './workflow.controller';
import { ApprovalPolicyController } from './approval-policy.controller';
import { WorkflowService } from './workflow.service';
import { ApproverController } from './approver.controller';
import { ApproverService } from './approver.service';

@Module({
  imports: [ContractsModule, AiReviewModule, NotificationsModule, AuthModule],
  controllers: [WorkflowController, ApproverController, ApprovalPolicyController],
  providers: [WorkflowService, ApproverService],
})
export class WorkflowModule {}
