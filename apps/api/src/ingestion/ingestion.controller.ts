import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { IngestionService, UploadedFile } from './ingestion.service';
import { Roles } from '../auth/rbac';
import { isProduction } from '../security/security.config';
import { IngestBatchDto, ValidateTaxIdsDto } from './ingestion.dto';

@Controller('ingest')
export class IngestionController {
  constructor(private readonly ingestion: IngestionService) {}

  /** Bulk ingest by reference. Body: { documents: [{ filename, text? }] }. */
  @Roles('ingest:write')
  @Post()
  ingest(@Body() body: IngestBatchDto) {
    return this.ingestion.ingest(body?.documents ?? []);
  }

  /**
   * Real multipart upload. Each file is OCR'd by Document Intelligence and
   * extracted by Azure OpenAI (when configured), then PAN/GSTIN-validated.
   */
  @Roles('ingest:write')
  @Post('upload')
  // Bounded so one request cannot consume most of a small API replica. The default
  // is 5 × 25 MB; production should normally stream direct-to-object-storage.
  @UseInterceptors(
    FilesInterceptor('files', Number(process.env.UPLOAD_MAX_FILES || 5), {
      limits: {
        fileSize: Number(process.env.UPLOAD_MAX_BYTES || 25 * 1024 * 1024),
        files: Number(process.env.UPLOAD_MAX_FILES || 5),
        fields: 20,
        fieldSize: 1024 * 1024,
      },
    }),
  )
  upload(@UploadedFiles() files: UploadedFile[], @Body('contractId') contractId?: string) {
    return this.ingestion.ingestUploads(files ?? [], contractId);
  }

  /** Re-run bundled sample agreements. This endpoint never exists in production. */
  @Roles('ingest:write')
  @Get('samples')
  samples() {
    if (isProduction()) throw new NotFoundException('Not found');
    return this.ingestion.getSamples();
  }

  /** Validate a PAN / GSTIN pair directly. */
  @Roles('ingest:write')
  @Post('validate')
  validate(@Body() body: ValidateTaxIdsDto) {
    return this.ingestion.validateIds(body?.pan, body?.gstin);
  }
}
