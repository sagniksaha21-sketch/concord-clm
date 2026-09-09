import { AiReview, Contract, Obligation, SignatureRequest, Signatory } from '@concord/shared';

/**
 * HTML-escapes untrusted values. Contract titles, signatory names, notes and
 * audit details originate from user input and are rendered into HTML that is
 * emailed AND served from the API origin (execution certificate) — unescaped
 * interpolation here is stored XSS.
 */
function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


const GOLD = '#A9812E';
const INK = '#211D16';

/** The HTML body of a Melento e-signature request email to a signatory. */
export function signatureRequestHtml(req: SignatureRequest, signer: Signatory): string {
  const stamp = req.stampPaper
    ? `<p style="margin:0 0 6px"><b>e-Stamp:</b> ${esc(req.stampPaper.state)} · ₹${req.stampPaper.dutyAmount.toLocaleString('en-IN')}${req.stampPaper.certificateNo ? ` · ${req.stampPaper.certificateNo}` : ''}</p>`
    : '';
  return `
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;color:${INK};line-height:1.55">
    <div style="border-bottom:3px solid ${GOLD};padding-bottom:10px;margin-bottom:16px">
      <span style="font-size:12px;letter-spacing:2px;color:${GOLD};font-weight:700">CONCORD · LAKMĒ LEVER CLM</span>
    </div>
    <h2 style="font-size:18px;margin:0 0 12px">✍️ Signature requested — ${esc(req.contractTitle)}</h2>
    <p style="margin:0 0 6px">Hello ${esc(signer.name)},</p>
    <p style="margin:0 0 6px">You are requested to sign as <b>${esc(signer.role)}</b>.</p>
    ${req.message ? `<p style="margin:0 0 6px">${esc(req.message)}</p>` : ''}
    ${esc(stamp)}
    <p style="margin:14px 0"><a href="${req.signingUrl ?? '#'}" style="display:inline-block;background:${GOLD};color:#241a06;text-decoration:none;font-weight:700;padding:11px 20px;border-radius:8px">Review &amp; sign in Melento →</a></p>
    <p style="font-size:11px;color:#8b8271;margin-top:20px">Sent by Concord via Melento e-sign. Illustrative concept notification.</p>
  </div>`;
}

function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

function riskColor(risk: string): string {
  return risk === 'high' ? '#C23B34' : risk === 'medium' ? '#CE7A1F' : '#2C8A6A';
}

/**
 * The HTML body of the scheduled obligations / renewals digest — one Outlook
 * email summarising every key date coming due inside the window, sorted by
 * urgency. Sent on a schedule by the API (see ObligationsService).
 */
export function obligationsDigestHtml(obligations: Obligation[], windowDays: number): string {
  const sorted = [...obligations].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const rows = sorted
    .map((o) => {
      const d = daysUntil(o.dueDate);
      const when = d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? 'due today' : `in ${d}d`;
      const whenColor = d <= 7 ? '#C23B34' : d <= 30 ? '#CE7A1F' : '#6b6250';
      return `
      <tr>
        <td style="padding:9px 10px;border-bottom:1px solid #Eee7d4">
          <b>${esc(o.title)}</b><br>
          <span style="color:#8b8271;font-size:12px">${esc(o.contractTitle)} · ${esc(o.contractId)}</span>
        </td>
        <td style="padding:9px 10px;border-bottom:1px solid #EEe7d4;white-space:nowrap">${esc(o.dueDate)}<br>
          <span style="color:${whenColor};font-weight:700;font-size:12px">${when}</span>
        </td>
        <td style="padding:9px 10px;border-bottom:1px solid #EEe7d4;text-transform:capitalize">${esc(o.type)}</td>
        <td style="padding:9px 10px;border-bottom:1px solid #EEe7d4">
          <span style="color:${riskColor(o.risk)};font-weight:700;text-transform:uppercase;font-size:12px">${o.risk}</span>
        </td>
        <td style="padding:9px 10px;border-bottom:1px solid #EEe7d4;font-size:12px">${esc(o.ownerEmail)}</td>
      </tr>`;
    })
    .join('');

  const highs = sorted.filter((o) => o.risk === 'high').length;
  const soon = sorted.filter((o) => daysUntil(o.dueDate) <= 14).length;

  return `
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:720px;color:${INK};line-height:1.55">
    <div style="border-bottom:3px solid ${GOLD};padding-bottom:10px;margin-bottom:16px">
      <span style="font-size:12px;letter-spacing:2px;color:${GOLD};font-weight:700">CONCORD · LAKMĒ LEVER CLM</span>
    </div>
    <h2 style="font-size:19px;margin:0 0 6px">📅 Obligations & renewals — next ${windowDays} days</h2>
    <p style="margin:0 0 14px;color:#6b6250">
      ${sorted.length} key date${sorted.length === 1 ? '' : 's'} coming due
      &nbsp;·&nbsp; <b style="color:#C23B34">${highs}</b> high-risk
      &nbsp;·&nbsp; <b style="color:#CE7A1F">${soon}</b> within 14 days
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="text-align:left;color:#8b8271;font-size:11px;letter-spacing:1px;text-transform:uppercase">
          <th style="padding:6px 10px">Obligation</th>
          <th style="padding:6px 10px">Due</th>
          <th style="padding:6px 10px">Type</th>
          <th style="padding:6px 10px">Risk</th>
          <th style="padding:6px 10px">Owner</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="5" style="padding:12px;color:#8b8271">No obligations in this window.</td></tr>'}</tbody>
    </table>
    <p style="font-size:11px;color:#8b8271;margin-top:20px">Sent automatically by Concord via Microsoft Graph on a schedule. This is an illustrative concept notification.</p>
  </div>`;
}

