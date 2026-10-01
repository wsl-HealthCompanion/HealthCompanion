# M2.4 — Live Pose Feedback Widget Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display real camera assessments, posture corrections and the M2.3 hold progress with explicit training controls.

**Architecture:** A presentational PoseFeedbackWidget renders current measurements and session controls. A dedicated React hook owns the session controller and observation-expiry scheduler; the existing page submits fresh inference samples and connects camera/error/teardown lifecycle. The main app remains separate.

**Tech Stack:** Existing React/TypeScript/SCSS, M2.2 assessShoulderRaise, M2.3 PoseSessionController, PoseProbeLoop.

**Spec:** `docs/superpowers/specs/2026-09-30-camera-pose-xmov-feedback-design.md`, sections15–16/19–20/23–25; M2.3 integration record. User requested continuation of the next milestone, preserving the chosen inline development workflow.

## Global Constraints

- Show anatomical left/right arm angles, target80°–105°, torso lean, all current issues, framing and hold0.0/3.0seconds.
- Use existing rule/session defaults,500ms dwell and3000ms hold. No duplicate timing or posture rules in UI.
- Camera activation remains explicit. Training starts separately after camera/model readiness and waits for new inference results; absent body is a valid fresh negative observation.
- Pause/resume cancels hold; stop training cancels pose scheduling and preserves camera preview per design section19. Explicit start restarts sampling; stop/switch camera resets training and observation state.
- Clock is performance.now() at sample consumption; feed the controller each new inference exactly once. Widget timer only calls tick to expire samples, never adds hold time.
-250ms observation expiry also clears live measurements and stale overlay; completion remains terminal but live angles may continue updating.
- Inference errors pause training, clear observations and discard/close the failed adapter/loop; the next camera start recreates them. Hidden page pauses training; explicit resume is required. Teardown stops session/scheduler/inference/tracks/model.
- Events contain structured measurements only; retain only the latest event locally for future M2.5 integration. No speech, Xmov, LLM or network additions.
- User chose development without automated testing. Do not add/modify/run tests; use compiler/build and fresh static review. Existing M2.1-only test expectations will need separate acceptance work if the expanded view changes them.
- Continue current feature branch, keep local commits, no merge/push.

## Review Focus

- Cached React frames and UI timer ticks cannot advance a hold; sample expiry hides stale angles and cancels pending correctness.
- Completion followed by lowered arms still shows completed guidance; another attempt requires explicit start.
- Camera switch, pending startup cancellation, track end, inference error, hidden page and unmount clear or pause the appropriate state without later stale callbacks reactivating it.
- Pending camera/model initialization cannot enable training, and resumed training must reacquire stability using a new sample.
- Low visibility, mirrored preview and rounding cannot swap arm labels, announce premature completion or display unavailable angles as valid.

### Task 1: Presentational feedback and responsive styling

**Files:**
- Create: `yhzk-demo-h5/src/components/PoseFeedbackWidget.tsx`
- Modify: `yhzk-demo-h5/src/pose-lab.scss`

**Interfaces:**
- Consumes: PoseAssessment, PoseSessionSnapshot and DEFAULT_SHOULDER_RAISE_RULE_CONFIG.
- Produces: `PoseFeedbackWidget` with snapshot, assessment, hasFreshSample, isReady, onStart/onPause/onResume/onStop props.
- Displays Chinese status/guidance, finite per-side angles, target range, torso, all issues, framing, progress and explicit controls. Completed guidance suppresses further posture corrections until new start. Timer display floors elapsed tenths so3.0cannot display before completion.

- [x] Implement widget from current scalar assessment and session snapshot; keep volatile angle/hold values outside live-announcement regions.
- [x] Add responsive styling consistent with the existing page, focus indicators and accessible progress/control labels.
- [x] Run frontend compiler; expected exit0. Commit Task1 files; record no automated tests.

### Task 2: Live sample and lifecycle integration

**Files:**
- Create: `yhzk-demo-h5/src/pose/usePoseTrainingSession.ts`
- Modify: `yhzk-demo-h5/src/components/PoseLabPage.tsx`
- Create: `docs/superpowers/specs/2026-10-01-m2-4-implementation-record.md`
- Modify: `docs/README.md`

**Interfaces:**
- Consumes: Task1 widget props, assessShoulderRaise(frame), PoseSessionController and actual fresh PoseProbeSample callbacks.
- Produces: `usePoseTrainingSession(enabled)` with view {snapshot,assessment,hasFreshSample,latestEvent}, ingest(frame), start/pause/resume/stopTraining, clearObservation and suspendObservation.
- Page optional training view prop maintains the standalone camera-view caller contract; actual PoseLabPage always supplies widget data/handlers.

- [x] Implement stable callback/ref ownership, one update per fresh sample, a50ms expiry-only interval when camera/model is ready, explicit lifecycle controls and independent live assessment after completion.
- [x] Pause on document hidden; clear live measurements on gaps/errors; cancel all scheduling and reset controller on unmount. Enable start/resume with ready camera/model and visible page; only new samples can establish stability or advance hold.
- [x] Integrate widget and loop callbacks. Reset on camera stop/switch/new startup, pause on inference error, handle ended video tracks with detachable listeners and camera cleanup. Keep readiness/error state truthful.
- [x] Update page title/instructions; preserve source selector, FPS/calibration and landmark diagnostics; hide stale overlay.
- [x] Run npm run build and git diff --check; expected exit0. Do not run automated tests or exercise webcam behavior.
- [x] Document user flow, lifecycle, events, remaining M2.5/M2.6 work and unexecuted acceptance; commit implementation.
- [x] Request one fresh read-only static review; fix material findings without adding/running tests. Save review and retain feature branch.
