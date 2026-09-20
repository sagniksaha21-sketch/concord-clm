import { Controller, Get, Header, Param, Req, Res, StreamableFile } from '@nestjs/common';
import { Roles } from '../auth/rbac';
import { ApproverService } from './approver.service';

@Controller('approvals') @Roles('approve')
export class ApproverController {
  constructor(private readonly approver: ApproverService) {}
  @Get() @Header('Cache-Control','private, no-store') queue(@Req() req: any) { return this.approver.queue(req.user); }
  @Get(':id') @Header('Cache-Control','private, no-store') card(@Param('id') id: string, @Req() req: any) { return this.approver.card(id,req.user); }
  @Get(':id/file') async file(@Param('id') id: string, @Req() req: any, @Res({ passthrough: true }) res: any) {
    const file = await this.approver.file(id,req.user);
    res.set({ 'Content-Type': file.contentType, 'Cache-Control': 'private, no-store', 'Content-Disposition': `attachment; filename="${file.filename.replace(/["\r\n]/g,'_')}"` });
    return new StreamableFile(file.buffer);
  }
}
