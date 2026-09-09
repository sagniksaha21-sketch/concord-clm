import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { RepositoryService } from './repository.service';
import { Roles } from '../auth/rbac';
import { RepositoryQuestionDto } from './repository.dto';

@Controller('repository')
export class RepositoryController {
  constructor(private readonly repo: RepositoryService) {}

  @Roles('contract:read')
  @Get('search')
  search(@Query('q') q?: string) {
    return this.repo.search(q ?? '');
  }

  @Roles('contract:read')
  @Get('semantic')
  semantic(@Query('q') q?: string, @Query('k') k?: string) {
    return this.repo.semantic(q ?? '', k ? Number(k) : 5);
  }

  /** Executed & signed copies matching the query (from the signed archive). */
  @Roles('contract:read')
  @Get('documents')
  documents(@Query('q') q?: string) {
    return this.repo.searchExecuted(q ?? '');
  }

  @Roles('contract:read')
  @Post('ask')
  ask(@Body() body: RepositoryQuestionDto) {
    return this.repo.ask(body?.question ?? '');
  }
}
