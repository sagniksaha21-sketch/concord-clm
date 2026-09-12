import { Injectable, Logger } from '@nestjs/common';
import { NotificationResult } from '@concord/shared';
import { getGraphClient, isGraphConfigured } from './graph.client';
import { isProduction } from '../security/security.config';
import { notificationFailures } from '../telemetry/telemetry';

interface SendParams {
  to: string[];
  subject: string;
  html: string;
}

/**
 * Did this notification actually reach the recipient?
 *
 * `sendEmail` never throws and returns `dry-run` whenever Graph is not
 * configured, so a caller testing only for `'failed'` treats "we logged the
 * email instead of sending it" as success. In production that is a silent
 * non-delivery: an approver who was never asked, or a signatory whose reminder
 * was suppressed for a day. In development a dry-run IS the expected outcome.
 */
export function wasDelivered(result: NotificationResult | null | undefined): boolean {
  if (!result) return false;
  if (result.status === 'sent') return true;
  return result.status === 'dry-run' && !isProduction();
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  /**
   * Sends an Outlook email via Microsoft Graph. When Graph is not configured the
   * service runs in DRY-RUN mode: it logs the exact message it would send and
   * returns a `dry-run` result, so the slice works end to end without a tenant.
   */
  async sendEmail(params: SendParams): Promise<NotificationResult> {
    const { to, subject, html } = params;
    const sentAt = new Date().toISOString();
    const base: NotificationResult = {
      channel: 'outlook-email',
      to,
      subject,
      status: 'dry-run',
      dryRun: true,
      sentAt,
    };

    if (!isGraphConfigured()) {
      this.logger.log(`[DRY-RUN] Outlook email → ${to.join(', ')}`);
      this.logger.log(`[DRY-RUN] Subject: ${subject}`);
      this.logger.debug(html);
      return {
        ...base,
        detail: 'Microsoft Graph not configured — email logged instead of sent.',
      };
    }

    try {
      const client = getGraphClient();
      const sender = process.env.GRAPH_SENDER_UPN!;
      await client.api(`/users/${sender}/sendMail`).post({
        message: {
          subject,
          body: { contentType: 'HTML', content: html },
          toRecipients: to.map((address) => ({ emailAddress: { address } })),
        },
        saveToSentItems: true,
      });
      this.logger.log(`Outlook email sent via Graph → ${to.join(', ')}`);
      return {
        ...base,
        status: 'sent',
        dryRun: false,
        detail: 'Accepted by Microsoft Graph (202).',
      };
    } catch (err) {
      this.logger.error(`Graph sendMail failed: ${String(err)}`);
      // An approval or reminder nobody received. Invisible to the requester,
      // so it has to be visible to operations.
      notificationFailures.add(1, { channel: 'outlook-email' });
      const statusCode = Number((err as any)?.statusCode ?? (err as any)?.status);
      return { ...base, status: 'failed', dryRun: false, detail: String(err),
        retrySafe: statusCode >= 400 && statusCode < 500 && statusCode !== 408 };
    }
  }
}
