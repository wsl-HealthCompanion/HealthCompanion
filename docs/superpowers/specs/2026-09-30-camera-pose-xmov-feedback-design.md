# Milestone 2 — Camera → Pose → Xmov Feedback Design

> Date: 2026-09-30
> Repository: wulisususu/HealthCompanion
> Branch: feat/pose-shoulder-loop
> Base: Milestone 1 closed at 2e09c5c

## 1. Goal

Milestone 2 only proves one embodied loop:

用户面对摄像头完成一次“双臂抬至肩部高度并保持 3 秒”的动作，系统在浏览器本地识别姿势、判断错误与正确状态，并通过 Widget + 已验证 Xmov Action Registry 给出反馈。

Success means HealthCompanion can:
1. start/stop a browser camera explicitly;
2. run local pose landmark inference;
3. judge one shoulder-raise motion deterministically;
4. convert pose state into stable PerceptionEvent objects;
5. show exact feedback without sending every frame to an LLM;
6. use only Milestone 1 verified Xmov business actions;
7. complete wrong → correction → hold → completion.

Milestone 3 Tool Calling remains out of scope.

## 2. Scope

In scope:
- independent /pose-lab.html;
- local MediaPipe Pose Landmarker;
- one person;
- shoulder, elbow, wrist and hip landmarks;
- left/right shoulder raise angles;
- visibility and framing;
- torso lean;
- deterministic shoulder rule engine;
- 500 ms classification dwell;
- 3000 ms correct-pose hold;
- PerceptionEvent;
- live Widget;
- deterministic short speech;
- Action Registry keys warm_up, confirm, encourage;
- Xmov interrupt compatibility;
- raw frame processing remains local by default.

Out of scope:
- complete fitness routines;
- arbitrary exercise recognition;
- medical diagnosis or injury assessment;
- rep counting for multiple exercises;
- environment VLM;
- Android;
- raw video upload;
- server-side pose inference;
- LangGraph Tool Calling;
- per-frame LLM calls;
- new unverified Xmov semantics;
- claiming daoyou_Hello01 demonstrates the shoulder exercise.

## 3. Technology decision

Use MediaPipe Pose Landmarker through @mediapipe/tasks-vision.

Current stable npm line at design time is 1.0.1; implementation must pin an exact stable version and never use @latest.

Initial model: Pose Landmarker Lite.

Reasons:
- official output includes 33 body landmarks;
- required shoulders/elbows/wrists/hips are available;
- Lite is sufficient for the first browser proof-of-loop;
- lower latency matters more than maximum model precision here;
- input processing remains on device;
- normalized and world landmarks are available.

Use VIDEO mode and detectForVideo for M2.1.

MoveNet is only a fallback if MediaPipe proves unreliable in the intended browser. Server-side pose inference is rejected for M2 because it adds latency, backend load and video-transfer/privacy complexity.

## 4. Performance strategy

Official Web Pose Landmarker video inference is synchronous and can block the browser main thread.

M2 therefore does not infer on every rendered frame.

Initial target:
- camera: native browser FPS;
- pose inference: 10–15 Hz;
- Widget: latest available measurement;
- speech/Xmov: only stable state transitions.

M2.1 records inference duration, effective inference FPS and UI responsiveness.

Performance gate:
- intended demo machine must sustain at least 10 Hz;
- repeated UI stalls around or above 100 ms are unacceptable;
- if Lite cannot meet this, inference moves to a Web Worker before M2.2.

Worker use is a measured fallback, not speculative first-step complexity.

## 5. Runtime architecture

User click
→ CameraSession
→ HTMLVideoElement
→ PoseLandmarkerAdapter
→ PoseFrame
→ ShoulderRaiseRuleEngine
→ PoseAssessment
→ PoseSessionController
→ PerceptionEvent
→ PoseFeedbackWidget
→ deterministic speech
→ Action Registry
→ XmovAvatar

No LLM exists in the per-frame path.

## 6. Independent page

Add /pose-lab.html.

It must not import App.tsx.

M2.1 page contains:
- camera preview;
- optional skeleton/landmark overlay;
- camera state;
- required landmark visibility;
- inference latency/FPS;
- start camera;
- stop camera.