/** The HTML body of an Outlook obligation / key-date reminder. */
export function obligationEmailHtml(o: Obligation): string {
  return `
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;color:${INK};line-height:1.55">
    <div style="border-bottom:3px solid ${GOLD};padding-bottom:10px;margin-bottom:16px">
      <span style="font-size:12px;letter-spacing:2px;color:${GOLD};font-weight:700">CONCORD · LAKMĒ LEVER CLM</span>
    </div>
    <h2 style="font-size:18px;margin:0 0 12px">⏰ Reminder: ${esc(o.title)}</h2>
    <p style="margin:0 0 6px"><b>Contract:</b> ${esc(o.contractTitle)} (${esc(o.contractId)})</p>
    <p style="margin:0 0 6px"><b>Due:</b> ${esc(o.dueDate)} &nbsp;·&nbsp; <b>Type:</b> ${esc(o.type)}</p>
    <p style="margin:0 0 14px"><b>Owner:</b> ${esc(o.ownerEmail)}</p>
    <p style="font-size:11px;color:#8b8271;margin-top:20px">Sent automatically by Concord via Microsoft Graph. This is an illustrative concept notification.</p>
  </div>`;
}

/**
 * The executed-document record filed into the signed archive on completion — a
 * self-contained certificate of execution: parties, signing timestamps, the
 * e-stamp, the envelope, and the full audit trail.
 */
export function executionCertificateHtml(req: SignatureRequest): string {
  const rows = req.signatories
    .map(
      (s) => `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #EEE7D4"><b>${esc(s.name)}</b><br><span style="color:#8b8271;font-size:12px">${esc(s.role)}</span></td>
        <td style="padding:8px 10px;border-bottom:1px solid #EEE7D4;color:#2C8A6A;font-weight:700">Signed</td>
        <td style="padding:8px 10px;border-bottom:1px solid #EEE7D4;font-size:12px">${s.signedAt ? new Date(s.signedAt).toUTCString() : '—'}</td>
      </tr>`,
    )
    .join('');
  const audit = req.audit
    .map((e) => `<li style="margin:2px 0"><b style="text-transform:capitalize">${esc(e.event)}</b> — ${new Date(e.at).toUTCString()}${e.by ? ` · ${esc(e.by)}` : ''}${e.detail ? ` · ${esc(e.detail)}` : ''}</li>`)
    .join('');
  const stamp = req.stampPaper
    ? `<p style="margin:4px 0"><b>e-Stamp:</b> ${esc(req.stampPaper.state)} · ₹${req.stampPaper.dutyAmount.toLocaleString('en-IN')} · ${esc(req.stampPaper.certificateNo ?? '—')}</p>`
    : '<p style="margin:4px 0;color:#8b8271">No stamp paper attached.</p>';
  return `<!doctype html><html><head><meta charset="utf-8"><title>Executed — ${esc(req.contractTitle)}</title></head>
  <body style="font-family:Segoe UI,Arial,sans-serif;max-width:720px;margin:24px auto;color:${INK};line-height:1.55;padding:0 16px">
    <div style="border-bottom:3px solid ${GOLD};padding-bottom:10px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:baseline">
      <span style="font-size:12px;letter-spacing:2px;color:${GOLD};font-weight:700">CONCORD · LAKMĒ LEVER CLM</span>
      <span style="font-size:11px;color:#8b8271">CERTIFICATE OF EXECUTION</span>
    </div>
    <h1 style="font-size:22px;margin:0 0 4px">${esc(req.contractTitle)}</h1>
    <p style="margin:0 0 14px;color:#6b6250">${esc(req.contractId)} · Envelope ${esc(req.envelopeId ?? '—')} · Executed ${req.completedAt ? new Date(req.completedAt).toUTCString() : '—'}</p>
    <div style="background:#F6EEDA;border:1px solid #E6D9B4;border-radius:10px;padding:12px 14px;margin:0 0 16px">
      ${esc(stamp)}
      <p style="margin:4px 0"><b>Provider:</b> Melento e-sign${req.provider === 'stub' ? ' (demo)' : ''}</p>
    </div>
    <h3 style="font-size:14px;margin:0 0 6px">Signatories</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px"><tbody>${rows}</tbody></table>
    <h3 style="font-size:14px;margin:0 0 6px">Audit trail</h3>
    <ul style="font-size:12.5px;color:#4a4438;padding-left:18px">${audit}</ul>
    <p style="font-size:11px;color:#8b8271;margin-top:20px">Sealed by Concord on completion. Integrity is protected by a SHA-256 checksum recorded in the archive. Illustrative concept — not a live executed contract.</p>
  </body></html>`;
}

