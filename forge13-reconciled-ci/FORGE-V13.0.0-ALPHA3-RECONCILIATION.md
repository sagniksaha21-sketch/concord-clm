# FORGE 13.0.0 Alpha 3 — Source Reconciliation

## Provenance

### Pre-APK source from the current chat
The last complete source artifact produced in this chat before the APK-building handoff was:
- `FORGE-V12.0.5-Architecture-Social-Vercel.zip`
- SHA-256: `4f6b4cac87c4b3f3efc8b20411cf5242299af1e190095901bbba059c10dfc582`

The current chat then initiated the Forge 13 React Native migration, but did not produce an independent native source package newer than Alpha 2 before the APK pipeline work began.

### Existing APK source / pipeline
The working GitHub Actions APK pipeline is on:
- repository: `sagniksaha21-sketch/concord-clm`
- branch: `forge13-apk-builder`
- Alpha 2 pipeline commit: `c233fcea1fcf7b51fbcfbc59dec5fdb0b5341ecf`
- embedded source: `forge13-ci/FORGE-V13.0.0-Alpha2-source.tar.gz.b64`
- package version: `13.0.0-alpha.2`

Alpha 2 already contains substantial native work beyond v12.0.5: Expo GL/FHM2 anatomy, programme and training-block editing, smart substitutions, rest notifications, Hall of Fame history, progress-photo studio, workout logging, nutrition, themes, backup/import, Share Studio and YouTube playlist integration.

## Actual gap assessment

| Current-chat v12.0.5 improvement | Alpha 2 status | Alpha 3 action |
|---|---|---|
| Stronger top-left FORGE wordmark with champagne/amber emphasis and forged underline | Partial; Alpha 2 used a smaller badge + plain white wordmark | Merged into native `ForgeBrand` without adding font/runtime dependencies |
| Instagram-ready Share Studio | Present | Preserved |
| Latest personal-record achievement choice | Missing as distinct Share Studio choice | Added |
| Custom achievement / custom headline | Missing | Added |
| Explicit “use latest progress photo” control | Missing; Alpha 2 only preselected a photo | Added and corrected “latest” selection by date |
| Post 4:5 / Story 9:16 | Present | Preserved |
| Native Android share sheet | Present | Preserved |
| Official Google/YouTube playlist bridge | Present, with native OAuth/SecureStore implementation | Preserved unchanged |
| Open selected playlist in YouTube Music | Present | Preserved |
| Architecture cleanup / removal of dead v12 React rewrite | Native architecture already has no v12 DOM/iframe/parallel state tree | No extra port required |
| v12 web/PWA routing, service worker, browser jump-nav fixes | Web-specific | Not copied into native because Expo/React Native supersedes them |

## Non-regression gates
Alpha 3 deliberately preserves:
- native Expo GL/FHM2 3D anatomy
- programme exercise editing and training-block editor
- smart workout substitutions
- rest timer and scheduled Android notifications
- progress photos
- workout logging
- nutrition
- Analytics / Hall of Fame / exercise history
- Black Amber / Graphite / Pure Black themes
- backup import/export
- Share Studio
- Google/YouTube integration
- canonical state key `forge_v2_functional_state_v3`
- Android/Expo build compatibility

## Version decision
Because real source changes were merged after reconciliation, the reconciled build is `13.0.0-alpha.3`, newer than Alpha 2.
