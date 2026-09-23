# FORGE 13.0.0 Alpha 3 — Alpha 1 Forward Reconstruction

## Reconstruction rule

This branch was created as a new clean Forge branch from the repository mainline. The application source is direct Git source under `forge13-native/`. Existing Alpha 1, Alpha 2, Alpha 3 attempts, APK artifacts and Git history remain preserved on their existing branches and in the file library.

The application reconstruction was verified in this order:

1. Positively identify the original Alpha 1 React Native source package.
2. Re-run Alpha 1 data and route regression checks without modification.
3. Compare Alpha 1 against the complete Alpha 2 source package and port the validated feature delta.
4. Re-run the Alpha 2 regression and FHM2 integrity gates.
5. Reconcile later valid chat/Git deltas only where they apply to native React Native.
6. Commit the clean direct source tree and reuse the proven Android GitHub Actions build configuration.

## Verified Alpha 1 baseline

- Package version: `13.0.0-alpha.1`.
- Source package: `FORGE-V13.0.0-Alpha1-React-Native-Android.zip`.
- Total package files: 53.
- TypeScript/TSX application source transpile gate: 27 source files in the original Alpha 1 QA.
- Navigation: Expo Router with Today, Train, Nutrition, Analytics and More tabs, plus native Workout and Share Studio routes.
- Canonical state key: `forge_v2_functional_state_v3`.
- Exercise corpus: 85 / 85.
- Programme corpus: 14 / 14.
- Programme exercise references: all resolved.
- Baseline regression tests: 5 / 5 passed.
- Native architecture: Expo SDK 57 / React Native 0.86.2, New Architecture enabled, Expo Router, AsyncStorage local state, native image picker/share sheet, SecureStore, Google OAuth/YouTube bridge, no WebView shell.

## Reconciliation matrix

| Capability | Alpha 1 | Alpha 2 | Later validated work | Reconstruction action |
| --- | --- | --- | --- | --- |
| 85-exercise library | Present | Preserved | Preserved | Keep canonical corpus; verify 85/85 |
| 14 programmes | Present | Preserved | Preserved | Keep canonical corpus; verify 14/14 and references |
| Workout logging | Present | Enhanced integration | Preserved | Keep |
| Nutrition | Present | Preserved | Preserved | Keep |
| Analytics | Present | Enhanced body/history integration | Preserved | Keep |
| Hall of Fame | Present | Exercise-history drill-through | Preserved | Port drill-through |
| Editable programmes | Not present | Added | Preserved | Port builder, reorder/add/remove/replace |
| Training blocks | Not present | Added | Preserved | Port block editor |
| Block periodization | Not present | Added | Preserved | Port |
| Smart substitutions | Not present | Added | Preserved | Port movement/muscle/loading-aware substitution |
| Rest timer | Basic/no native scheduled notification | Added | Preserved | Port countdown and local notification path |
| Android local notifications | Not present | Added | Preserved | Add Expo Notifications plugin/service |
| Progress photo studio | Not present as full studio | Added | Preserved | Port native image-picker studio |
| FHM2 native anatomy | Poster placeholder | Added | Preserved | Port native Expo GL mesh renderer |
| FHM2 integrity | N/A | FHM2, 32,889 vertices, 197,406 indices | Preserved | Verify mesh decode |
| Themes | 3 themes | Preserved | Preserved | Keep |
| Backup/import | Present | Preserved | Preserved | Keep |
| Share Studio | Present | Preserved | Latest PR, custom achievement copy, explicit latest progress photo action, date-correct latest photo | Port later native-only delta |
| Google/YouTube | Present | Preserved | Preserved | Keep |
| FORGE identity | Present | Preserved | Stronger native brand mark | Port |
| Source integrity gates | Basic | Expanded static/body tests | Added fail-fast direct-source checks | Keep |
| Android CI | EAS profiles only | Proven GitHub Actions APK configuration later used successfully | Clean direct-source workflow | Reuse Java 17 + API 36 + Expo prebuild + Gradle |

## Alpha 2 feature-port verification

The Alpha 2 feature delta was replayed onto a fresh Alpha 1 copy, not onto an Alpha 3 overlay.

Validated results:
- 85 exercises.
- 14 programmes.
- All programme exercise references resolve.
- Duplicate exercise IDs: 0.
- Alpha 2 regression tests: 10 / 10 passed.
- Native route/module static gate: passed.
- Native GL check: passed; no iframe/WebView anatomy shim.
- FHM2 mesh: header `FHM2`, 32,889 vertices, 197,406 indices, decoded payload 592,170 bytes.
- Programme builder/block actions: wired.
- Smart substitutions/rest timer: wired.
- Hall of Fame history drill-through: wired.
- Progress photo native image picker: wired.

## Later valid native deltas

The later native deltas retained are:
- stronger FORGE native branding;
- a distinct Latest PR Share Studio card;
- custom achievement headline/mark fields;
- explicit “Use latest progress photo” action;
- timestamp-correct latest-photo selection;
- fail-fast source-integrity validation;
- expanded Alpha 3 feature/static validation.

Web/PWA-only service-worker, DOM, iframe and Vercel routing fixes are intentionally not ported into React Native.

## Technical debt removed from this branch

This branch contains no Forge base64 source archives, tar overlays, chunk reconstruction files, Railway APK build logic, duplicate Forge source tree, or overlay bootstrap step.

The Android pipeline consumes ordinary Git source files directly.

## Version

Reconstructed native application version: `13.0.0-alpha.3`.

Alpha 1 remains the immutable baseline source reference; Alpha 2 remains the proven prior build reference.
