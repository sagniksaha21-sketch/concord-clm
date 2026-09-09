import { Controller, Get, Param } from '@nestjs/common';
import { AiReviewService } from './ai-review.service';
import { Roles } from '../auth/rbac';

@Controller('contracts/:id/review')
export class AiReviewController {
  constructor(private readonly review: AiReviewService) {}

  @Roles('contract:read')
  @Get()
  get(@Param('id') id: string) {
    return this.review.getReview(id);
  }
}
