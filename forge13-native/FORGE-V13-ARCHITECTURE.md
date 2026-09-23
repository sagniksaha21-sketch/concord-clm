# FORGE 13 Architecture — Alpha 3

## Decision
React Native with Expo SDK 57 is the Android-first native platform. FORGE v12.0.5 remains a separate web/PWA rollback surface; it is not embedded in the native app.

## Native layers
1. `app/` — Expo Router navigation and screens.
2. `src/store/ForgeProvider.tsx` — canonical local-first Forge state and actions.
3. `src/data/` — 85 exercises and 14 programmes.
4. `src/components/` — native visual system, tab icons and Expo GL anatomy.
5. `src/graphics/bodyMesh.ts` — embedded FHM2 anatomy payload.
6. `src/services/` — backup/import, rest notifications and official Google/YouTube boundaries.
7. `tests/` + `scripts/` — fail-fast source, feature and body-mesh integrity checks.

## Compatibility boundary
The canonical state key remains `forge_v2_functional_state_v3`. Browser localStorage is not directly readable by Android, so migration is explicit through Forge JSON backup/import until authenticated cloud sync is introduced.

## Deliberately absent
- No v12 DOM/HTML bundle.
- No iframe/WebView app shell.
- No browser service worker.
- No duplicate v12 state tree.
- No private YouTube Music API or scraping.
- No encoded source archive or overlay reconstruction in Alpha 3 CI.

## Native advantages used
- Expo GL native FHM2 3D anatomy.
- Android share sheet for Share Studio.
- Native image picker and progress photos.
- SecureStore for Google tokens.
- Android local notifications for rest timer.
- Haptic feedback.
- React Native New Architecture.

## Build architecture
GitHub Actions checks out the direct `forge13-native/` source, verifies committed assets and the FHM2 mesh, installs dependencies, runs regression/static checks, executes Expo prebuild, then builds with Gradle `assembleDebug` on Java 17 / Android API 36.
