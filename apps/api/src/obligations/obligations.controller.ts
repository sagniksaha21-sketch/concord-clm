import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ObligationsService } from './obligations.service';
import { Roles } from '../auth/rbac';
import { DigestRunDto, ReminderDto } from './obligations.dto';

@Controller('obligations')
export class ObligationsController {
  constructor(private readonly obligations: ObligationsService) {}

  @Get()
  list() {
    return this.obligations.list();
  }

  @Get('upcoming')
  upcoming(@Query('days') days?: string) {
    return this.obligations.upcoming(days ? Number(days) : 90);
  }

  /** Preview the digest email (subject + count + HTML) without sending. */
  @Get('digest/preview')
  digestPreview(@Query('days') days?: string) {
    return this.obligations.buildDigest(days ? Number(days) : 90);
  }

  /** Send the digest now (dry-run without Graph). Optional recipients override. */
  @Roles('contract:write')
  @Post('digest/run')
  runDigest(@Body() body: DigestRunDto) {
    return this.obligations.sendDigest(body?.days ?? 90, body?.to);
  }

  @Roles('contract:write')
  @Post(':id/remind')
  remind(@Param('id') id: string, @Body() body: ReminderDto) {
    return this.obligations.remind(id, body?.to);
  }
}
