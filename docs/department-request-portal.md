# Department agreement requests

Concord’s `/requests` workspace lets department clients submit a structured term sheet and select a named legal team member. It uses the existing Next.js frontend, NestJS API, PostgreSQL database and authenticated session. It is not a separate public form.

## Access and onboarding

An administrator opens **Tools & settings → Team & access** (`/team`), adds each colleague’s corporate name and Microsoft email, and selects their role:

- **Department client**: creates and reads their own agreement requests and personal inbox. No contract portfolio, AI review, repository, reports, approvals, signature, audit or user-administration access.
- **Counsel**: appears in the legal dropdown; sees requests they raised or were assigned and can update requests assigned to them.
- **Legal Lead / Administrator**: appears in the legal dropdown and can oversee all client requests.
- **Viewer / Approver**: existing legal-workspace permissions remain unchanged; these roles do not appear in the lawyer dropdown.

New accounts created here have no password and use Microsoft Entra sign-in. The administrator must connect corporate SSO before these accounts can sign in. Existing staging password accounts remain supported. This feature does not send account invitations or accept self-registration. Alternatively, IT can assign the exact Entra application role `Concord.Requester` or map an appropriate group to `requester` through the existing `ENTRA_ROLE_MAP` configuration. Existing explicit Concord access grants are preserved during SSO.

Share the application’s `/requests` link. Clients choose **Request an agreement**, complete three steps, select their legal contact and submit. They return to the same workspace to see the selected lawyer, submitted terms, requested date, client-facing status and legal-team note. Each account sees its own requests, including when opening a direct link from an email. This release does not share all requests with every colleague in the same department. Clients can contact their selected lawyer by email for additional information; the submitted term sheet remains preserved.

## Microsoft connection

Microsoft Entra sign-in requires the existing `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET` and `ENTRA_REDIRECT_URI` configuration. Register the deployed application’s `/api/auth/sso/callback` as the web redirect URI. Configure the deployment’s `WEB_ORIGIN` to its user-facing HTTPS origin. Requests and inbox links survive the sign-in redirect through a strictly limited local return-path allowlist.

Outlook sending uses the existing Microsoft Graph integration: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, and `GRAPH_SENDER_UPN`. The Microsoft application requires administrator-approved **Mail.Send** application permission. Scope the sending identity to the intended mailbox using the organisation’s Exchange access controls. Values belong in the deployment’s secret configuration, never in this repository. Graph and SSO have separate configuration names and must both be checked.

The Team & Access screen reports configuration presence, not a verified Microsoft connection. A real tenant login and an assignment received in the intended Outlook mailbox remain the acceptance checks after IT connects Microsoft. No provider secrets, tenant access or real employee directory are included in this feature.

## Persistence and notifications

A submission commits the intake request, linked Contract record, term sheet, assigned lawyer, personal notification and audit event in one PostgreSQL transaction. A UUID submission key and payload hash prevent a retried submission from creating another agreement. The same submission key with a different payload or owner returns a conflict. The backend validates the selected lawyer against the saved user directory; clients cannot supply their own requester identity.

The lawyer’s personal inbox (`/inbox`) is available immediately after commit. The bell refreshes on navigation and every 30 seconds while the page is visible. A durable outbox attempts Outlook delivery every 30 seconds. Pending email survives restarts and deployments. Without Graph configuration the email remains **Outlook setup required**, while the in-app notification remains available. Connecting Graph allows queued assignments to be attempted; review pending test or obsolete assignments before enabling it.

Only explicit safe provider rejection is retried, up to five attempts with backoff. Worker claims prevent simultaneous application workers from delivering the same queued item. Timeouts, connection loss and expired sending leases remain **delivery unconfirmed**, because Microsoft may already have accepted the email. They are not automatically re-sent. Microsoft’s accepted sendMail response is labelled **Accepted by Outlook**; it does not prove final mailbox delivery or that the recipient read it. Operations should investigate failed or unconfirmed deliveries before deciding on any manual follow-up.

The selected lawyer, a lead or an administrator can update the client-facing status and note. Updates use a version check to prevent stale overwrites and create an in-app notification for the request’s owner. They do not approve, sign, execute or otherwise move the linked agreement’s legal workflow. No AI-generated legal terms are substituted for the client’s inputs.

## Deployment and verification

The legal workspace has six main destinations: Home, Requests, Agreements, Inbox, Repository and Obligations. Specialist functions remain available through Tools & settings, the mobile More sheet and search. Department clients see Requests and Inbox. Agreements opens a list by default; the lifecycle board is an optional view. General portfolio links open `/contracts/[id]`, which shows saved details and a suggested next step without automatically invoking AI review. Optional request fields are expandable. Signing and obligation links preserve the chosen agreement; all legal stage transitions continue through the existing controlled APIs.

Request allocation consumes sequence values already occupied by records seeded or imported after migrations. It never resets the sequence or overwrites existing requests. The PostgreSQL regression suite reproduces migrate-then-seed ordering and concurrent submissions.

Migration `20260911060000_department_requests` adds nullable linked-request fields and a persistent notification table; existing intake rows remain compatible. Run the standard Prisma migration before starting the new API. Railway already applies migrations during API pre-deploy. Keep the GitHub-source build configuration; no historical archive extraction is needed.

The test suite includes DTO/calendar validation, request-only RBAC, safe sign-in redirects, and email retry classification. CI runs additional PostgreSQL tests against the dedicated disposable `concord_requests_test` database: linked records and audit, concurrent submission retries, rollback, ownership, assignee eligibility, stale update rejection, notification isolation, outbox claims/retries/crash recovery, and account provisioning/current-session roles. The database tests require `REQUEST_TEST_DATABASE_URL` and refuse cleanup outside localhost and that exact test database name.

Manual acceptance after deploying: sign in with a department identity; submit a clearly identified test term sheet; open it as the selected lawyer; verify the linked agreement and inbox; update its client status; confirm the client notification; verify actual Outlook receipt when Graph is connected. Check both Concord themes and mobile widths 360, 390, 430, tablet and desktop. Automated builds and API tests do not replace this authenticated visual and provider delivery pass.