Later iterations add rule state, hold timer and Xmov, but the main app stays untouched until M2 is proven.

## 7. Camera lifecycle

Camera access only follows explicit user action.

Request:
navigator.mediaDevices.getUserMedia({
  video: { facingMode: 'user' },
  audio: false,
})

CameraStatus:
- idle
- requesting
- active
- denied
- error

Rules:
- no permission prompt on page load;
- stop calls stop() on every MediaStreamTrack;
- unmount also stops tracks;
- stopping the camera cancels inference scheduling;
- raw frames are not persisted by HealthCompanion;
- raw frames are not sent to NestJS, LangGraph or Xmov;
- errors are visible in Pose Lab.

Browser camera requires a secure context; localhost remains valid for development.

## 8. MediaPipe adapter boundary

Normalized point:

PoseLandmarkPoint:
- x: number
- y: number
- z: number
- visibility: number

PoseFrame:
- timestampMs: number
- landmarks: PoseLandmarkPoint[]
- worldLandmarks?: PoseLandmarkPoint[]
- inferenceMs: number

All later M2 components consume PoseFrame, not MediaPipe-specific result objects.

Required landmark indices:
- 11 left shoulder
- 12 right shoulder
- 13 left elbow
- 14 right elbow
- 15 left wrist
- 16 right wrist
- 23 left hip
- 24 right hip

Initial configuration:
- numPoses = 1
- minPoseDetectionConfidence = 0.5
- minPosePresenceConfidence = 0.5
- minTrackingConfidence = 0.5
- outputSegmentationMasks = false

## 9. Mirroring rule

The webcam preview may be CSS-mirrored for user comfort.

Pose data is never mirrored.

MediaPipe LEFT means the user's anatomical left.
MediaPipe RIGHT means the user's anatomical right.

The rule engine always follows those anatomical labels. Mirrored presentation must not swap the underlying data or feedback labels.

## 10. Shoulder geometry

Measure shoulder abduction with the angle at the shoulder between:
- shoulder → hip
- shoulder → elbow

Use normalized 2D coordinates for the first implementation.

Interpretation:
- arm alongside torso ≈ 0°
- arm horizontal ≈ 90°
- arm above horizontal > 90°

Initial target range: 80°–105°.

Per-side ArmMeasurement:
- angleDeg: number | null
- visible: boolean

ShoulderRaiseMeasurement:
- timestampMs
- bodyVisible
- left
- right
- torsoLeanDeg: number | null
- framing: too_far | ok | too_close | unknown

## 11. Visibility

Core evaluation requires shoulders, elbows and hips.

Default visibility threshold: 0.6.

A side is invalid if required landmarks are below threshold.

bodyVisible=true requires both sides to have valid shoulder, elbow and hip landmarks.

Wrists are useful for overlay/framing but are not required for shoulder-angle calculation.

The threshold lives in configuration, not React components.

## 12. Framing / distance

Distance is only a camera-framing heuristic, never physical distance.

M2.1 records normalized:
- shoulder width;
- torso height;
- upper-body bounding box.

M2.2 may classify:
- too_far
- ok
- too_close
- unknown

No centimeter estimate is shown.

If probe evidence is insufficient, ship unknown/ok rather than invent unreliable thresholds.

## 13. Torso lean

Use shoulder midpoint and hip midpoint.

Calculate 2D deviation from vertical.

Initial maxTorsoLeanDeg = 15°.

This is a broad posture gate, not spinal or medical assessment.

## 14. Rule engine

Pure TypeScript:
- no React;
- no MediaPipe import;
- no timers.

ShoulderRaiseRuleConfig:
- minArmAngleDeg
- maxArmAngleDeg
- visibilityThreshold
- maxTorsoLeanDeg

Initial values:
- minArmAngleDeg = 80
- maxArmAngleDeg = 105
- visibilityThreshold = 0.6
- maxTorsoLeanDeg = 15

PoseIssue:
- body_not_visible
- too_far
- too_close
- left_arm_too_low
- left_arm_too_high
- right_arm_too_low
- right_arm_too_high
- torso_lean

