import { Controller, Get, Header, Param, Patch, Post, Req } from '@nestjs/common';
import { Roles } from '../auth/rbac';
import { RequestInboxService } from './request-inbox.service';

@Controller('inbox')
@Roles()
export class RequestInboxController {
  constructor(private readonly inbox: RequestInboxService) {}
  @Get() @Header('Cache-Control', 'private, no-store')
  list(@Req() req: any) { return this.inbox.list(req.user); }
  @Get('unread-count') @Header('Cache-Control', 'private, no-store')
  count(@Req() req: any) { return this.inbox.unread(req.user); }
  @Patch(':id/read')
  read(@Param('id') id: string, @Req() req: any) { return this.inbox.markRead(req.user, id); }
  @Post('read-all')
  readAll(@Req() req: any) { return this.inbox.markRead(req.user); }
}
