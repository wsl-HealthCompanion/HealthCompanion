# M2.2 — Shoulder Raise Rule Engine Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Convert local PoseFrame data into deterministic, testable shoulder-raise measurements and ordered posture issues.

**Architecture:** Pure TypeScript geometry reads anatomical shoulder/elbow/hip indices and applies source-image aspect correction. A pure assessment function adds configurable arm, visibility, torso and optional calibrated framing rules. Existing Pose Lab remains a probe; the live feedback Widget belongs to M2.4.

**Tech Stack:** TypeScript, Vitest, existing MediaPipe adapter and PoseFrame.

**Spec:** `docs/superpowers/specs/2026-09-30-camera-pose-xmov-feedback-design.md`, sections 8–14 and M2.2.

## Global Constraints

- Target range 80°–105°, visibility threshold 0.6, maximum torso lean 15°; boundaries inclusive.
- Anatomical left/right comes from indices 11/13/23 and 12/14/24; CSS mirroring never changes rule labels.
- Core measurements require finite in-frame shoulders/elbows/hips with sufficient visibility and nonzero vectors; wrists are optional.
- No React, MediaPipe imports, timers, PerceptionEvent, Xmov, network calls or LangGraph in the rule engine.
- Retain raw frames locally; do not alter camera lifecycle, probe UI or main app.
- Default framing is unknown because numerical camera calibration evidence was not supplied.
- Optional framing limits use normalized shoulder width and torso height, never centimeters.
- Add optional PoseFrame.imageSize copied from video dimensions to undo independent x/y normalization. Legacy frames without dimensions use a square-coordinate plane; explicitly invalid dimensions fail closed.
- Work inline on the user-selected feature branch and preserve the two pre-existing M2.1 timestamp edits. M2.2 task commits contain only M2.2 files; save the user-accepted M2.1 fix in a separate local commit afterward. No push.

## Review Focus

- Non-square videos: identical pixel geometry must produce identical angles, including torso lean.
- Missing, occluded, out-of-frame, nonfinite or coincident core points: return unavailable measurements and never correct.
- Exact boundaries and floating-point error: 80°/105°/15° must remain inclusive without accepting a meaningful deviation.
- Optional wrists and CSS mirroring: no dependency on wrist visibility or presentation-side labels.
- Uncalibrated and invalid settings: no invented distance; reject malformed configurable limits rather than silently returning correct.

### Task 1: Geometry and measurement contract

**Files:**
- Modify: `yhzk-demo-h5/src/pose/types.ts`, `poseLandmarkerAdapter.ts`, `poseLandmarkerAdapter.spec.ts`
- Create: `yhzk-demo-h5/src/pose/shoulderRaiseTypes.ts`, `shoulderRaiseGeometry.ts`, `shoulderRaiseGeometry.spec.ts`, `shoulderRaiseFixtures.test-support.ts`

**Interfaces:**
- Consumes: `PoseFrame`, with optional `imageSize: { width: number; height: number }`.
- Produces: `measureShoulderRaise(frame: PoseFrame | null, config?: ShoulderRaiseMeasurementConfig): ShoulderRaiseMeasurement`.
- Measurement: nullable timestamp, bodyVisible, left/right `{ angleDeg: number | null; visible: boolean }`, nullable torsoLeanDeg, framing enum.
- Measurement config: visibilityThreshold and optional framing `{ minShoulderWidth, maxShoulderWidth, minTorsoHeight, maxTorsoHeight }`.

- [x] Write geometry tests for arms down 0°, horizontal 90°, raised 120°, left/right independence, non-square image correction, torso lean, missing/low-confidence/nonfinite/out-of-frame/degenerate data, optional wrists, null pose, and optional framing limits.
- [x] Run `npx vitest run src/pose/shoulderRaiseGeometry.spec.ts`; expect failure because the module does not exist.
- [x] Implement types and pure geometry. Compute shoulder→hip vs shoulder→elbow angle and midpoint torso deviation from vertical after multiplying x by width/height. Require valid core points; do not round measured angles. Without calibration return unknown; calibrated too_far requires both size measures below minima, too_close requires either above its maximum.
- [x] Extend adapter tests to require a copied source-image size and omit it for unavailable video dimensions; observe failure before changing adapter/types.
- [x] Attach valid video dimensions to the returned frame. Run geometry and adapter specs; expect all pass, including original adapter behavior.
- [x] Commit only Task 1 files; retain M2.1 edits.

### Task 2: Configurable rule assessment and milestone record

**Files:**
- Create: `yhzk-demo-h5/src/pose/shoulderRaiseRules.ts`, `shoulderRaiseRules.spec.ts`
- Modify: `yhzk-demo-h5/package.json`, `docs/README.md`
- Create: `docs/superpowers/specs/2026-10-01-m2-2-implementation-record.md`

**Interfaces:**
- Consumes: Task 1 `measureShoulderRaise`, measurement/config types.
- Produces: `assessShoulderRaise(frame: PoseFrame | null, config?: ShoulderRaiseRuleConfig): PoseAssessment` and immutable default config.
- Assessment: exercise shoulder_raise, correct, ordered issues, measurement. Rule config adds minArmAngleDeg, maxArmAngleDeg, maxTorsoLeanDeg.

- [x] Write tests for missing body, each low/high arm, both arms, correct, torso lean, calibrated framing, issue ordering, exact and near boundaries, alternate config, invalid config and recovery on the next frame.
- [x] Run `npx vitest run src/pose/shoulderRaiseRules.spec.ts`; expect missing-module failure.
- [x] Implement defaults 80/105/0.6/15 and finite/range config validation. Body failure emits only body_not_visible; otherwise collect framing, torso and left/right arm issues in that order. Correct requires no issues. Use only tiny numeric comparison tolerance for trigonometric boundary error.
- [x] Add the two geometry/rule specs to `test:pose-lab`; run it, expecting baseline probe tests and new tests all pass.
- [x] Run `npm run build` and `git diff --check`; expect successful build and no whitespace errors.
- [x] Record the user's M2.1 acceptance, M2.2 interfaces, uncalibrated framing, aspect handling, test evidence and the M2.3 handoff. Link the record in docs README.
- [x] Commit only Task 2 files. Request a fresh final code review under executing-plans; fix material findings with reproducing tests. Keep the branch locally for the next milestone.
