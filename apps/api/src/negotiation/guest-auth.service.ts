import { Injectable, UnauthorizedException, ServiceUnavailableException, HttpException } from '@nestjs/common';
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { PrismaService } from '../persistence/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { isGraphConfigured } from '../notifications/graph.client';
import { AuditService } from '../audit/audit.service';
import { GuestOtpDto } from './negotiation.dto';
import { sendGuestEmail } from './guest-email';
import { escapeEmail } from '../client-requests/request-inbox.service';

export const guestHash = (value: string) => createHash('sha256').update(value).digest('hex');
export const activeInvitation = (row: any) => !!row && !row.revokedAt && row.expiresAt.getTime() > Date.now();
export const guestCookieName = (id: string) => `concord_guest_${id.replace(/-/g,'')}`;
export const guestCookiePath = (id: string) => `/api/negotiation/guest/${id}`;
export const guestRequestToken = (req: any, id: string) => String(req.headers.cookie ?? '').split(';').map(s => s.trim()).find(s => s.startsWith(guestCookieName(id)+'='))?.slice(guestCookieName(id).length+1) ?? '';
@Injectable()
export class GuestAuthService {
  constructor(private readonly prisma: PrismaService, private readonly mail: NotificationsService, private readonly audit: AuditService) {}
  private db() { if (!this.prisma.enabled) throw new ServiceUnavailableException('The secure review room is temporarily unavailable.'); return this.prisma.client; }
  private digest(text: string) { const key = process.env.AUTH_JWT_SECRET; if (!key) throw new ServiceUnavailableException('Guest authentication is unavailable.'); return createHmac('sha256',key).update(`concord-guest:${text}`).digest('hex'); }
  private async limit(key: string, max: number) {
    const hour = Math.floor(Date.now() / 3600000), id = this.digest(`limit:${hour}:${key}`);
    const count = await this.db().guestAuthLimit.upsert({ where: { id }, create: { id, expiresAt: new Date((hour + 2)*3600000) }, update: { count: { increment: 1 } } });
    if (count.count > max) throw new HttpException('Too many attempts. Please try again later.',429);
  }
  async challenge(id: string, email: string, ip: string) {
    await this.limit(`challenge-ip:${ip}`,30); await this.limit(`challenge-invite:${id}`,6);
    if (!isGraphConfigured()) throw new ServiceUnavailableException('Email verification is temporarily unavailable. Ask the Legal team to check email delivery.');
    const challengeId = randomUUID(), code = String(randomInt(0,1000000)).padStart(6,'0');
    const row = await this.db().$transaction(async (tx: any) => {
      await tx.$queryRawUnsafe('SELECT id FROM "GuestInvitation" WHERE id = $1 FOR UPDATE',id);
      const invite = await tx.guestInvitation.findUnique({ where: { id } });
      if (!activeInvitation(invite) || invite.email !== email.trim().toLowerCase() || invite.otpSentAt && Date.now() - invite.otpSentAt.getTime() < 60000) return null;
      await tx.guestInvitation.update({ where: { id }, data: { challengeId, otpHash: this.digest(`${id}:${challengeId}:${code}`), otpExpiresAt: new Date(Date.now()+600000), otpAttempts: 0, otpSentAt: new Date(), otpDelivery: 'sending' } });
      return invite;
    });
    if (row) {
      let result: any;
      try { result = await sendGuestEmail(this.mail,{ to: [row.email], subject: 'Your Concord verification code', html: `<div style="font-family:Arial,sans-serif"><h1>Concord</h1><p>Your verification code is <b>${code}</b>.</p><p>It expires in 10 minutes and works once. Do not share it.</p><p>This code is for ${escapeEmail(row.email)} to enter an agreement review room.</p></div>` }); } catch { /* An unconfirmed send never activates a challenge. */ }
      await this.db().guestInvitation.updateMany({ where: { id, challengeId, revokedAt: null }, data: { otpDelivery: result?.status === 'sent' && !result.dryRun ? 'sent' : 'unconfirmed' } });
    }
    // The same shape is returned for unknown emails and invites. No document metadata is exposed.
    return { challengeId, message: 'If this email has an active invitation, a verification code will arrive shortly.' };
  }
  async actionLimit(id: string) { await this.limit(`guest-actions:${id}`,200); }
  async verify(id: string, dto: GuestOtpDto, ip: string) {
    await this.limit(`verify-ip:${ip}`,60);
    const token = randomBytes(32).toString('base64url');
    const result = await this.db().$transaction(async (tx: any) => {
      await tx.$queryRawUnsafe('SELECT id FROM "GuestInvitation" WHERE id = $1 FOR UPDATE',id);
      const row = await tx.guestInvitation.findUnique({ where: { id } });
      if (!activeInvitation(row) || row.email !== dto.email.trim().toLowerCase() || row.challengeId !== dto.challengeId || row.otpDelivery !== 'sent' || !row.otpHash || !row.otpExpiresAt || row.otpExpiresAt.getTime() <= Date.now() || row.otpAttempts >= 5) return null;
      await tx.guestInvitation.update({ where: { id }, data: { otpAttempts: { increment: 1 } } });
      const expected = this.digest(`${id}:${dto.challengeId}:${dto.code}`);
      if (!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(row.otpHash,'hex'))) return null;
      const expiresAt = new Date(Math.min(Date.now()+8*3600000,row.expiresAt.getTime()));
      await tx.guestSession.create({ data: { hash: guestHash(token), invitationId: id, expiresAt } });
      await tx.guestInvitation.update({ where: { id }, data: { otpHash: null, challengeId: null, otpDelivery: 'consumed' } });
      await this.audit.recordInTransaction(tx,{ action: 'guest.authenticated', entity: 'contract', entityId: row.contractId, summary: 'Invited participant verified their email', metadata: { invitationId: id, email: row.email } });
      return expiresAt;
    });
    if (!result) throw new UnauthorizedException('The code is invalid, used or expired. Check the invited email address or request a new code.');
    return { token, expiresAt: result };
  }
  async authenticate(id: string, token: string, tx?: any) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new UnauthorizedException('Verify your invited email to enter this room.');
    tx ??= this.db();
    const session = await tx.guestSession.findUnique({ where: { hash: guestHash(token) }, include: { invitation: { include: { round: true } } } });
    if (!session || session.invitationId !== id || session.expiresAt.getTime() <= Date.now() || !activeInvitation(session.invitation)) throw new UnauthorizedException('This invitation or session has expired or been revoked. Contact the Legal team.');
    return session.invitation;
  }
  async logout(id: string, token: string) { await this.db().guestSession.deleteMany({ where: { invitationId: id, hash: guestHash(token) } }); return { ok: true }; }
}
