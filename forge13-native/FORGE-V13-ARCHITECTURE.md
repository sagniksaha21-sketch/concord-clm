# FORGE 13 Architecture

## Decision
React Native with Expo SDK 57 is the Android-first native platform. The existing v12 Next.js/PWA remains production-safe during migration.

## Layers
1. `app/` — Expo Router native navigation and screens.
2. `src/store/ForgeProvider.tsx` — local-first compatible Forge state, workout and nutrition actions.
3. `src/data/` — canonical 85 exercises and 14 programmes extracted from v12.0.5.
4. `src/components/` — native visual system and original bottom-navigation icon language.
5. `src/services/` — external boundaries only: backup files and YouTube/Google.
6. EAS — Android APK/AAB builds.

## Compatibility boundary
Native storage uses the canonical key name `forge_v2_functional_state_v3`, but web localStorage is not directly readable by Android. Migration is explicit through Forge JSON backup/import or a future authenticated sync endpoint.

## Removed from the native architecture
- No v12 DOM/HTML bundle.
- No iframe app shell.
- No duplicate v12 state tree.
- No browser service worker.
- No legacy web navigation code.
- No private YouTube Music API/scraping.

## Native-only advantages already used
- Android share sheet for Share Studio.
- Native image picker.
- SecureStore for access tokens.
- Haptic feedback.
- Android edge-to-edge support / predictive back configuration.
- EAS-native APK/AAB pipeline.

## Remaining parity work after alpha 1
- Native 3D anatomy renderer and muscle selection.
- Full programme builder / block-periodization editor.
- Advanced exercise substitution/intelligence surfaces.
- Rest-timer notifications and foreground service.
- Health Connect.
- Cloud sync UI and conflict handling.
- Native photo progress studio.
- Full accessibility/runtime device pass.