/** A reminder nudge to a signatory who hasn't signed within the SLA. */
export function signatureNudgeHtml(req: SignatureRequest, signer: Signatory, daysWaiting: number): string {
  return `
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;color:${INK};line-height:1.55">
    <div style="border-bottom:3px solid ${GOLD};padding-bottom:10px;margin-bottom:16px">
      <span style="font-size:12px;letter-spacing:2px;color:${GOLD};font-weight:700">CONCORD · LAKMĒ LEVER CLM</span>
    </div>
    <h2 style="font-size:18px;margin:0 0 12px">⏰ Reminder — your signature is awaited</h2>
    <p style="margin:0 0 6px">Hello ${esc(signer.name)},</p>
    <p style="margin:0 0 6px">The agreement <b>${esc(req.contractTitle)}</b> has been awaiting your signature as <b>${esc(signer.role)}</b> for <b>${daysWaiting} day${daysWaiting === 1 ? '' : 's'}</b>.</p>
    <p style="margin:14px 0"><a href="${req.signingUrl ?? '#'}" style="display:inline-block;background:${GOLD};color:#241a06;text-decoration:none;font-weight:700;padding:11px 20px;border-radius:8px">Sign now in Melento →</a></p>
    <p style="font-size:11px;color:#8b8271;margin-top:20px">Automatic reminder from Concord. This is an illustrative concept notification.</p>
  </div>`;
}

/**
 * The HTML body of the Outlook approval notice. Kept inline-styled so it renders
 * consistently in Outlook desktop / web / mobile.
 *
 * To upgrade this to a one-click *actionable message* (Approve button rendered
 * inside Outlook), attach an Adaptive Card via the
 * `application/vnd.microsoft.card.adaptive` payload and register an Actionable
 * Email provider in Entra — the `reviewUrl` deep link below is the fallback.
 */
export function approvalEmailHtml(
  contract: Contract,
  review: AiReview,
  reviewUrl: string,
  note?: string,
): string {
  const highs = review.deviations.filter((d) => d.severity === 'high').length;
  const meds = review.deviations.filter((d) => d.severity === 'medium').length;
  const riskColor =
    review.riskLevel === 'high'
      ? '#C23B34'
      : review.riskLevel === 'medium'
        ? '#CE7A1F'
        : '#2C8A6A';

  return `
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;color:${INK};line-height:1.55">
    <div style="border-bottom:3px solid ${GOLD};padding-bottom:10px;margin-bottom:16px">
      <span style="font-size:12px;letter-spacing:2px;color:${GOLD};font-weight:700">CONCORD · LAKMĒ LEVER CLM</span>
    </div>
    <h2 style="font-size:18px;margin:0 0 12px">⚑ Action needed: approve renewal — ${esc(contract.title)}</h2>
    <p style="margin:0 0 6px"><b>Counterparty:</b> ${esc(contract.counterparty)}</p>
    <p style="margin:0 0 6px"><b>Value:</b> ${contract.valueDisplay} &nbsp;·&nbsp; <b>Reference:</b> ${contract.id} (${contract.version})</p>
    <p style="margin:0 0 6px"><b>Risk:</b> <span style="color:${riskColor};font-weight:700;text-transform:uppercase">${esc(review.riskLevel)}</span> — score ${review.riskScore}/100</p>

    <div style="background:#F6EEDA;border:1px solid #E6D9B4;border-radius:10px;padding:12px 14px;margin:14px 0">
      <b>AI summary</b><br>${esc(review.summary)}<br>
      <span style="color:#6b6250">${highs} high · ${meds} medium deviation(s) from the LLPL playbook. Redlines drafted.</span>
    </div>

    ${note ? `<p style="margin:0 0 14px"><b>Note:</b> ${note}</p>` : ''}

    <a href="${reviewUrl}" style="display:inline-block;background:${GOLD};color:#241a06;text-decoration:none;font-weight:700;padding:11px 20px;border-radius:8px">Open in Concord AI Review →</a>

    <p style="font-size:11px;color:#8b8271;margin-top:20px">Sent automatically by Concord via Microsoft Graph. This is an illustrative concept notification.</p>
  </div>`;
}
