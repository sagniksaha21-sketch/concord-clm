# FORGE 14 — INTELLIGENCE ROADMAP

Status: **Active development on `forge14-planning`**
Base: valuable Forge native functionality and user data retained; v13 visual parity is not a release gate
Principle: **Plan → Train → Measure → Recover → Adapt → Repeat**

## Mission and release gate
Forge 14 is a new native product direction, not a cosmetic v13 iteration and not a recreation of v12.0.5. Preserve valuable training, programme, nutrition, history, backup and user-data behavior while replacing weak or generic presentation. Phase 7 is complete only when an installable release-candidate APK passes CI, migration/offline/persistence/performance QA and Samsung flagship validation.

### Seven-phase execution
1. Foundation + cleanup — architecture, safe areas, migration protection, vestigial cleanup, green CI.
2. World-class UI/UX — new design system, meaningful photography, premium motion/haptics and responsive navigation.
3. Core training — Workout HUD, programmes, logging, PRs, substitutions, timers and Hall of Fame.
4. FHM3 Muscle Intelligence — functional interactive anatomy, muscle state/history/intelligence; no fallback presented as finished 3D.
5. Forge Intelligence — readiness, adaptive programmes, recovery, explainable recommendations and Coach.
6. Expanded ecosystem — Sound, Vision, advanced analytics/Records and later Wear OS.
7. Release candidate validation — full gates and installable v14 APK.

Independent workstreams may advance in parallel when they do not compromise migration safety or create conflicting writes. Status is evidence-based: COMPLETE only when the phase gate is actually met.

## Product direction
Forge 14 is an adaptive training operating system, not a menu expansion. Preserve the premium OLED-black / graphite / champagne-gold identity. Reduce visual noise, use gold semantically, keep training offline-first, and make intelligence explainable and user-controlled.

## Workstreams

### 1. Forge Intelligence / Readiness
- Daily readiness state from available training load, muscle fatigue, performance, soreness, recovery and connected sleep/recovery data.
- Explain every recommendation with contributing signals.
- Recommend today's session and targeted volume/load changes.
- Never silently rewrite a programme; user accepts, edits or ignores adaptations.

### 2. Adaptive Programme Engine
- Keep all existing programmes while making them adaptive.
- Progression recommendations across load, reps, sets, exercise, rest and frequency.
- Plateau detection and deload recommendations.
- Explainable recommendations with history/evidence.
- Preserve manual programme editing and periodization.

### 3. FHM3 — Muscle Intelligence
- Evolve FHM2 into the primary visual training-state interface.
- Front/back rotatable interactive anatomy.
- Muscle-level recent volume, effective volume, recovery, strength trend, last-trained time and recommendations.
- Semantic states for trained/recovered/fatigued/undertrained/recommended.
- 30-day muscle-history scrubber.

### 4. Forge Coach
- Context-aware assistant grounded in the active workout, programme, exercise library and user history.
- Explain targets and adaptations.
- Time-constrained session restructuring.
- Exercise substitutions based on constraints and training intent.
- Never present generic chatbot advice when Forge data can answer the question.

### 5. Next-generation Workout UI
- Exercise hero + anatomy + previous performance + today's target + set logging + next movement.
- Previous / Target / Actual comparison per set.
- Immediate PR and performance feedback.
- One-thumb gym ergonomics and progressive disclosure.

### 6. Forge Live Workout HUD
- Minimal large-format active set interface.
- Set count, exercise, target/actual, rest timer and next exercise.
- Haptic rest-complete cues.
- Fast pause, skip, substitute and finish controls.

### 7. Wear OS / Galaxy Watch
- Companion logging for set, reps, weight and RIR.
- Rest timer, heart rate, next exercise, pause/finish.
- Reliable sync back to the phone with offline tolerance.

### 8. Forge Sound
- Evolve Forge Audio into workout-aware music orchestration.
- Warm-up, Training, Heavy Set, PR Mode and Cooldown contexts.
- Workout-specific playlists and PR playlist.
- Respect YouTube/YouTube Music playback/API constraints; Forge owns the experience layer and hands playback off where required.
- Compact active-workout music controls.

### 9. Recovery
- First-class Recovery surface.
- Sleep, resting HR, HRV where available, soreness, fatigue, stress, hydration, calories and weight.
- Personal correlations between recovery inputs and training performance.
- Avoid medical claims and false precision.

### 10. Training-aware Nutrition
- Nutrition targets aware of heavy/normal/recovery/rest/deload days.
- Protein, carbohydrate, fat and calorie targets linked to programme context.
- Keep logging fast; do not become a bloated generic food database.

### 11. Forge Vision / Transformation Studio
- Guided consistent progress-photo capture.
- Framing guides, ghost overlay, pose alignment, timeline and side-by-side comparison.
- Private/on-device analysis where practical.
- Do not claim medical-grade body-fat measurement from photographs.

### 12. Actionable Analytics
Answer questions rather than add dashboard clutter:
- What is improving?
- What is plateauing?
- What is being neglected?
- Which recovery/training patterns correlate with best performance?
- Drill from each insight into supporting sessions/data.

### 13. Hall of Fame / Records 2.0
- Weight, rep, estimated-1RM, volume, workout-volume, streak and programme-completion records.
- Premium PR animation/haptics.
- Historical progression timeline.
- Automatic Share Studio record cards.

### 14. Offline-first Architecture
- Programmes, workouts, history, FHM3, analytics, nutrition and timers remain useful without network.
- Cloud enhances Forge but must not be required for core training.
- Explicit migration path from v13 state/data.

## Home / Today concept
- FORGE + day/session context.
- One dominant readiness/training card with one-tap BEGIN.
- Compact muscle recovery strip.
- Today's primary performance target.
- One concise Forge Intelligence insight.
- Everything else progressively disclosed.

## Visual system
- Deep OLED black and graphite glass.
- Restrained champagne/gold accents.
- Gold has semantic meaning: PR, selected state, progress, primary action.
- Subtle volumetric lighting around FHM3.
- Smooth 60/120Hz-capable motion where device supports it.
- Premium haptics and transitions without gratuitous animation.
- Avoid generic rounded-card fitness-app aesthetics.

## Engineering sequence
1. Establish the v14 foundation: safe areas, migration protection, cleanup and green CI.
2. Build the new v14 design system and phone information architecture while preserving the state contract.
3. Rework Workout + Live HUD in parallel with the FHM3 data/visual foundation.
4. Build deterministic intelligence/readiness and adaptive-programme recommendations.
5. Add Recovery, training-aware Nutrition and Forge Coach over structured Forge context.
6. Expand Sound, Vision, Analytics and Records 2.0; add Wear OS after phone flows stabilize.
7. Run full regression, offline, migration, persistence, performance and Samsung-device validation; produce the RC APK.

## Non-negotiable acceptance criteria
- No regression of stable v13 functionality.
- Existing user data migrates safely.
- Core workout flow works offline.
- Recommendations are explainable and user-controlled.
- No silent AI programme changes.
- FHM3 is functional, not decorative.
- One-tap path from Today to the correct workout.
- Fast gym interaction on phone; no horizontal-scroll dependency.
- Premium Forge identity retained.
- Performance tested on the primary Samsung flagship target and representative Android sizes.
