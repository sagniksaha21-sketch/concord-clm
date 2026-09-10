import {
  Controller,
  Get,
  Param,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { normalizeRole } from '@concord/shared';
import { Roles } from '../auth/rbac';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** JSON preview used by the Reports screen before a user chooses a format. */
  @Roles('contract:read')
  @Get('portfolio')
  portfolio(@Req() req: any) {
    return this.reports.portfolio(normalizeRole(req.user?.role));
  }

  /**
   * Streams a generated report. The same authenticated, role-scoped snapshot
   * drives every format, so a deck cannot contain more than the spreadsheet.
   */
  @Roles('contract:read')
  @Get('portfolio/:format')
  async export(
    @Param('format') format: string,
    @Req() req: any,
    @Res({ passthrough: true }) res: { set: (headers: Record<string, string>) => void },
  ): Promise<StreamableFile> {
    const file = await this.reports.export(format, normalizeRole(req.user?.role), req.user ? {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
    } : undefined);
    res.set({
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Content-Length': String(file.buffer.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(file.buffer);
  }
}
