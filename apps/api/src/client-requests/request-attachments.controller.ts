import { BadRequestException, Body, Controller, Get, Param, Post, Req, Res, StreamableFile, UploadedFile, UseInterceptors, ServiceUnavailableException, NotFoundException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createHash, randomUUID } from 'crypto';
import { Roles } from '../auth/rbac';
import { PrismaService } from '../persistence/prisma.service';
import { StorageService } from '../storage/storage.service';
import { FileSecurityService, FileToCheck } from '../security/file-security.service';
import { ClientRequestsService } from './client-requests.service';
import { AuditService } from '../audit/audit.service';

@Controller('request-attachments')
@Roles('request:read')
export class RequestAttachmentsController {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService, private readonly security: FileSecurityService, private readonly requests: ClientRequestsService, private readonly audit: AuditService) {}

  @Post() @Roles('request:write')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 1 } }))
  async upload(@UploadedFile() file: FileToCheck, @Body('category') category: string, @Req() req: any) {
    if (!this.prisma.enabled) throw new ServiceUnavailableException('Document storage is unavailable.');
    if (!file?.buffer?.length) throw new BadRequestException('Choose a document to upload.');
    if (!['Counterparty paper', 'Proposal', 'Scope', 'Purchase order', 'Previous contract', 'Correspondence', 'Supporting document'].includes(category)) throw new BadRequestException('Choose a document category.');
    const verdict = await this.security.check(file);
    if (!verdict.ok || (verdict.scan !== 'clean' && (process.env.UPLOAD_REQUIRE_SCAN === 'true' || verdict.scanEngine === 'error'))) throw new BadRequestException(verdict.reason || 'This document could not be cleared by the file scanner.');
    const id = randomUUID();
    const filename = file.originalname.replace(/[\/\\\r\n\u0000-\u001f]/g, '_').slice(0, 180);
    return this.prisma.client.$transaction(async (tx: any) => {
      await tx.$queryRawUnsafe('SELECT id FROM "User" WHERE id = $1 FOR UPDATE', req.user.id);
      const count = await tx.requestAttachment.count({ where: { uploaderId: req.user.id, createdAt: { gte: new Date(Date.now() - 86_400_000) } } });
      if (count >= 40) throw new BadRequestException('Your daily document limit has been reached. Please contact Legal for a bulk upload.');
      const storageKey = await this.storage.put(file.buffer, filename, verdict.detectedType);
      await tx.requestAttachment.create({ data: { id, uploaderId: req.user.id, filename, size: file.buffer.length, category, contentType: verdict.detectedType, storageKey, sha256: createHash('sha256').update(file.buffer).digest('hex') } });
      await this.audit.recordInTransaction(tx, { actor: req.user, action: 'request.attachment_uploaded', entity: 'document', entityId: id, summary: 'Private supporting document received', metadata: { scan: verdict.scan, scanEngine: verdict.scanEngine } });
      return { id, filename, size: file.buffer.length, category };
    }, { timeout: 30_000, maxWait: 10_000 });
  }

  @Get(':id/file')
  async file(@Param('id') id: string, @Req() req: any, @Res({ passthrough: true }) res: any) {
    const row = this.prisma.enabled ? await this.prisma.client.requestAttachment.findUnique({ where: { id } }) : null;
    if (!row) throw new NotFoundException('Document not found.');
    // A legal-wide contract permission does not grant access to a private request.
    if (row.requestId) await this.requests.get(row.requestId, req.user);
    else if (row.uploaderId !== req.user.id) throw new NotFoundException('Document not found.');
    const saved = await this.storage.get(row.storageKey);
    if (createHash('sha256').update(saved.buffer).digest('hex') !== row.sha256) throw new ServiceUnavailableException('Document integrity could not be verified.');
    res.set({ 'Content-Type': row.contentType, 'Content-Disposition': `attachment; filename="${row.filename.replace(/["\r\n]/g, '_')}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    return new StreamableFile(saved.buffer);
  }
}
