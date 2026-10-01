# M2.3 — Pose Session and Hold Timer Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn M2.2 assessments into stable coaching states, a cancellable 3-second hold and one-shot structured perception events.

**Architecture:** A local TypeScript controller accepts assessments and explicitly injected monotonic observation times. A separate event mapper copies only approved scalar measurements and issues. M2.4 will connect this controller to camera samples, controls and the live Widget.

**Tech Stack:** Existing TypeScript, PoseAssessment, frontend compiler and Vite.

**Spec:** `docs/superpowers/specs/2026-09-30-camera-pose-xmov-feedback-design.md`, sections 15–16, 19, 23–25. User explicitly requested continuation of M2.3 under the established milestone design.

## Global Constraints

- Classification dwell defaults to 500 ms; correct hold defaults to 3000 ms and begins only on stable correct entry.
- Any fresh invalid assessment immediately cancels a hold; reacquisition requires another full dwell and hold.
- Completion is terminal and emits once until explicit stop/start or a new start after completion.
- Statuses: idle, acquiring, coaching, holding, completed, paused.
- No internal timers, DOM, React, MediaPipe, network, Xmov or LangGraph dependencies.
- Events: body_not_visible, framing_issue, exercise_feedback, pose_correct, completed; source pose and exercise shoulder_raise. No raw landmarks or media bytes.
- Use a monotonic observation clock, separate from video/media timestamps. Reject invalid/backward observation time without mutation; duplicate video timestamps cannot advance dwell or hold.
- Default maximum fresh-sample gap is 250 ms, configurable. Larger gaps break continuity, clear hold and require reacquisition. Explicit tick can expire stale state but never accrue hold or complete.
- Keep the existing feature checkout and live probe page. No merge or push.
- User explicitly chose "先完成开发，暂不自动测试". Do not add/run automated tests; use TypeScript/build and static review, and record the testing limitation honestly.

## Review Focus

- Cancellation occurs on the first bad sample, even when that classification has not dwelled for 500 ms.
- A sparse, duplicated, stale or out-of-order input cannot turn elapsed wall time into a successful hold.
- Pause/resume, stop/start and duplicate starts cannot preserve an old hold or re-emit completion inadvertently.
- Lower-priority issue changes are stable before events; identical stable issues do not emit on every sample.
- Caller mutation of assessments, returned snapshots and emitted events cannot corrupt controller state; events contain only allowlisted measurements.

### Task 1: Session and event contracts

**Files:**
- Create: `yhzk-demo-h5/src/pose/poseSessionTypes.ts`
- Create: `yhzk-demo-h5/src/pose/posePerceptionEvent.ts`

**Interfaces:**
- Consumes: M2.2 `PoseAssessment` and `PoseIssue`.
- Produces: `PoseSessionStatus`, `PoseSessionConfig`, `PoseSessionSnapshot`, `PoseSessionUpdate`, `PerceptionEvent`, `PosePerceptionEventName`.
- Snapshot: status, latest copied assessment or null, stableIssues or null, holdMs, holdTargetMs.
- Update: `{ snapshot, events }`; events are returned once by the update that creates them.
- Event factory: `createPosePerceptionEvent(event, assessment, timestampMs, holdMs): PerceptionEvent`; scalar angles, framing, copied issues and holdMs only. Omit unavailable/nonfinite angles and unavailable confidence.

- [x] Define explicit contracts and the event allowlist mapper; observation timestampMs belongs to the injected controller clock, not media time.
- [x] Run `npx tsc --noEmit`; expected exit 0.
- [x] Commit only Task 1 files and record compiler result.

### Task 2: Controller and milestone record

**Files:**
- Create: `yhzk-demo-h5/src/pose/poseSessionController.ts`
- Create: `yhzk-demo-h5/src/pose/poseSessionAssessment.ts` (owned copies and input coherence checks)
- Create: `docs/superpowers/specs/2026-10-01-m2-3-implementation-record.md`
- Modify: `docs/README.md`

**Interfaces:**
- Consumes: Task 1 contracts/factory and M2.2 `PoseAssessment`.
- Produces: `PoseSessionController(config?: Partial<PoseSessionConfig>)` with `start(nowMs)`, `stop()`, `pause()`, `resume(nowMs)`, `getSnapshot()` returning snapshots; `update(assessment, nowMs)` and `tick(nowMs)` returning PoseSessionUpdate.
- Produces: immutable defaults `{ classificationDwellMs: 500, correctHoldMs: 3000, maxSampleGapMs: 250 }`; all configured durations must be positive finite numbers.

- [x] Implement owned assessment copies, validated clock/config, lifecycle, exact 500/3000 inclusive transitions, immediate hold cancellation, priority-selected events, full-issue classification identity, one-shot completion and stale-observation expiry.
- [x] Correct requires a coherent visible assessment with finite source timestamp, finite core angles/torso, no issues and unknown/ok framing. In-contract numeric/semantic incoherence fails closed to body_not_visible rather than advancing hold; missing structural fields are caller contract violations and may throw before controller mutation.
- [x] Run `npm run build` and `git diff --check`; expected successful compiler/Vite build and no whitespace errors. Record whether automated tests were requested/run, without treating compile success as timing acceptance.
- [x] Document clock/freshness contract and M2.4 wiring: fresh inference -> assessment -> update; scheduled Widget tick expires stale state; camera stop/inference error/unmount stops or pauses session.
- [x] Commit Task 2 files. Request one fresh read-only final review under executing-plans; fix material findings, with automated regression tests only if requested.
- [x] Save final review and implementation records; keep the branch for M2.4.
