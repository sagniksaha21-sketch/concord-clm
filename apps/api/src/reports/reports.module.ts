import { Module } from '@nestjs/common';
import { ContractsModule } from '../contracts/contracts.module';
import { ObligationsModule } from '../obligations/obligations.module';
import { ESignModule } from '../esign/esign.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportAiService } from './report-ai.service';

@Module({
  imports: [ContractsModule, ObligationsModule, ESignModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportAiService],
})
export class ReportsModule {}
