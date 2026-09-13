import { Body, Controller, Get, Header, Param, Post, Query, Req, Res, StreamableFile } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { PrismaService } from '../persistence/prisma.service';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'crypto';
import { Roles } from '../auth/rbac';
import { AgreementsService } from './agreements.service';
import { AgreementTransitionDto, CreateAgreementDto, SaveDraftDto, StartDraftDto, ReviseAgreementDto, AgreementObligationDto } from './agreement.dto';

@Controller('agreements') @Roles('contract:read')
export class AgreementsController {
  constructor(private readonly agreements: AgreementsService, private readonly prisma: PrismaService, private readonly storage: StorageService) {}
  @Get() @Header('Cache-Control', 'private, no-store') work(@Req() req: any, @Query('view') view?: string) { return this.agreements.work(req.user, view); }
  @Post() @Roles('contract:write') create(@Req() req: any, @Body() dto: CreateAgreementDto) { return this.agreements.create(dto, req.user); }
  @Get(':id') @Header('Cache-Control', 'private, no-store') get(@Param('id') id: string, @Req() req: any) { return this.agreements.snapshot(id, req.user); }
  @Post(':id/draft/template') @Roles('contract:write') start(@Param('id') id: string, @Req() req: any, @Body() dto: StartDraftDto) { return this.agreements.startDraft(id, dto, req.user); }
  @Post(':id/draft') @Roles('contract:write') save(@Param('id') id: string, @Req() req: any, @Body() dto: SaveDraftDto) { return this.agreements.saveDraft(id, dto, req.user); }
  @Post(':id/stage') @Roles('contract:write') stage(@Param('id') id: string, @Req() req: any, @Body() dto: AgreementTransitionDto) { return this.agreements.transition(id, dto, req.user); }
  @Post(':id/revise') @Roles('contract:write') revise(@Param('id') id: string, @Req() req: any, @Body() dto: ReviseAgreementDto) { return this.agreements.revise(id, dto, req.user); }
  @Post(':id/obligations') @Roles('contract:write') obligation(@Param('id') id: string, @Req() req: any, @Body() dto: AgreementObligationDto) { return this.agreements.obligation(id, dto, req.user); }
  @Get(':id/executed')
  async executed(@Param('id') id: string, @Res({ passthrough: true }) res: any) {
    const c = this.prisma.enabled ? await this.prisma.client.contract.findUnique({ where: { id } }) : null;
    const archive = c?.authoritativeArchiveId ? await this.prisma.client.archivedDocument.findUnique({ where: { id: c.authoritativeArchiveId } }) : null;
    if (!archive || archive.contractId !== id || archive.format !== 'application/pdf') throw new NotFoundException('An executed agreement is not available yet.');
    const file = await this.storage.get(archive.storageKey);
    if (createHash('sha256').update(file.buffer).digest('hex') !== archive.checksum) throw new ServiceUnavailableException('The signed document failed its integrity check.');
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${(archive.filename || 'executed-agreement.pdf').replace(/["\r\n]/g, '_')}"`, 'Cache-Control': 'private, no-store' });
    return new StreamableFile(file.buffer);
  }

}
