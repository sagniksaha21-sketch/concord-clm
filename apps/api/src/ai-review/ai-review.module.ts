import { Module } from '@nestjs/common';
import { ContractsModule } from '../contracts/contracts.module';
import { AiReviewController } from './ai-review.controller';
import { AiReviewService } from './ai-review.service';

@Module({
  imports: [ContractsModule],
  controllers: [AiReviewController],
  providers: [AiReviewService],
  exports: [AiReviewService],
})
export class AiReviewModule {}
