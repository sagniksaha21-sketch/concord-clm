import { Global, Module } from '@nestjs/common';
import { FileSecurityService } from './file-security.service';
import { DownloadLinkService } from './download-link.service';
import { AiGuardrailsService } from './ai-guardrails.service';

/**
 * Cross-cutting security services (assessment findings H2 + AI guardrails +
 * hardening): upload content validation / malware seam, signed short-lived
 * download links, and AI guardrails. Global so any feature module can inject them.
 */
@Global()
@Module({
  providers: [FileSecurityService, DownloadLinkService, AiGuardrailsService],
  exports: [FileSecurityService, DownloadLinkService, AiGuardrailsService],
})
export class SecurityModule {}
