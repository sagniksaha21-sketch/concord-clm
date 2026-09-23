# FORGE 13.0.0 alpha 1 — QA

## Static checks completed
- Exercise corpus: 85 / 85
- Programme corpus: 14 / 14
- Every programme exercise reference resolves
- Duplicate exercise IDs: 0
- Core native routes: present
- Canonical state key: `forge_v2_functional_state_v3`
- TypeScript/TSX syntax transpile: PASS across 27 source files
- Node regression tests: 5 / 5 PASS

## Native features present
- Today
- Train + programme selection
- Active workout logging
- Nutrition quick log
- Analytics + Hall of Fame
- More + three themes
- Share Studio with user photo selection
- Native Android share sheet
- Google OAuth / YouTube playlist bridge
- Secure token storage
- Backup import/export
- Native splash/intro identity
- Original-style SVG tab icons

## Build environment limitation
The execution container does not expose Android SDK/Gradle or an authenticated Expo/EAS account, so an APK cannot be compiled in this environment. The repository includes `eas.json` with a preview APK profile and a production AAB profile.

## Parity note
This is the first native foundation build, not a claim of complete v12 feature parity. The native 3D anatomy renderer is intentionally not faked; Analytics uses the existing body poster until the native 3D renderer is implemented and tested.
