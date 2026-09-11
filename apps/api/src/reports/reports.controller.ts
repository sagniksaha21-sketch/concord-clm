import {
  Controller,
  Body,
  Get,
  Post,
  Param,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { normalizeRole } from '@concord/shared';
import { Roles } from '../auth/rbac';
import { ReportsService } from './reports.service';
import { ReportOptionsDto } from './report-options.dto';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** JSON preview used by the Reports screen before a user chooses a format. */
  @Roles('contract:read')
  @Get('portfolio')
  portfolio(@Req() req: any) {
    return this.reports.portfolio(normalizeRole(req.user?.role));
  }

  /** Briefs travel in a POST body rather than URLs or proxy query logs. */
  @Roles('contract:read')
  @Post('portfolio')
  personalisedPortfolio(@Body() options: ReportOptionsDto, @Req() req: any) {
    return this.reports.portfolio(normalizeRole(req.user?.role), options);
  }

  @Roles('contract:read')
  @Post('portfolio/:format')
  personalisedExport(
    @Param('format') format: string,
    @Body() options: ReportOptionsDto,
    @Req() req: any,
    @Res({ passthrough: true }) res: { set: (headers: Record<string, string>) => void },
  ): Promise<StreamableFile> {
    return this.export(format, req, res, options);
  }

  /**
   * Streams a fresh report using the same role and filter rules for every format.
   */
  @Roles('contract:read')
  @Get('portfolio/:format')
  async export(
    @Param('format') format: string,
    @Req() req: any,
    @Res({ passthrough: true }) res: { set: (headers: Record<string, string>) => void },
    options: ReportOptionsDto = {},
  ): Promise<StreamableFile> {
    const file = await this.reports.export(format, normalizeRole(req.user?.role), req.user ? {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
    } : undefined, options);
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
