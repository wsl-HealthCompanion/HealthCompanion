# M2.6 — Co-view Layout and Response Latency Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan inline. Steps use checkbox syntax.

**Goal:** Keep the user's camera and digital-human coach visible together, then measure and reduce delay from pose completion to the digital human beginning its reply.

**Architecture:** Place camera and avatar in a shared responsive practice row, with the pose Widget directly below. Record monotonic timestamps at completion-event creation, SDK speak submission and the first Xmov voice-start callback; show the latest two elapsed intervals alongside the reply. Use the measurement to guide a bounded code fix, while leaving real-device playback acceptance to the user.

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
- Event→SDK-submit timing and SDK-submit→voice-start timing use the same monotonic basis; absent voice callback is shown as unknown rather than a false success/timeout.
- Duplicate/retried callbacks cannot apply one response's onset duration to another response; late voice callbacks after cancel/unmount are ignored.
- Starting, reconnecting, camera error, and hold completion preserve the existing no-event-replay and cancellation rules.
- Measuring latency adds no frame, landmark, key, or speech telemetry to a server.

### Task 1: Shared practice viewport

**Files:** Modify `yhzk-demo-h5/src/components/PoseLabPage.tsx`, `yhzk-demo-h5/src/pose-lab.scss`.

**Interfaces:** Practice row owns camera preview/controls and existing avatar panel; measurement widget/status/details follow it below. Existing legacy probe-only view remains single-column.

- [ ] Move the avatar beside the camera in the same responsive row; keep the training widget and diagnostics after the row.
- [ ] Set stage sizing and responsive breakpoints so both live panels are readable on desktop; retain stacked layout on narrow mobile widths.
- [ ] Inspect source diff and run production build; commit.

### Task 2: Measure response onset and address queue latency

**Files:** Modify `yhzk-demo-h5/src/pose/poseAvatarFeedback.ts`, `src/pose/usePoseAvatarFeedback.ts`, `src/components/PoseAvatarFeedbackPanel.tsx`, `src/components/XmovAvatarPlayer.tsx`, `src/avatar/XmovAvatarProvider.ts`, `src/services/xmovAvatar.ts`, implementation record and README.

**Interfaces:** A feedback attempt carries `eventAtMs`. Provider signals each `submittedAtMs` immediately before the SDK speak invocation and forwards the first matching voice-start timestamp; UI reports `event→submit` and `submit→voice start`. Voice timing is reset per delivery and ignored after cancellation.

- [ ] Add per-response monotonic timing callbacks from the stable completion event through SDK submission and voice-start, surfaced as concise UI status.
- [ ] Statically trace measured delays and the existing serialized lane. Make the smallest ordering/queue correction supported by source evidence; avoid inventing a backend cause or playing unverified actions.
- [ ] Run TypeScript compiler and production build; `git diff --check`; no tests or behavioral probes. Commit.
- [ ] Request one fresh read-only static review; fix material findings in one pass with compiler/build only.
- [ ] Update M2.6 record with layout, timing observability and honest remaining human acceptance. Commit; keep branch for user camera/speech timing acceptance.
