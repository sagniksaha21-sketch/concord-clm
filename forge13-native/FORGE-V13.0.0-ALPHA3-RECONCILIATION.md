# FORGE 13.0.0 Alpha 3 — Clean Source Reconciliation

## Alpha 2 preserved
Alpha 2 at Git commit `c233fcea1fcf7b51fbcfbc59dec5fdb0b5341ecf` remains the untouched rollback point. It already contained the proven native Android foundation: 85 exercises, 14 programmes, programme/block editing, block periodization, smart substitutions, workout logging, Hall of Fame/history, native Expo GL/FHM2 anatomy, rest timer + Android local notifications, progress photos, nutrition, analytics, three themes, backup/import, Share Studio, and Google/YouTube integration.

## Newer valid work found in this chat
The last complete pre-native source was v12.0.5. Source reconciliation found only a small set of valid product deltas not already represented in Alpha 2: stronger FORGE identity, a distinct latest-PR share-card choice, custom achievement copy, an explicit latest-progress-photo action, and date-correct latest-photo selection. Web-only service worker/DOM/iframe fixes were intentionally omitted because they do not apply to React Native.

## Alpha 3 merge
Those valid deltas are merged directly into the native source tree. No base64/tar overlay is used. The package and Expo version are `13.0.0-alpha.3`.

## Intentionally omitted
Only web/PWA-specific code that React Native supersedes: browser service worker, DOM jump-nav patches, iframe shell, and Vercel-only routing. No native feature was removed.
