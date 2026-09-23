# FORGE 13 — Native Android Alpha 2

FORGE 13 is the Android-first React Native / Expo successor being built alongside the production-safe FORGE v12.0.5 PWA. It is a native app, not a WebView wrapper.

## Alpha 2 scope
- Five native tabs: Today, Train, Nutrition, Analytics, More.
- Native workout logging with weight / reps / RIR, saved sessions and exercise history.
- Same canonical 85-exercise / 14-programme corpus as v12.0.5.
- Native GL anatomy renderer using the original FORGE FHM2 human mesh, rotation and muscle hotspots.
- Editable programmes: reorder, add, remove and replace exercises.
- Training-block editor for build / intensify / deload periodization.
- Smart in-workout substitutions ranked by movement, muscle group, body region and loading style.
- Rest countdown with optional scheduled Android local notification.
- Analytics with 30-day training load, clickable Hall of Fame and muscle-volume body view.
- Native progress-photo studio and Share Studio.
- Three-theme system: BLACK AMBER, GRAPHITE, PURE BLACK.
- Google OAuth / YouTube playlist bridge with secure token storage.
- Import/export using canonical Forge data semantics.
- EAS profiles for development APK, preview APK and production AAB.
- React Native New Architecture enabled.

## Data compatibility
The canonical storage key remains `forge_v2_functional_state_v3`. Android cannot directly read browser localStorage, so migration remains explicit: export a Forge JSON backup from v12 and import it in v13. The importer accepts v12 wrapper exports (`{ data: state }`), native wrapper exports and raw state JSON.

## Setup
Use Node 22.13+.

```bash
npm install
npx expo-doctor@latest
npx expo start
```

Android native development build:

```bash
npx expo prebuild
npx expo run:android
```

Installable preview APK with EAS:

```bash
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
```

Production Play Store AAB:

```bash
npx eas-cli@latest build --platform android --profile production
```

## Local QA
The repository includes four local checks that do not require an Android SDK:

```bash
node scripts/parse-ts.mjs
node scripts/static-check.mjs
node scripts/check-body.mjs
npm test
```

## Google / YouTube
Create an Android OAuth client in Google Cloud, enable YouTube Data API v3, and set:

```env
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=...
```

FORGE requests the read-only YouTube scope. Playback is handed to YouTube Music rather than relying on private or scraped APIs.

## Remaining native parity work
Alpha 2 materially closes the anatomy, programme editing, substitution, rest-timer and progress-photo gaps. Remaining work is primarily Health Connect, cloud-sync conflict UX, a foreground-service-grade persistent timer if required, and full runtime device/accessibility/performance validation.

## Safety boundary
FORGE v12.0.5 remains untouched. Its DOM/CSS bundle, service worker and legacy web navigation are not embedded in this native project.