PoseAssessment contains:
- exercise = shoulder_raise
- correct
- issues
- measurement

Priority:
1. body visibility
2. framing
3. torso lean
4. arm angles
5. correct

The Widget may show all issues; speech selects one high-priority correction.

## 15. Session state

The rule engine judges individual frames. PoseSessionController owns time.

PoseSessionStatus:
- idle
- acquiring
- coaching
- holding
- completed
- paused

Stability:
- classification dwell = 500 ms
- correct hold = 3000 ms

Rules:
- one good frame cannot trigger pose_correct;
- correct must remain stable for 500 ms;
- hold begins only after stable correct entry;
- leaving target cancels hold;
- completed fires once per session;
- identical issues do not speak every inference frame.

The controller must be testable with injected timestamps.

## 16. PerceptionEvent

PosePerceptionEventName:
- body_not_visible
- framing_issue
- exercise_feedback
- pose_correct
- completed

PerceptionEvent:
- source = pose
- event
- optional confidence
- payload:
  - exercise = shoulder_raise
  - leftArmAngle?
  - rightArmAngle?
  - torsoLean?
  - framing?
  - issues?
  - holdMs?

Raw 33-landmark arrays are not part of the cross-component event.

This is the contract Milestone 3 will later consume.

## 17. Deterministic feedback

Examples:

body_not_visible
→ “往后一点，让我能看到你的肩膀和手臂。”

left_arm_too_low
→ “右边很好，左手再抬高一点。”

right_arm_too_low
→ “左边很好，右手再抬高一点。”

torso_lean
→ “身体尽量保持直立。”

pose_correct
→ “对，就是这里，保持三秒。”

completed
→ “很好，这一组完成了。”

No LLM is required for these lines.

## 18. Xmov integration

Exercise logic never references raw Xmov semantics.

Use M1.5 business keys:

session start → warm_up
stable pose_correct → confirm
completed → encourage

Current Registry:
- warm_up → daoyou_Hello01
- confirm → Nod
- encourage → skill_like

Important limitation:
daoyou_Hello01 is greeting/engagement feedback, not an exercise demonstration.

M2 does not claim Xmov demonstrates the shoulder movement.

## 19. Stop / interrupt

Stop session:
- cancel pose scheduling;
- reset hold/session state;
- call xmovAvatar.interrupt() if active;
- camera preview may remain active.

Stop camera:
- stop session;
- stop all MediaStream tracks;
- clear pose result;
- clear video source.

Existing chat/Xmov interrupt capability must remain compatible.

## 20. Widget

Minimum:
- 左臂角度
- 右臂角度
- 目标 80°–105°
- 当前姿势问题
- framing
- hold 0.0 / 3.0 s

Widget can update at pose inference frequency.

Speech and Xmov only respond to stable transitions.

## 21. Privacy boundary

Allowed:
camera frame → local MediaPipe
→ local landmarks
→ local rule engine
→ local Widget
→ local PerceptionEvent
→ local feedback controller

Not allowed:
raw frame → backend
raw frame → LangGraph
raw frame → Xmov
default raw video recording

Structured measurements may be logged during development if no image/video bytes are included.

MediaPipe runtime can have its own library-level metrics behavior; this design does not equate “local inference” with a promise of zero network traffic unless runtime assets/telemetry are separately verified.

## 22. Asset strategy

M2.1 pins @mediapipe/tasks-vision to an exact stable version and uses the official Pose Landmarker Lite model.

No @latest URLs.

For M2.1, runtime/model asset locations are explicit configuration.

Before M2.6 competition acceptance, required model/runtime assets must be served from the application deployment or another controlled versioned location rather than an unpinned external latest URL.

## 23. Iteration breakdown

### M2.1 — Camera + Pose Probe

Goal: prove camera lifecycle and stable local upper-body landmarks.

Deliver:
- /pose-lab.html
- explicit camera start/stop
- Pose Landmarker Lite
- landmark/skeleton overlay
- required landmark visibility
- inference timing/FPS
- no rule engine
- no Xmov feedback

