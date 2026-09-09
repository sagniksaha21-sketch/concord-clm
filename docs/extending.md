# Extending Concord — how hard is the next feature?

Short answer: **most new features are easy to moderate**, because the platform was
built as a set of interchangeable parts rather than one tangled program. This doc
explains why, and rates the features you're most likely to ask for next.

---

## Why new features are usually easy

Concord is **modular by construction**, and every external dependency sits behind
a **seam with a fallback**:

- **One pattern per feature.** Each capability is a NestJS *module* — a controller
  (the API routes), a service (the logic), and a module file that wires it in. A
  new capability is a new folder that copies that shape; it doesn't touch the
  others. The UI mirrors this: each screen is one Next.js page under `app/`.
- **Shared types are the contract.** Data shapes live once in
  `packages/shared`. Change a type there and both the API and the web app see it —
  no drift between front and back end.
- **AI and infrastructure are swappable, not baked in.** OCR, embeddings, the
  chat/extraction model, storage, the database and email are each chosen by an
  environment variable, behind an interface with a graceful fallback. Adding a new
  provider (say, a new model) is one adapter file, not a rewrite.
- **It degrades instead of breaking.** No database? In-memory stores. No AI keys?
  Deterministic logic. No Outlook tenant? Dry-run email. So a half-built feature
  never takes the rest down, and you can ship it in stages.
- **It already builds green and is smoke-tested**, with Docker and a CI/CD
  pipeline in place — so shipping a change is a known, repeatable path.

The practical upshot: adding a feature is mostly *following an existing example*,
which is the cheapest kind of software work.

---

## Effort ratings for likely next features

**Easy — a day or so each** (follow an existing pattern)

| Feature | Why it's easy |
|---------|---------------|
| A new extracted field (e.g. renewal notice period, contract value) | Add it to the shared type + extraction prompt + a column; the pipeline already flows it through. |
| A new AI model / provider | One adapter behind the existing `*_PROVIDER` switch. |
| A new report or list view | Copy an existing page + API route. |
| More clause-library / template entries | Data, not code. |
| A new obligation or notification type | The digest + reminder plumbing already exists. |
| Slack / Teams notifications alongside Outlook | A sibling to the notifications service. |
| Export to CSV / Excel | A read endpoint + a formatter. |

**Moderate — a few days to a couple of weeks each**

| Feature | What it involves |
|---------|------------------|
| A new lifecycle stage with its own screen | A module + page + a few type/schema changes. |
| E-signature — ✅ **built (Melento)** | The `esign` module + `/esign` page do exactly this: procure e-stamp, dispatch a signing envelope, notify via Outlook, **auto-nudge late signers**, surface pending signatures as obligations, and **file the executed record into a SHA-256-sealed archive** on completion — with a webhook + a stub mode. Swapping vendor (DocuSign / Aadhaar eSign) is a new adapter behind the same seam. |
| Role-based access control (who can see/do what) | Auth exists (JWT + SSO); this adds roles and per-route checks. |
| An analytics dashboard (spend, cycle time, risk mix) | Aggregation queries + a charts page. |
| Contract/version diffing and redline history | Storage + a compare view. |
| Approval routing rules (who approves what, in order) | A small rules layer on the existing workflow module. |
| Audit log of every action | A cross-cutting write + a viewer. |

**Larger — weeks, and a design decision first**

| Feature | Why it's bigger |
|---------|-----------------|
| Multi-entity / multi-tenant (beyond LLPL) | Touches auth, data isolation and every query. |
| A full visual workflow builder | A generic engine is inherently more than a fixed flow. |
| Real-time multi-user co-editing | Needs live sync infrastructure. |
| Deep two-way ERP/CRM sync (SAP, Zenoti) | Bounded by *their* APIs and data model, not ours. |
| On-device / fully air-gapped deployment | Removes the managed fallbacks; more to self-host. |

---

## What takes care (not hard, but not careless)

- **Database schema changes** run through Prisma migrations — routine, but they're
  real migrations, so they get reviewed and applied deliberately.
- **Production auth hardening** — the login and SSO work; before go-live, roles,
  session policy and secret rotation deserve a proper pass.
- **Anything that crosses many modules at once** (a new tenant boundary, a new
  identity model) is where to slow down and design first.

---

## How to think about scoping the next request

1. **Does it fit an existing pattern?** (new field, new provider, new page, new
   notification) → Easy. Just ask.
2. **Is it a new capability that still lives in one module?** (e-signature, RBAC,
   a dashboard) → Moderate. Worth a short plan first.
3. **Does it change how the whole system is shaped?** (multi-tenant, a generic
   engine, deep external sync) → Larger. Let's scope it together before building.

Because everything is env-switchable and falls back gracefully, we can also ship
most features **behind a flag** and turn them on when you're ready — so adding
capability rarely means risking what already works.
