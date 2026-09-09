# PWA security & offline-caching policy

**Closes / evidences:** assessment finding **H3 — PWA security and offline policy**, and the
checklist item "Confidential documents are excluded from offline caching unless explicitly
approved; logout clears sensitive caches."

**Status:** Policy set (this document). The prototype describes a mobile PWA/Teams/Outlook
surface; a full manifest + service worker is **not** implemented in the reviewed bundle. This
policy governs that implementation when it is built, so the offline story is a decision, not an
accident.

---

## Principle

The PWA exists for **convenience of access**, never for **offline custody of confidential
contract content**. Contract bodies, executed documents, extracted party data (PAN/GSTIN) and
audit content are confidential; none of them may sit in a browser cache on a device that could
be lost, shared or unmanaged.

## Caching rules

| Content class | Cache policy |
|---|---|
| App shell (HTML/CSS/JS, icons, fonts) | **Cache-first**, versioned — safe, non-confidential |
| Reference/config (clause library labels, template names) | **Stale-while-revalidate**, short TTL |
| Contract bodies & executed documents | **Never cached.** `Cache-Control: no-store`; not added to any service-worker cache |
| Extracted party data / repository answers | **Network-only**; not persisted client-side |
| Signed download links | Never cached; they are short-lived by design and must re-mint |
| Auth tokens | Session/memory only; never in a service-worker cache |

Implementation notes:

- The service worker uses an **explicit allow-list** for caching (app shell + static assets
  only). It must **not** use a blanket "cache every GET" runtime handler — that is how
  confidential document responses leak into a cache.
- API responses carrying confidential content already set `no-store` at the server; the service
  worker additionally refuses to cache any `/api/**` response.
- Range/streamed document responses (`/api/esign/archive/**`, `/api/documents/**`) are bypassed
  by the service worker entirely.

## Logout & session end

- On logout, the client clears `localStorage`/`sessionStorage`, the `concord_token` cookie, and
  **calls `caches.delete()` for every Concord cache** so no confidential fragment survives.
- Session expiry (8h JWT) forces re-authentication; a re-auth revalidates the app shell and
  discards any stale reference cache.

## Device & offline posture

- **Managed devices only** for the confidential experience — Entra Conditional Access + device
  compliance (MDM/Intune) gate the PWA install and use, owned by IT.
- **Offline is read-limited**: only non-confidential app shell and metadata are available
  offline. There is no offline mode that displays contract bodies.
- **Offline expiry**: cached reference data expires within a short window (e.g. 15 minutes) so a
  device offline for long cannot rely on stale data.

## What must be verified before enabling the PWA in production

1. Service-worker cache allow-list reviewed — no `/api/**` or document routes cacheable.
2. Logout cache-clear tested (`caches.keys()` empty after logout).
3. Conditional Access + device-compliance policy enforced for install/use.
4. Penetration test includes an offline-cache inspection (confirm no confidential residue).

Until these are evidenced (owner: IT), the PWA is a **convenience shell only** and confidential
processing stays in the authenticated online portal.
