import { BadRequestException, Body, Controller, Get, Header, Param, Post, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Public, Roles } from '../auth/rbac';
import { GuestAuthService, guestCookieName, guestCookiePath } from './guest-auth.service';
import { GuestBrowserGuard } from './guest-browser.guard';
import { GuestAcceptDto, GuestCommentDto, GuestEmailDto, GuestOtpDto, GuestResponseDto, GuestUploadDto, InviteGuestDto, NegotiationVersionDto } from './negotiation.dto';
import { NegotiationService } from './negotiation.service';

@Controller('agreements/:id/negotiation') @Roles('contract:write')
export class NegotiationController {
  constructor(private readonly negotiation: NegotiationService) {}
  @Get() @Header('Cache-Control','private, no-store') workspace(@Param('id') id: string, @Req() req: any) { return this.negotiation.workspace(id,req.user); }
  @Post('invitations') invite(@Param('id') id: string, @Req() req: any, @Body() dto: InviteGuestDto) { return this.negotiation.invite(id,dto,req.user); }
  @Post('invitations/:invitationId/revoke') revoke(@Param('id') id: string, @Param('invitationId') invite: string, @Req() req: any) { return this.negotiation.revoke(id,invite,req.user); }
  @Post('share') share(@Param('id') id: string, @Req() req: any, @Body() dto: NegotiationVersionDto) { return this.negotiation.share(id,dto,req.user); }
  @Post('responses/:responseId/reviewed') reviewed(@Param('id') id: string, @Param('responseId') responseId: string, @Req() req: any, @Body() dto: NegotiationVersionDto) { return this.negotiation.reviewed(id,responseId,dto,req.user); }
  @Post('agreed') agreed(@Param('id') id: string, @Req() req: any, @Body() dto: NegotiationVersionDto) { return this.negotiation.agreed(id,dto,req.user); }
  @Post('comments') comment(@Param('id') id: string, @Req() req: any, @Body() dto: GuestCommentDto) { return this.negotiation.legalComment(id,dto,req.user); }
}

@Controller('negotiation/guest/:invitationId') @Public() @UseGuards(GuestBrowserGuard)
export class GuestNegotiationController {
  constructor(private readonly auth: GuestAuthService, private readonly negotiation: NegotiationService) {}
  private token(req: any, id: string) {
    const name = guestCookieName(id)+'=';
    const found = String(req.headers.cookie ?? '').split(';').map(s => s.trim()).find(s => s.startsWith(name));
    return found ? found.slice(name.length) : '';
  }
  @Post('challenge') @Header('Cache-Control','no-store') challenge(@Param('invitationId') id: string, @Req() req: any, @Body() dto: GuestEmailDto) { return this.auth.challenge(id,dto.email,req.ip ?? req.socket.remoteAddress ?? 'unknown'); }
  @Post('verify') @Header('Cache-Control','no-store') async verify(@Param('invitationId') id: string, @Req() req: any, @Res({ passthrough: true }) res: any, @Body() dto: GuestOtpDto) {
    const result = await this.auth.verify(id,dto,req.ip ?? req.socket.remoteAddress ?? 'unknown');
    res.cookie(guestCookieName(id),result.token,{ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: guestCookiePath(id), expires: result.expiresAt });
    return { ok: true };
  }
  @Post('logout') async logout(@Param('invitationId') id: string, @Req() req: any, @Res({ passthrough: true }) res: any) { await this.auth.logout(id,this.token(req,id)); res.clearCookie(guestCookieName(id),{ path: guestCookiePath(id), httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' }); return { ok: true }; }
  @Get() @Header('Cache-Control','private, no-store') room(@Param('invitationId') id: string, @Req() req: any) { return this.negotiation.room(id,this.token(req,id)); }
  @Get('file') async file(@Param('invitationId') id: string, @Req() req: any, @Res({ passthrough: true }) res: any) {
    const file = await this.negotiation.guestFile(id,this.token(req,id));
    res.set({ 'Content-Type': file.contentType, 'Content-Disposition': `attachment; filename="${file.filename.replace(/["\r\n]/g,'_')}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    return new StreamableFile(file.buffer);
  }
  @Post('comments') comment(@Param('invitationId') id: string, @Req() req: any, @Body() dto: GuestCommentDto) { return this.negotiation.guestComment(id,this.token(req,id),dto); }
  @Post('response') respond(@Param('invitationId') id: string, @Req() req: any, @Body() dto: GuestResponseDto) { return this.negotiation.respond(id,this.token(req,id),dto); }
  @Post('upload') @UseInterceptors(FileInterceptor('file',{ limits: { fileSize: 25*1024*1024, files: 1 } }))
  upload(@Param('invitationId') id: string, @Req() req: any, @Body() dto: GuestUploadDto, @UploadedFile() file: any) {
    if (!file) throw new BadRequestException('Choose a Word redline.');
    return this.negotiation.respond(id,this.token(req,id),{ ...dto, sections: [] },file);
  }
  @Post('accept') accept(@Param('invitationId') id: string, @Req() req: any, @Body() dto: GuestAcceptDto) { return this.negotiation.accept(id,this.token(req,id),dto.documentId); }
}
