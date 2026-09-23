# FORGE 13 Alpha 2 — Development Notes

Alpha 2 advances the first React Native foundation toward native feature parity without touching the v12.0.5 PWA.

## Major additions
1. Original FORGE FHM2 body mesh ported into `expo-gl`, including shader-based muscle emphasis, touch selection, drag rotation and front/side/back views.
2. Native programme builder with exercise ordering and a simple block-periodization editor.
3. Smart substitutions using movement pattern, muscle group, body region and bodyweight/loading affinity.
4. Rest timer integrated into set logging with +30s / skip controls and opt-in scheduled local alerts.
5. Analytics drill-through from Hall of Fame to per-exercise history.
6. Progress-photo timeline with local image selection and two-photo comparison.

## Compatibility
- Canonical key: `forge_v2_functional_state_v3`.
- Corpus: 85 exercises / 14 programmes.
- Backup importer remains backward-compatible with v12 wrapper and raw Forge state exports.

## Next engineering focus
Health Connect and cloud-sync conflict handling should come after an Android runtime pass of Alpha 2, because they add platform permissions and synchronization state that are safer to layer onto a proven native shell.
