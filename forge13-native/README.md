# FORGE 13 — Native Android Alpha 3

FORGE 13 is the Android-first React Native / Expo successor built alongside the production-safe FORGE v12.0.5 PWA. It is a native app, not a WebView wrapper.

## Alpha 3 source baseline
This tree is the clean reconciled successor to the proven Alpha 2 Android build. The Alpha 2 rollback commit remains `c233fcea1fcf7b51fbcfbc59dec5fdb0b5341ecf` and is not overwritten.

Alpha 3 preserves the complete Alpha 2 feature set and merges only the valid newer chat work: stronger FORGE identity, latest-PR and custom Share Studio achievements, explicit latest-progress-photo selection, and timestamp-correct photo choice.

There is no base64/tar source reconstruction and no overlay mechanism in the Alpha 3 build pipeline.

## Native feature set
- Five native tabs: Today, Train, Nutrition, Analytics, More.
- Native workout logging with weight / reps / RIR, saved sessions and exercise history.
- Canonical 85-exercise / 14-programme corpus.
- Native Expo GL anatomy renderer using the FORGE FHM2 human mesh, rotation and muscle hotspots.
- Editable programmes: reorder, add, remove and replace exercises.
- Training-block editor for build / intensify / deload periodization.
- Smart in-workout substitutions ranked by movement, muscle group, body region and loading style.
- Rest countdown with scheduled Android local notifications.
- Analytics with 30-day training load, clickable Hall of Fame and muscle-volume body view.
- Native progress-photo studio and Share Studio.
- Instagram-ready Post 4:5 / Story 9:16 achievement cards via Android share sheet.
- Three-theme system: BLACK AMBER, GRAPHITE, PURE BLACK.
- Google OAuth / YouTube playlist bridge with secure token storage and YouTube Music deep links.
- Import/export using canonical Forge data semantics.
- React Native New Architecture enabled.

## Data compatibility
The canonical storage key remains `forge_v2_functional_state_v3`. Browser localStorage is not directly readable by Android; migration is explicit through Forge JSON backup/import.

## Local QA
```bash
node scripts/source-integrity.mjs
npm test
node scripts/static-check.mjs
node scripts/check-body.mjs
node scripts/parse-ts.mjs
```

## Android build
The repository GitHub Actions workflow uses the proven Alpha 2 toolchain: Ubuntu, Node 22, Temurin Java 17, Android SDK/API 36, Expo prebuild, then `./gradlew assembleDebug`.

## Google / YouTube
Create an Android OAuth client in Google Cloud, enable YouTube Data API v3, and set:

```env
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=...
```

FORGE requests the read-only YouTube scope. Playback is handed to YouTube Music rather than relying on private or scraped APIs.

## Safety boundary
FORGE v12.0.5 remains untouched. Web/PWA service-worker, DOM, iframe and browser-only navigation code are not embedded in this native project.
