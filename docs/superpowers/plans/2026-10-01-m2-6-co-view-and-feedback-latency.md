# M2.6 — Co-view Layout and Response Latency Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan inline. Steps use checkbox syntax.

**Goal:** Keep the user's camera and digital-human coach visible together, then measure and reduce delay from pose completion to the digital human beginning its reply.

**Architecture:** Place camera and avatar in a shared responsive practice row, with the pose Widget directly below. Record monotonic timestamps at completion-event creation and SDK speak submission; show that measured interval beside the reply. The current Xmov JavaScript voice callback exposes only a global status string and no request ID, so do not attribute a voice-start signal to a specific delivery; leave playback onset for human acceptance. Use the reliable interval to guide a bounded code fix.

**Tech Stack:** Existing React/TypeScript/SCSS, `PerceptionEvent.timestampMs`, Xmov provider `onVoiceStateChange`, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-30-camera-pose-xmov-feedback-design.md`, M2.6 and sections15–21/24–27; M2.5 user experience acceptance in `docs/superpowers/specs/2026-10-01-m2-5-implementation-record.md`.

## Global Constraints

- Keep preview and avatar visible together at desktop widths; on narrow screens use a readable vertical layout.
- Retain explicit camera and avatar controls, anatomical labels, local inference and verified Action Registry semantics.
- Timing uses the browser monotonic clock. Do not log frame/landmark data, credentials, or add external telemetry.
- Correct-pose confirmation is immediate on the stable event. Completion feedback follows the 3000ms hold event; don't delay it for React rendering or exercise extra frames.
- User deferred automated tests. Do not add/modify/run tests, browser automation or simulated SDK/camera probes. Run compiler/production build and static review; request real human acceptance after changes are ready.
- Continue current feature branch and existing development environment. Commit locally; no push/merge.

## Review Focus

- The shared visual row remains within common laptop viewport widths without compressing the camera so much that upper-body tracking becomes unusable.
- Event→SDK-submit timing uses the same monotonic basis at both endpoints. The global voice callback is not used for per-delivery timing because it has no request identity.
- Duplicate/retried callbacks cannot apply one response's onset duration to another response; late voice callbacks after cancel/unmount are ignored.
- Starting, reconnecting, camera error, and hold completion preserve the existing no-event-replay and cancellation rules.
- Measuring latency adds no frame, landmark, key, or speech telemetry to a server.

### Task 1: Shared practice viewport

**Files:** Modify `yhzk-demo-h5/src/components/PoseLabPage.tsx`, `yhzk-demo-h5/src/pose-lab.scss`.

**Interfaces:** Practice row owns camera preview/controls and existing avatar panel; measurement widget/status/details follow it below. Existing legacy probe-only view remains single-column.

- [x] Move the avatar beside the camera in the same responsive row; keep the training widget and diagnostics after the row. Keep the legacy probe camera full-width when no avatar panel is present.
- [x] Set stage sizing and responsive breakpoints so both live panels are readable on desktop; retain stacked layout on narrow mobile widths.
- [x] Inspect source diff and run production build; commit.

### Task 2: Measure response onset and address queue latency

**Files:** Modify `yhzk-demo-h5/src/pose/poseAvatarFeedback.ts`, `src/pose/usePoseAvatarFeedback.ts`, `src/components/PoseAvatarFeedbackPanel.tsx`, `src/components/XmovAvatarPlayer.tsx`, `src/avatar/XmovAvatarProvider.ts`, `src/services/xmovAvatar.ts`, implementation record and README.

**Interfaces:** A feedback attempt carries `eventAtMs`. Provider records the SDK speak invocation after the method returns; UI reports `event→submit`. The SDK's generic voice status remains presentation state only and is not attributed to a delivery because the callback carries no request ID.

- [x] Add monotonic timing from stable completion through SDK speak invocation, surfaced as concise UI status. Do not claim per-request voice start when the SDK callback has no request ID.
- [x] Statically trace measured delays and the existing serialized lane. Dispatch without waiting for a full utterance; retain per-request settlement tracking so cancellation cleanup is generation guarded and cannot interrupt a newer response.
- [x] Run TypeScript compiler and production build; `git diff --check`; no tests or behavioral probes. Commit.
- [x] Request one fresh read-only static review; fix material findings in one pass with compiler/build only.
- [x] Update M2.6 record with layout, timing observability and honest remaining human acceptance. Commit; keep branch for user camera/speech timing acceptance.
