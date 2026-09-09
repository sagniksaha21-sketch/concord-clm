# Registering the Outlook Actionable Message provider

To make the in-Outlook **Approve / Reject** buttons work for real Lakmē Lever
mailboxes, register Concord as an Actionable Message provider and point it at the
callback endpoint. This is a one-time setup per tenant.

## 1. Register the originator

1. Sign in to the **Actionable Email Developer Dashboard**: <https://aka.ms/publishoam>
   (with a Lakmē Lever / tenant admin account).
2. **New Provider**. The dashboard issues an **Originator Id** (a GUID) — this is
   the authoritative value.
3. Fill in:

   | Field | Value |
   |-------|-------|
   | Friendly name | `Concord CLM` |
   | Sender email address | `clm@lakmelever.com` (the `GRAPH_SENDER_UPN` you send from) |
   | Target URL | your public callback base, e.g. `https://clm.lakmelever.com` |
   | Public key / scope | Test Users first, then Organization |

4. Choose a scope:
   - **Test Users** — a few named mailboxes, for piloting (instant).
   - **Organization** — everyone in the tenant (admin approval).
   - **Global** — external recipients (Microsoft review).

## 2. Configure Concord

Put the issued Originator Id and your public callback URL in `.env`:

```
ACTIONABLE_EMAIL_ORIGINATOR=<originator-guid-from-the-dashboard>
APPROVAL_CALLBACK_URL=https://clm.lakmelever.com
# optional hardening
ACTIONABLE_EMAIL_ALLOWED_SENDERS=clm@lakmelever.com
```

> A generated placeholder you can use until the dashboard issues the real one:
> `499278d3-6304-4864-9db2-ab4f7e4d106c`

The originator is emitted into every card (`notifications/adaptive-card.ts`), and
`APPROVAL_CALLBACK_URL` is used both to build the `Action.Http` target and as the
**token audience** during validation.

## 3. How the callback is secured

When an approver clicks a button, Outlook POSTs to
`/api/contracts/:id/approval/action` with a **bearer JWT**. `verifyActionableToken`
(in `notifications/adaptive-card.ts`) validates it against Microsoft's STS:

- **Signature** — RS256, verified against the JWKS at
  `https://substrate.office.com/sts/common/discovery/keys`.
- **Issuer** — `https://substrate.office.com/sts/`.
- **Audience** — must equal the `Action.Http` target URL (the callback).
- **Sender** — optionally checked against `ACTIONABLE_EMAIL_ALLOWED_SENDERS`.
- **Action performer** — read from the `sub` claim and logged (who approved).

Token verification is **unconditional** — there is no flag to relax it. This
endpoint is public and records a legally significant decision, so an absent or
invalid token is always rejected with `401`, in every environment. (An earlier
build had an `ACTIONABLE_ENFORCE_TOKEN` escape hatch that defaulted off outside
production; a forged decision then consumed the one-shot approval slot and
locked the real approver out. The flag has been removed, not merely defaulted
on.) The authenticated in-app route `POST /api/contracts/:id/approval` is the
alternative path for testing.

Beyond the token, the caller must also **hold the `approve` permission** and be
one of the approvers the contract was actually routed to, within the routing's
validity window. That routing is persisted in Postgres, so it survives restarts,
deploys and callbacks that land on a different replica.

## 4. Requirements checklist

- Email sent from an **Exchange Online** mailbox in the tenant (Graph `sendMail`).
- Callback endpoint is **public HTTPS** (use a tunnel like dev tunnels / ngrok in dev).
- `originator` in the card matches the registered Originator Id.
- Sender address matches a registered sender.
