import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UnauthorizedException,
} from '@nestjs/common';
import { ESignService } from './esign.service';
import { MelentoService } from './melento.service';
import { Public, Roles } from '../auth/rbac';
import { DownloadLinkService } from '../security/download-link.service';
import { AuditService } from '../audit/audit.service';
import { CreateSignatureDto, NudgeDto } from './esign.dto';

@Controller('esign')
export class ESignController {
  constructor(
    private readonly esign: ESignService,
    private readonly melento: MelentoService,
    private readonly links: DownloadLinkService,
    private readonly audit: AuditService,
  ) {}

  @Roles('esign:send')
  @Get()
  list() {
    return this.esign.list();
  }

  /** The signed-document archive — every executed agreement, most recent first. */
  @Roles('contract:read')
  @Get('archive')
  archive() {
    return this.esign.listArchive();
  }

  /** Download an executed record from the archive (authenticated). Access is logged. */
  @Roles('contract:read')
  @Get('archive/:id/file')
  async archiveFile(
    @Param('id') id: string,
    @Req() req: any,
    @Res({ passthrough: true }) res: { set: (headers: Record<string, string>) => void },
  ): Promise<StreamableFile> {
    const f = await this.esign.getArchiveFile(id);
    await this.audit.record({
      actor: req.user ? { id: req.user.id, email: req.user.email, role: req.user.role } : {},
      action: 'document.accessed',
      entity: 'signature',
      entityId: id,
      summary: `Executed document ${id} downloaded (authenticated)`,
    });
    // Served as a download, never inline: the certificate is HTML and the API
    // origin holds the session cookie — inline rendering would be stored XSS.
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${f.filename}"`,
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(f.buffer);
  }

  /**
   * Mints a short-lived, signed link to an executed record so it can be shared
   * (e.g. pasted to a counterparty) without handing over a session. The link
   * expires (default 5 min) and is HMAC-signed — see DownloadLinkService.
   */
  @Roles('esign:send')
  @Get('archive/:id/link')
  async archiveLink(@Param('id') id: string, @Req() req: any) {
    await this.esign.getArchiveFile(id); // 404s if the record does not exist
    const { exp, token } = this.links.sign(`esign-archive:${id}`);
    await this.audit.record({
      actor: req.user ? { id: req.user.id, email: req.user.email, role: req.user.role } : {},
      action: 'document.link_issued',
      entity: 'signature',
      entityId: id,
      summary: `Signed download link issued for ${id} (expires ${new Date(exp * 1000).toISOString()})`,
      metadata: { exp },
    });
    return { url: `/api/esign/archive/${id}/signed?exp=${exp}&sig=${token}`, exp };
  }

  /** Serves an executed record via a valid signed link (no session required). */
  @Public()
  @Get('archive/:id/signed')
  async archiveSigned(
    @Param('id') id: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Req() req: any,
    @Res({ passthrough: true }) res: { set: (headers: Record<string, string>) => void },
  ): Promise<StreamableFile> {
    if (!exp || !sig) throw new BadRequestException('Missing link parameters');
    const check = this.links.verify(`esign-archive:${id}`, exp, sig);
    if (!check.valid) {
      await this.audit.record({
        action: 'document.link_rejected',
        entity: 'signature',
        entityId: id,
        summary: `Rejected signed link for ${id} — ${check.reason}`,
        request: {
          method: 'GET',
          path: `/api/esign/archive/${id}/signed`,
          ip: req.ip,
          outcome: 'error',
        },
      });
      throw new ForbiddenException(`Invalid or expired link: ${check.reason}`);
    }
    const f = await this.esign.getArchiveFile(id);
    await this.audit.record({
      action: 'document.accessed',
      entity: 'signature',
      entityId: id,
      summary: `Executed document ${id} downloaded via signed link`,
    });
    // Served as a download, never inline: the certificate is HTML and the API
    // origin holds the session cookie — inline rendering would be stored XSS.
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${f.filename}"`,
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(f.buffer);
  }

  @Roles('esign:send')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.esign.get(id);
  }

  /** Send a contract for e-signature (procures the e-stamp, dispatches via Melento). */
  @Roles('esign:send')
  @Post()
  create(@Body() body: CreateSignatureDto) {
    return this.esign.create(body);
  }

  /** Demo helper: simulate the next signer action (production uses the webhook). */
  @Roles('esign:admin')
  @Post(':id/advance')
  advance(@Param('id') id: string) {
    return this.esign.advance(id);
  }

  /** Run the auto-nudge now — reminds pending signatories (dry-run without Graph). */
  @Roles('esign:admin')
  @Post('nudge/run')
  nudge(@Body() body: NudgeDto) {
    return this.esign.nudgePending(true, body?.days);
  }

  /**
   * Melento status callback. The HMAC is computed over the RAW request body
   * (re-serialising JSON would not match the sender's bytes). An unsigned or
   * mis-signed callback is rejected with 401 and audited — this endpoint can
   * drive contract execution, so it is fail-closed.
   */
  @Public()
  @Post('webhook')
  async webhook(@Body() body: any, @Req() req: any) {
    const sig = req?.headers?.['x-melento-signature'];
    const raw: string =
      typeof req?.rawBody === 'string'
        ? req.rawBody
        : Buffer.isBuffer(req?.rawBody)
          ? req.rawBody.toString('utf8')
          : JSON.stringify(body ?? {});
    if (!this.melento.verifyWebhook(sig, raw)) {
      await this.audit.record({
        action: 'esign.webhook_rejected',
        entity: 'signature',
        summary: 'Rejected e-signature webhook — missing or invalid HMAC signature',
        request: {
          method: 'POST',
          path: '/api/esign/webhook',
          ip: req?.ip,
          outcome: 'error',
        },
      });
      throw new UnauthorizedException('Invalid webhook signature');
    }
    return this.esign.webhook(body);
  }
}
