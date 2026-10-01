# M2.5 — Xmov Pose Feedback Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn stable shoulder-training events into short fixed speech and verified digital-human social actions.

**Architecture:** A deterministic feedback controller selects one priority correction and owns cancellation/deduplication. A bridge resolves verified business action keys and sends speech plus KA in one SDK utterance, avoiding competing speech/action requests. The training hook delivers events directly; an optional player panel exposes readiness and isolates avatar failures from pose state.

**Tech Stack:** Existing TypeScript/React/SCSS, PerceptionEvent, Action Registry and Xmov SDK/provider; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-30-camera-pose-xmov-feedback-design.md`, sections17–21/23/25. The user requested the next milestone after confirming M2.4's basic real-camera completion flow.

## Global Constraints

- Start → warm_up; stable pose_correct → confirm; completed → encourage. Resolve only verified registry entries. warm_up is greeting, never an exercise demonstration.
- Stable negative events speak the highest priority issue: visibility, framing, torso, then anatomical left/right arm. Do not assert the other arm is correct without evidence.
- Use existing500ms dwell/3000ms hold/250ms expiry; no duplicated inference, posture rules or timing.
- Deliver controller events synchronously once, independent of React batching. Identical primary corrections do not speak on every frame or secondary-issue transition.
- New feedback replaces old feedback. Pause, stop, hide, camera change/end/error and unmount cancel queued/active feedback. Hold cancellation invalidates correctness feedback immediately before another classification stabilizes.
- An explicit connection button mounts the player. Connection readiness never replays historical pose events; connect before starting for the full loop. Failure is visible separately and pose continues.
- No raw frames/landmarks go to Xmov, backend or LLM. No LangGraph and no new unverified semantics.
- User requested development without automated testing. Do not add/modify/run tests or camera/SDK probes. Compile/build and static review only; actual speech, KA and interruption acceptance remains M2.6.
- Use current feature checkout and local commits; no merge/push. Continue inline execution under existing user authorization.

## Review Focus

- Stop/restart and rapidly changing stable events during asynchronous SDK calls cannot dispatch stale feedback or let an old interrupt cut off the new response.
- A canceled hold, stale sample, hidden tab, camera error/switch or unmount cancels feedback even when no new stable event exists.
- React batching cannot lose completion or replay an old event upon avatar readiness/reconnection; identical priority errors cannot spam speech.
- Provider init completing after disconnect/unmount must release its own session and cannot attach/revive stale readiness; SDK failure cannot stop pose sampling.
- Anatomical side labels and multi-issue priority are correct; speech/action use a single escaped SSML envelope with registry-verified semantics only.

### Task 1: Deterministic feedback and SDK delivery

**Files:** Create `yhzk-demo-h5/src/pose/poseAvatarFeedback.ts`; modify `src/services/xmovAvatar.ts`, `src/avatar/xmovKa.ts`, `src/avatar/XmovAvatarProvider.ts` under the frontend.

**Interfaces:**
- Produces `PoseAvatarFeedbackController(port, onChange)` with start(), resume(), cancel(), invalidate(), handleEvent(event), setAvailable(boolean); port isReady(), send(feedback,signal):Promise<boolean>, interrupt():Promise<void>.
- Feedback contains text, key and optional business action warm_up/confirm/encourage; no raw SDK semantics or pose arrays.
- Produces bridge `sendPoseFeedback(text, actionKey, signal):Promise<boolean>`; false means canceled, errors remain observable. Existing chat methods retain their API.
- Extends buildXmovKaSsml with optional escaped speech text; provider `speakFeedback(text,semantic|null,clientSpeakId)` bypasses chat expression state.

- [x] Implement priority copy, primary-key deduplication, active-session gating and cancellation tokens; isolate rejected SDK delivery from pose state.
- [x] Add serialized generation/provider/abort guards around feedback dispatch and interruption; verified registry lookup lives in bridge. Use one speech/KA utterance.
- [x] Compile frontend (exit0); inspect diff; commit files. Tests deferred.

### Task 2: Live lifecycle and digital-human panel

**Files:** Modify `src/pose/usePoseTrainingSession.ts`, `src/components/PoseLabPage.tsx`, `src/components/XmovAvatarPlayer.tsx`, `src/avatar/XmovAvatarProvider.ts`, `src/pose-lab.scss`; create `src/components/PoseAvatarFeedbackPanel.tsx`, `src/pose/usePoseAvatarFeedback.ts` under frontend.

**Interfaces:**
- Hook accepts optional observer onStart/onResume/onCancel/onInvalidate/onEvent, called directly at lifecycle/event boundaries, caught independently of inference.
- `usePoseAvatarFeedback()` returns feedback state, stable training observer and availability handler. Cleanup cancels feedback without late UI writes.
- Player optional onAvailabilityChange callback and training presentation; existing default player users remain compatible.
- Panel connects/disconnects/reconnects player, shows short speech and isolated unavailable/failure state; no automatic replay when ready.

- [x] Integrate event observer and immediate cancellation, including expiry and completed-session camera teardown.
- [x] Expose player availability, protect initialization against teardown and show nontechnical training copy. Add explicit connection/retry controls and responsive panel.
- [x] Build production and git diff --check (exit0); no tests or camera/SDK execution. Commit implementation.
- [x] Request one fresh static review; fix material findings in one pass using compiler/build, without adding/running tests.
- [x] Record implementation, review decisions and M2.6 pending acceptance in docs/specs and docs/README.md; commit and keep current branch.
