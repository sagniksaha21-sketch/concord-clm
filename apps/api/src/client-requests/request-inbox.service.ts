import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { AuthUser, can, InboxResult, normalizeRole, NotificationResult } from '@concord/shared';
import { PrismaService } from '../persistence/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { isGraphConfigured } from '../notifications/graph.client';
import { AuditService } from '../audit/audit.service';

export const escapeEmail = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

@Injectable()
export class RequestInboxService {
  private readonly logger = new Logger(RequestInboxService.name);
  constructor(private readonly prisma: PrismaService, private readonly mail: NotificationsService, private readonly audit: AuditService) {}

  async unread(actor: AuthUser): Promise<{ unreadCount: number }> {
    return { unreadCount: this.prisma.enabled ? await this.prisma.client.requestNotification.count({ where: { recipientId: actor.id, readAt: null } }) : 0 };
  }

  async list(actor: AuthUser): Promise<InboxResult> {
    if (!this.prisma.enabled) return { items: [], unreadCount: 0 };
    const [rows, count] = await Promise.all([
      this.prisma.client.requestNotification.findMany({ where: { recipientId: actor.id }, orderBy: { createdAt: 'desc' }, take: 50,
        select: { id: true, requestId: true, title: true, body: true, createdAt: true, readAt: true, emailStatus: true } }),
      this.unread(actor),
    ]);
    return { items: rows.map((r: any) => ({ ...r, createdAt: new Date(r.createdAt).toISOString(), readAt: r.readAt ? new Date(r.readAt).toISOString() : null })), unreadCount: count.unreadCount };
  }

  async markRead(actor: AuthUser, id?: string) {
    if (!this.prisma.enabled) { if (id) throw new NotFoundException('Notification not found.'); return { ok: true }; }
    const db = this.prisma.client;
    if (id && !await db.requestNotification.findFirst({ where: { id, recipientId: actor.id }, select: { id: true } })) throw new NotFoundException('Notification not found.');
    await db.requestNotification.updateMany({ where: { recipientId: actor.id, readAt: null, ...(id ? { id } : {}) }, data: { readAt: new Date() } });
    return { ok: true };
  }

  @Cron('*/30 * * * * *', { name: 'client-request-outlook' })
  async deliverQueued(): Promise<void> {
    if (!this.prisma.enabled) return;
    try {
      const db = this.prisma.client;
      // A crash after sending is ambiguous: never silently send that email a
      // second time. Keep it visible for investigation in the personal inbox.
      await db.requestNotification.updateMany({ where: { emailStatus: 'sending', leaseUntil: { lt: new Date() } }, data: { emailStatus: 'uncertain', claimToken: null, lastError: 'Delivery was interrupted; provider acceptance is unconfirmed.' } });
      if (!isGraphConfigured()) return;
      const rows = await db.requestNotification.findMany({ where: { emailStatus: { in: ['queued', 'awaiting-configuration', 'failed'] }, attempts: { lt: 5 }, nextAttemptAt: { lte: new Date() } }, take: 10, orderBy: { createdAt: 'asc' }, select: { id: true } });
      for (const row of rows) await this.deliver(row.id);
    } catch { this.logger.error('Request notification delivery is delayed; saved inbox items remain available.'); }
  }

  async deliver(id: string): Promise<void> {
    if (!this.prisma.enabled || !isGraphConfigured()) return;
    const db = this.prisma.client;
    const claimToken = randomUUID();
    const claimed = await db.requestNotification.updateMany({ where: { id, emailStatus: { in: ['queued', 'awaiting-configuration', 'failed'] }, attempts: { lt: 5 }, nextAttemptAt: { lte: new Date() } },
      data: { emailStatus: 'sending', claimToken, leaseUntil: new Date(Date.now() + 120_000), attempts: { increment: 1 } } });
    if (!claimed.count) return;
    const row = await db.requestNotification.findUnique({ where: { id }, include: { recipient: { select: { id: true, email: true, role: true } }, request: { select: { id: true, assignedLegalUserId: true } } } });
    if (!row || row.claimToken !== claimToken) return;
    if (row.recipientId !== row.request.assignedLegalUserId || !can(normalizeRole(row.recipient.role), 'request:manage')) {
      await db.requestNotification.updateMany({ where: { id, claimToken, emailStatus: 'sending' }, data: { emailStatus: 'failed', attempts: 5, claimToken: null, leaseUntil: null, lastError: 'The selected legal account is no longer eligible for assignment.' } });
      return;
    }
    let result: NotificationResult | undefined;
    let timer: NodeJS.Timeout | undefined;
    try {
      const origin = new URL((process.env.WEB_ORIGIN || 'http://localhost:3000').split(',')[0].trim());
      if (!['https:', 'http:'].includes(origin.protocol)) throw new Error('Invalid application origin');
      const link = `${origin.origin}/requests/${encodeURIComponent(row.requestId)}`;
      result = await Promise.race([
        this.mail.sendEmail({ to: [row.recipient.email], subject: row.title, html: `<div style="font-family:Arial,sans-serif;color:#241e12;max-width:620px"><h1 style="color:#a17d1c">Concord</h1><h2>${escapeEmail(row.title)}</h2><p>${escapeEmail(row.body)}</p><p><a href="${escapeEmail(link)}">Open request and term sheet</a></p><p>Sign in with your own Concord account to review this request.</p><hr><small>Lakmē Legal for Lakmē Lever</small></div>` }),
        new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), 30_000); }),
      ]);
    } catch { /* An uncertain remote result must never be labelled sent. */ }
    finally { if (timer) clearTimeout(timer); }
    // Only explicit provider rejection is automatically retryable. A timeout,
    // lost connection or unknown response may already have been accepted.
    const status = result?.status === 'sent' ? 'sent' : result?.status === 'dry-run' ? 'awaiting-configuration' : result?.status === 'failed' && result.retrySafe ? 'failed' : 'uncertain';
    await db.$transaction(async (tx: any) => {
      const changed = await tx.requestNotification.updateMany({ where: { id, claimToken, emailStatus: 'sending' }, data: { emailStatus: status,
        sentAt: status === 'sent' ? new Date() : null, claimToken: null, leaseUntil: null,
        nextAttemptAt: new Date(Date.now() + Math.min(60, 2 ** row.attempts) * 60_000),
        lastError: status === 'sent' ? null : status === 'awaiting-configuration' ? 'Microsoft Graph setup is required.' : 'Outlook has not confirmed delivery.' } });
      if (changed.count) await this.audit.recordInTransaction(tx, { action: 'request.outlook_delivery', entity: 'intake', entityId: row.requestId,
        summary: `Assigned-lawyer Outlook notification: ${status}`, metadata: { notificationId: id, recipientId: row.recipientId, status, attempt: row.attempts } });
    }, { timeout: 15_000, maxWait: 10_000 });
  }
}
