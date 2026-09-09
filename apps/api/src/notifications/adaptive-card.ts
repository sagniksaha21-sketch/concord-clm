import jwt from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';
import { AiReview, Contract } from '@concord/shared';

/**
 * Outlook Actionable Messages — an Adaptive Card embedded in the email so the
 * approver clicks Approve / Reject *inside Outlook*, with no round-trip to the
 * app. See README for the Actionable Email Developer Dashboard registration
 * (the `originator` id) and the Action.Http callback contract.
 */

export function buildApprovalCard(
  contract: Contract,
  review: AiReview,
  actionUrl: string,
  originator: string,
  reviewUrl: string,
): Record<string, unknown> {
  const highs = review.deviations.filter((d) => d.severity === 'high').length;
  const jsonHeaders = [{ name: 'Content-Type', value: 'application/json' }];

  return {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4',
    originator, // required for email actionable messages
    hideOriginalBody: true,
    body: [
      { type: 'TextBlock', size: 'Large', weight: 'Bolder', wrap: true, text: `Approve renewal — ${contract.title}` },
      { type: 'TextBlock', spacing: 'None', isSubtle: true, wrap: true, text: `${contract.counterparty} · ${contract.id}` },
      {
        type: 'FactSet',
        facts: [
          { title: 'Counterparty', value: contract.counterparty },
          { title: 'Value', value: contract.valueDisplay },
          { title: 'Risk', value: `${review.riskLevel.toUpperCase()} (${review.riskScore}/100)` },
          { title: 'Deviations', value: `${review.deviations.length} (${highs} high)` },
        ],
      },
      { type: 'TextBlock', wrap: true, text: review.summary },
      { type: 'Input.Text', id: 'comment', placeholder: 'Add a note (optional)', isMultiline: true },
    ],
    actions: [
      {
        type: 'Action.Http',
        method: 'POST',
        title: 'Approve',
        url: actionUrl,
        body: JSON.stringify({ contractId: contract.id, decision: 'approved', comment: '{{comment.value}}' }),
        headers: jsonHeaders,
      },
      {
        type: 'Action.Http',
        method: 'POST',
        title: 'Reject',
        url: actionUrl,
        body: JSON.stringify({ contractId: contract.id, decision: 'rejected', comment: '{{comment.value}}' }),
        headers: jsonHeaders,
      },
      { type: 'Action.OpenUrl', title: 'Open in Concord', url: reviewUrl },
    ],
  };
}

/** The refresh card returned to Outlook after the action (CARD-UPDATE-IN-BODY). */
export function buildResultCard(
  contract: Contract,
  decision: string,
): Record<string, unknown> {
  const approved = decision === 'approved';
  return {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4',
    body: [
      { type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: approved ? '✅ Approved' : '❌ Rejected' },
      { type: 'TextBlock', isSubtle: true, wrap: true, text: `${contract.title} — recorded by Concord at ${new Date().toISOString()}` },
    ],
  };
}

/** Embeds the card in the email body; the HTML is the fallback for clients that
 *  don't render actionable messages. */
export function actionableEmailHtml(card: Record<string, unknown>, fallbackHtml: string): string {
  return `<script type="application/adaptivecard+json">\n${JSON.stringify(card)}\n</script>\n${fallbackHtml}`;
}

// ─── Actionable Message token validation ─────────────────────────────────────
// Outlook signs the Action.Http callback with a JWT from the Microsoft
// actionable-message STS. We verify the signature against its JWKS, and check
// issuer + audience (= the action target URL) + optional sender allow-list.

const AM_ISSUER = 'https://substrate.office.com/sts/';
const AM_JWKS_URI = 'https://substrate.office.com/sts/common/discovery/keys';

const jwks = new JwksClient({
  jwksUri: AM_JWKS_URI,
  cache: true,
  cacheMaxAge: 24 * 60 * 60 * 1000,
  rateLimit: true,
});

function getKey(header: jwt.JwtHeader, callback: (err: Error | null, key?: string) => void) {
  jwks.getSigningKey(header.kid as string, (err, key) => {
    if (err || !key) return callback(err ?? new Error('signing key not found'));
    callback(null, key.getPublicKey());
  });
}

export interface TokenCheck {
  valid: boolean;
  sender?: string;
  actionPerformer?: string;
  reason?: string;
}

/**
 * Verifies the bearer token from the Adaptive Card callback for a real tenant.
 * `targetUrl` must equal the Action.Http url (the token audience). Returns who
 * performed the action; never throws (the caller decides how to enforce).
 */
export function verifyActionableToken(
  authHeader: string | undefined,
  targetUrl?: string,
): Promise<TokenCheck> {
  return new Promise((resolve) => {
    if (!authHeader || !/^Bearer\s+/i.test(authHeader)) {
      return resolve({ valid: false, reason: 'missing bearer token' });
    }
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const audience = targetUrl ?? process.env.APPROVAL_CALLBACK_URL;

    jwt.verify(
      token,
      getKey,
      { algorithms: ['RS256'], issuer: AM_ISSUER, audience },
      (err, decoded) => {
        if (err) return resolve({ valid: false, reason: err.message });
        const p = decoded as Record<string, unknown>;
        const allow = (process.env.ACTIONABLE_EMAIL_ALLOWED_SENDERS ?? '')
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        const sender = String(p.sender ?? '').toLowerCase();
        if (allow.length && (!sender || !allow.includes(sender))) {
          return resolve({ valid: false, reason: sender ? `sender ${sender} not allow-listed` : 'token sender missing', sender });
        }
        resolve({ valid: true, sender: String(p.sender ?? ''), actionPerformer: String(p.sub ?? '') });
      },
    );
  });
}