PASS:
- camera starts/stops reliably
- tracks stop on teardown
- one person detected
- required upper-body points are stable
- anatomical left/right is correct despite mirrored preview
- at least 10 Hz on intended demo machine OR Worker decision recorded before M2.2
- raw frames are not uploaded

### M2.2 — Shoulder Raise Rule Engine

Deliver pure geometry, visibility, framing, torso lean and configurable shoulder rules.

No timer and no Xmov.

### M2.3 — Session + Hold Timer

Deliver 500 ms dwell, 3 s hold, hold cancellation, one-shot completion and PerceptionEvent.

### M2.4 — Pose Feedback Widget

Deliver live arm angles, target range, issue, framing, hold progress and session controls.

### M2.5 — Xmov Feedback Loop

Drive fixed speech and M1 Action Registry keys from stable pose events.

No LangGraph.

### M2.6 — End-to-End Verification

Observed sequence:
start
→ intentionally keep one arm low
→ correct-side feedback
→ user adjusts
→ pose_correct
→ hold 3 s
→ completed
→ Xmov completion feedback

Also verify stop, interrupt and local-frame privacy.

## 24. Testing strategy

Camera tests:
- no permission until explicit start
- permission rejection
- track stop
- unmount cleanup
- duplicate start protection

Pose adapter tests:
- fixed 33-landmark fixture
- no pose
- landmark indices
- visibility
- timestamp
- inference timing

Geometry tests:
- arm down ≈ 0°
- horizontal ≈ 90°
- above horizontal > 90°
- missing/low visibility

Rule tests:
- body missing
- left low
- right low
- both low
- too high
- torso lean
- correct

Session tests:
- no transition from one noisy frame
- transition after 500 ms
- completion after 3000 ms
- cancel hold on invalid pose
- completed once only

UI tests:
- camera state
- measurement display
- issue display
- hold progress
- stop controls

Xmov feedback tests:
- exercise controller contains no raw semantic
- pose_correct resolves confirm
- completed resolves encourage
- Xmov failure does not corrupt pose session

Manual real-camera acceptance is required before M2 closes.

## 25. Error handling

Camera denied:
show permission failure and return to a recoverable idle flow.

No person:
body_not_visible; no arm-angle coaching.

Partial person:
do not calculate invalid angles from missing landmarks.

MediaPipe init failure:
show model/runtime error; camera can still be stopped.

Inference error:
pause inference rather than retrying every animation frame.

Xmov unavailable:
pose loop and Widget continue; display Xmov feedback failure separately.

Pose correctness never depends on Xmov availability.

## 26. Risks

Main-thread inference:
mitigate with 10–15 Hz throttle, measurement gate, Worker fallback.

Mirrored preview:
mirror presentation only, never data labels.

Camera variation:
use configurable thresholds and real M2.1 measurements; do not invent physical distance.

Landmark jitter:
solve in session dwell/hold logic, not by contaminating frame-level geometry.

Xmov is not an exercise demonstrator:
Widget + speech explain the target; verified KA is social feedback only.

Secure-context requirement:
localhost/HTTPS only.

## 27. Milestone 2 PASS

- [ ] explicit camera start/stop
- [ ] camera tracks cleaned up
- [ ] local Pose Landmarker runs
- [ ] upper-body landmarks visible
- [ ] anatomical left/right correct
- [ ] shoulder angles calculated
- [ ] visibility/framing available
- [ ] user can produce correct left/right arm-too-low feedback
- [ ] feedback changes after correction
- [ ] correct pose stabilizes before hold
- [ ] 3-second hold completes
- [ ] Widget shows live values
- [ ] raw video remains local by default
- [ ] Xmov uses only verified Registry business keys
- [ ] user can interrupt/stop
- [ ] one wrong → correction → correct → hold → completed loop is visually recorded

## 28. Boundary to Milestone 3

M2 owns physical capability.

M3 later wraps proven interfaces as:
- PoseSessionController → pose_monitor
- Action Registry + Xmov bridge → avatar_action
- pose feedback state → show_widget

M3 must not redesign camera, geometry or exercise rules. It orchestrates already-proven capabilities.
