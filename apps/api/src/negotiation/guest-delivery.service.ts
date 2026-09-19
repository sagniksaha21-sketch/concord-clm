import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { PrismaService } from '../persistence/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { isGraphConfigured } from '../notifications/graph.client';
import { activeInvitation } from './guest-auth.service';
import { sendGuestEmail } from './guest-email';
import { escapeEmail } from '../client-requests/request-inbox.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class GuestDeliveryService {
  constructor(private readonly prisma: PrismaService, private readonly mail: NotificationsService, private readonly audit: AuditService) {}
  @Cron('15 * * * * *',{ name: 'negotiation-invitations' })
  async queued() {
    if (!this.prisma.enabled) return;
    const db = this.prisma.client;
    await db.guestDelivery.updateMany({ where: { status: 'sending', leaseUntil: { lt: new Date() } }, data: { status: 'uncertain', claimToken: null } });
    await db.guestAuthLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await db.guestSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    if (!isGraphConfigured()) return;
    const rows = await db.guestDelivery.findMany({ where: { status: { in: ['queued','retry','awaiting-configuration'] }, attempts: { lt: 5 }, nextAttemptAt: { lte: new Date() } }, orderBy: { createdAt: 'asc' }, take: 10 });
    for (const row of rows) await this.deliver(row.id);
  }
  async deliver(id: string) {
    if (!this.prisma.enabled || !isGraphConfigured()) return;
    const db = this.prisma.client, claimToken = randomUUID();
    const claim = await db.guestDelivery.updateMany({ where: { id, status: { in: ['queued','retry','awaiting-configuration'] }, attempts: { lt: 5 }, nextAttemptAt: { lte: new Date() } }, data: { status: 'sending', attempts: { increment: 1 }, claimToken, leaseUntil: new Date(Date.now()+120000) } });
    if (!claim.count) return;
    const row = await db.guestDelivery.findUnique({ where: { id }, include: { invitation: { include: { contract: { select: { title: true } } } } } });
    if (!row || row.claimToken !== claimToken) return;
    if (!activeInvitation(row.invitation) || row.invitation.roundId !== row.roundId) { await db.guestDelivery.updateMany({ where: { id, claimToken }, data: { status: 'cancelled', claimToken: null } }); return; }
    let result: any;
    try {
      const origin = new URL((process.env.WEB_ORIGIN || 'http://localhost:3000').split(',')[0].trim());
      if (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:') throw new Error('Secure origin required');
      const url = `${origin.origin}/negotiate/${row.invitationId}`;
      const update = row.kind === 'legal-response' ? 'Lakmē Legal has responded in the shared discussion.' : row.kind === 'new-version' ? 'Lakmē Legal has shared a new version for your review.' : 'Lakmē Legal has shared an agreement for your review.';
      result = await sendGuestEmail(this.mail,{ to: [row.invitation.email], subject: `Concord agreement review: ${row.invitation.contract.title}`, html: `<div style="font-family:Arial,sans-serif"><h1>Concord</h1><h2>${escapeEmail(row.invitation.contract.title)}</h2><p>${update}</p><p><a href="${escapeEmail(url)}">Enter secure agreement review</a></p><p>Verify ${escapeEmail(row.invitation.email)} with the one-time code sent to your inbox. Access expires ${row.invitation.expiresAt.toISOString().slice(0,10)}.</p></div>` });
    } catch { /* Uncertain provider acceptance is never automatically retried. */ }
    const status = result?.status === 'sent' && !result.dryRun ? 'sent' : result?.status === 'dry-run' ? 'awaiting-configuration' : result?.status === 'failed' && result.retrySafe ? 'retry' : 'uncertain';
    await db.$transaction(async (tx: any) => {
      const saved = await tx.guestDelivery.updateMany({ where: { id, claimToken, status: 'sending' }, data: { status, claimToken: null, leaseUntil: null, nextAttemptAt: new Date(Date.now()+60000*Math.pow(2,row.attempts)) } });
      if (saved.count) await this.audit.recordInTransaction(tx,{ action: 'negotiation.email_delivery', entity: 'contract', entityId: row.invitation.contractId, summary: `External notification delivery: ${status}`, metadata: { invitationId: row.invitationId, deliveryId: id, kind: row.kind, status, attempt: row.attempts } });
    });
  }
}
