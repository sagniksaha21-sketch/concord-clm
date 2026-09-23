# FORGE 13.0.0 Alpha 2 — QA Report

## Result
Alpha 2 source QA: **PASS**.

## Automated checks completed
- TypeScript/TSX syntax transpile: **PASS across 35 files**.
- Canonical exercise corpus: **85 / 85**.
- Canonical programme corpus: **14 / 14**.
- Programme exercise references: **all resolve**.
- Duplicate exercise IDs: **0**.
- Alpha 2 route/module static check: **18 / 18 present**.
- Regression tests: **10 / 10 PASS**.
- Canonical state key retained: `forge_v2_functional_state_v3`.

## Native body-engine integrity
The embedded original FORGE FHM2 mesh successfully decodes:
- Header: `FHM2`
- Vertices: **32,889**
- Indices: **197,406**
- Encoded payload: **789,560 bytes/chars**
- Decoded payload: **592,170 bytes**

The native anatomy component uses Expo GL directly and contains no WebView/iframe parity shim.

## Alpha 2 features statically verified
- Native GL 3D anatomy renderer and muscle selection.
- Programme exercise reorder / add / remove / replace.
- Training-block / periodization editor.
- Smart in-workout exercise substitution.
- Rest countdown and scheduled Android local notification integration.
- Hall of Fame → exercise-history drill-through.
- Native progress-photo studio.
- Existing Today / Nutrition / Share Studio / themes / backup / YouTube bridge retained.

## Bug fixed during QA
The 3D body's drag interaction originally mixed wall-clock and high-resolution timer values when deciding when to resume auto-rotation. Alpha 2 now consistently uses `performance.now()`.

## Build-environment limitation
This environment exposes Java and Node, but not the Android SDK/`adb`, Gradle CLI, or an authenticated EAS account. Therefore this report does **not** claim a compiled APK or physical-device runtime pass. The included EAS preview profile remains the intended path to an installable APK.

## Remaining runtime/parity work
- Health Connect.
- Cloud-sync UI and conflict resolution.
- Optional foreground-service-grade persistent rest timer.
- Full Android device matrix, accessibility and GL performance pass.
