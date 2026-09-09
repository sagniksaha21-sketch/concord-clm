import { Module } from '@nestjs/common';
import { ContractsModule } from '../contracts/contracts.module';
import { ObligationsModule } from '../obligations/obligations.module';
import { ESignModule } from '../esign/esign.module';
import { IntakeModule } from '../intake/intake.module';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';

/**
 * Aggregate read model for the Command Center, pipeline board, global search
 * and notification history. Depends only on existing modules — it owns no
 * store of its own, so there is no second source of truth to drift.
 */
@Module({
  imports: [ContractsModule, ObligationsModule, ESignModule, IntakeModule],
  controllers: [WorkspaceController],
  providers: [WorkspaceService],
})
export class WorkspaceModule {}
