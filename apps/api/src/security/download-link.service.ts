import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

export interface LinkVerdict {
  valid: boolean;
  reason?: string;
}

/**
 * Short-lived, signed download links (assessment finding H2).
 *
 * An executed document is served only via a link that carries an HMAC over
 * `resourceId + expiry`. Links expire (default 5 min) and cannot be forged
 * without the server secret, so a bare, guessable URL is never enough to pull a
 * signed contract.
 */
@Injectable()
export class DownloadLinkService {
  private get secret(): string {
    return process.env.DOWNLOAD_LINK_SECRET || process.env.AUTH_JWT_SECRET || 'dev-secret-change-me';
  }

  private get defaultTtl(): number {
    return Number(process.env.DOWNLOAD_LINK_TTL_SECONDS || 300);
  }

  /** Returns `{ exp, token }` for a resource; embed both in the download URL. */
  sign(resourceId: string, ttlSeconds?: number): { exp: number; token: string } {
    const exp = Math.floor(Date.now() / 1000) + (ttlSeconds ?? this.defaultTtl);
    return { exp, token: this.compute(resourceId, exp) };
  }

  verify(resourceId: string, exp: number | string, token: string): LinkVerdict {
    const expNum = Number(exp);
    if (!token || !Number.isFinite(expNum)) return { valid: false, reason: 'missing token or expiry' };
    if (expNum < Math.floor(Date.now() / 1000)) return { valid: false, reason: 'link expired' };
    const expected = this.compute(resourceId, expNum);
    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { valid: false, reason: 'bad signature' };
    }
    return { valid: true };
  }

  private compute(resourceId: string, exp: number): string {
    return createHmac('sha256', this.secret).update(`${resourceId}.${exp}`).digest('hex');
  }
}
