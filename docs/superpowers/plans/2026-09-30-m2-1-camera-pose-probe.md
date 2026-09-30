# Milestone 2.1 Camera + Pose Probe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an isolated `/pose-lab.html` that explicitly starts/stops the browser camera, runs MediaPipe Pose Landmarker Lite locally at a throttled 10–15 Hz target, displays the required upper-body landmarks and performance measurements, and proves the raw-frame privacy boundary before any exercise rule is implemented.

**Architecture:** Camera ownership lives in a small `CameraSession`; MediaPipe-specific objects are hidden behind `PoseLandmarkerAdapter`, which outputs repository-owned `PoseFrame` data; `PoseProbeLoop` owns throttling and cancellation; `PoseLabPage` only owns browser refs/state and rendering. M2.1 contains no shoulder-angle rule engine, hold timer, PerceptionEvent, Xmov feedback or LangGraph.

**Tech Stack:** React 18, TypeScript 5.3, Vite 5.4, Vitest 2.1.9, `@mediapipe/tasks-vision@1.0.1`, MediaPipe Pose Landmarker Lite.

**Spec:** `docs/superpowers/specs/2026-09-30-camera-pose-xmov-feedback-design.md`

## Global Constraints

- Work only on M2.1 Camera + Pose Probe.
- Add independent `/pose-lab.html`; do not modify `App.tsx`.
- Camera permission occurs only after explicit user click.
- Request video only: `{ video: { facingMode: 'user' }, audio: false }`.
- Raw camera frames are never sent to NestJS, LangGraph or Xmov and are not recorded.
- Pin runtime package exactly: `@mediapipe/tasks-vision@1.0.1`.
- Do not use any `@latest` MediaPipe URL.
- Probe model: official Pose Landmarker Lite, fixed model revision 1.
- Use `runningMode: 'VIDEO'`, `numPoses: 1`, confidence values `0.5`, segmentation masks disabled.
- Pose adapter must output repository-owned `PoseFrame`, not MediaPipe objects.
- Required indices: shoulders 11/12, elbows 13/14, wrists 15/16, hips 23/24.
- Camera preview is mirror-like, but pose labels remain anatomical MediaPipe left/right.
- Inference target interval is 80 ms (12.5 Hz target, within the 10–15 Hz design range).
- No Rule Engine, shoulder-angle classification, session dwell/hold timer, Xmov action, speech correction or LangGraph.
- Production build must include `dist/pose-lab.html`.
- Real-camera performance/landmark stability requires manual M2.1 acceptance; unit tests cannot prove it.

## Fixed runtime asset defaults

Add H5 environment overrides while keeping fixed defaults:

```text
VITE_MEDIAPIPE_WASM_ROOT
default = https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm

VITE_POSE_LANDMARKER_MODEL_URL
default = https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
```

These external fixed-version resources are acceptable for M2.1 probing. M2.6 must move required competition assets to an application-controlled/versioned location before final acceptance.

## File structure

```text
yhzk-demo-h5/
├── pose-lab.html
├── .env.example
├── package.json
├── package-lock.json
├── vite.config.ts
└── src/
    ├── pose-lab.tsx
    ├── pose-lab.scss
    ├── pose/
    │   ├── types.ts
    │   ├── cameraSession.ts
    │   ├── cameraSession.spec.ts
    │   ├── poseConfig.ts
    │   ├── poseLandmarkerAdapter.ts
    │   ├── poseLandmarkerAdapter.spec.ts
    │   ├── poseProbeDiagnostics.ts
    │   ├── poseProbeDiagnostics.spec.ts
    │   ├── poseProbeLoop.ts
    │   └── poseProbeLoop.spec.ts
    └── components/
        ├── PoseLabPage.tsx
        └── PoseLabPage.spec.tsx
```

## Review Focus

1. **Duplicate camera starts:** repeated start calls while requesting/active must not issue additional `getUserMedia` requests or leak streams.
2. **Camera teardown:** stop and unmount must stop every track and cancel probe scheduling; no camera light remains on.
3. **Malformed/no pose result:** no pose returns `null`; a pose with a non-33-point landmark array is a diagnostic adapter error rather than silently feeding bad data downstream.
4. **Video timing:** inference must not re-run on the same `video.currentTime`; timestamps supplied to MediaPipe must be monotonically increasing milliseconds.
5. **Mirroring:** visual x coordinates are mirrored for the overlay, but labels still describe anatomical LEFT/RIGHT from MediaPipe indices.

---

### Task 1: Camera lifecycle primitive

**Files:**
- Create: `yhzk-demo-h5/src/pose/cameraSession.ts`
- Create: `yhzk-demo-h5/src/pose/cameraSession.spec.ts`
- Create: `yhzk-demo-h5/src/pose/types.ts`
- Modify: `yhzk-demo-h5/package.json`

**Interfaces:**

```ts
export type CameraStatus =
  | 'idle'
  | 'requesting'
  | 'active'
  | 'denied'
  | 'error';

export interface CameraSessionDeps {
  getUserMedia: (
    constraints: MediaStreamConstraints,
  ) => Promise<MediaStream>;
}

export class CameraSession {
  constructor(deps?: Partial<CameraSessionDeps>);
  getStatus(): CameraStatus;
  getStream(): MediaStream | null;
  getError(): string;
  start(): Promise<MediaStream>;
  stop(): void;
}
```

`types.ts` also establishes the later M2.1 interfaces:

```ts
export interface PoseLandmarkPoint {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface PoseFrame {
  timestampMs: number;
  landmarks: PoseLandmarkPoint[];
  worldLandmarks?: PoseLandmarkPoint[];
  inferenceMs: number;
}
```

- [ ] **Step 1: Add a scoped Pose Lab test script**

Add:

```json
"test:pose-lab": "vitest run src/pose/cameraSession.spec.ts src/pose/poseLandmarkerAdapter.spec.ts src/pose/poseProbeDiagnostics.spec.ts src/pose/poseProbeLoop.spec.ts src/components/PoseLabPage.spec.tsx"
```

The files need not all exist yet; during a task, run the current spec directly with `npx vitest run <file>`.

- [ ] **Step 2: Write CameraSession RED tests**

Tests:

- constructor does not call `getUserMedia`;
- `start()` calls exactly:

```ts
{
  video: { facingMode: 'user' },
  audio: false,
}
```

- successful start sets `active` and exposes the returned stream;
- two starts while the first request is pending call `getUserMedia` only once and both resolve to the same stream;
- start while already active returns the existing stream without another permission request;
- `NotAllowedError` sets status `denied` and preserves a readable error;
- another failure sets status `error`;
- `stop()` calls `stop()` on every stream track exactly once, clears stream/error and returns to `idle`;
- `stop()` is idempotent.

Use fake track objects; do not require jsdom.

- [ ] **Step 3: Run CameraSession spec and confirm RED**

Run:

```bash
cd yhzk-demo-h5
npx vitest run src/pose/cameraSession.spec.ts
```

Expected: FAIL because the primitive does not exist.

- [ ] **Step 4: Implement CameraSession + shared types minimally**

Use browser `navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)` only as the default dependency. Keep a single pending promise so duplicate starts cannot open multiple streams.

- [ ] **Step 5: Run CameraSession spec and confirm GREEN**

Expected: all lifecycle tests PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add yhzk-demo-h5/package.json \
        yhzk-demo-h5/src/pose/types.ts \
        yhzk-demo-h5/src/pose/cameraSession.ts \
        yhzk-demo-h5/src/pose/cameraSession.spec.ts
git commit -m "feat(pose): add explicit camera lifecycle"
```

---

### Task 2: Pinned MediaPipe Pose adapter

**Files:**
- Modify: `yhzk-demo-h5/package.json`
- Modify: `yhzk-demo-h5/package-lock.json`
- Modify: `yhzk-demo-h5/.env.example`
- Create: `yhzk-demo-h5/src/pose/poseConfig.ts`
- Create: `yhzk-demo-h5/src/pose/poseLandmarkerAdapter.ts`
- Create: `yhzk-demo-h5/src/pose/poseLandmarkerAdapter.spec.ts`

**Interfaces:**

`poseConfig.ts` exports:

```ts
export const MEDIAPIPE_WASM_ROOT: string;
export const POSE_LANDMARKER_MODEL_URL: string;
export const REQUIRED_POSE_LANDMARKS: ReadonlyArray<{
  index: number;
  key:
    | 'left_shoulder'
    | 'right_shoulder'
    | 'left_elbow'
    | 'right_elbow'
    | 'left_wrist'
    | 'right_wrist'
    | 'left_hip'
    | 'right_hip';
  label: string;
}>;
```

`poseLandmarkerAdapter.ts` exports:

```ts
export class PoseLandmarkerAdapterError extends Error {}

export interface PoseLandmarkerAdapterOptions {
  wasmRoot?: string;
  modelAssetPath?: string;
  now?: () => number;
}

export class PoseLandmarkerAdapter {
  static create(
    options?: PoseLandmarkerAdapterOptions,
  ): Promise<PoseLandmarkerAdapter>;

  detect(
    video: HTMLVideoElement,
    timestampMs: number,
  ): PoseFrame | null;

  close(): void;
}
```

- [ ] **Step 1: Install the runtime dependency exactly**

Run:

```bash
npm install --save-exact @mediapipe/tasks-vision@1.0.1
```

Do not hand-edit `package-lock.json`.

- [ ] **Step 2: Add the versioned asset configuration**

Append to `.env.example`:

```env
# MediaPipe Pose Lab / M2.1
VITE_MEDIAPIPE_WASM_ROOT=https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm
VITE_POSE_LANDMARKER_MODEL_URL=https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
```

`poseConfig.ts` uses these Vite vars with exactly those fixed defaults.

- [ ] **Step 3: Write adapter initialization RED tests**

Mock `@mediapipe/tasks-vision`.

Assert creation invokes `FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_ROOT)` then `PoseLandmarker.createFromOptions()` with:

```ts
{
  baseOptions: {
    modelAssetPath: POSE_LANDMARKER_MODEL_URL,
  },
  runningMode: 'VIDEO',
  numPoses: 1,
  minPoseDetectionConfidence: 0.5,
  minPosePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
  outputSegmentationMasks: false,
}
```

Do not force a GPU delegate in M2.1; use MediaPipe's default delegate so the first probe measures the broadest-compatible baseline.

- [ ] **Step 4: Write adapter result RED tests**

Use a 33-point fixture.

Assert:
- first detected pose becomes one `PoseFrame`;
- x/y/z copied exactly;
- missing visibility becomes `0`;
- first world-landmark pose is normalized when available;
- supplied `timestampMs` is preserved;
- `inferenceMs` equals injected `now()` end-start delta;
- empty `result.landmarks` returns `null`;
- 32-point pose throws `PoseLandmarkerAdapterError` mentioning 33;
- `close()` delegates exactly once to MediaPipe runtime close.

- [ ] **Step 5: Run adapter spec and confirm RED**

```bash
npx vitest run src/pose/poseLandmarkerAdapter.spec.ts
```

Expected: FAIL because adapter/config do not exist.

- [ ] **Step 6: Implement the minimal adapter**

Use synchronous `detectForVideo(video, timestampMs)`. Copy result values immediately into repository-owned plain objects.

No rule-engine logic and no anatomical mirroring belong in this adapter.

- [ ] **Step 7: Run adapter spec and confirm GREEN**

Expected: all adapter tests PASS.

- [ ] **Step 8: Commit Task 2**

```bash
git add yhzk-demo-h5/package.json yhzk-demo-h5/package-lock.json \
        yhzk-demo-h5/.env.example \
        yhzk-demo-h5/src/pose/poseConfig.ts \
        yhzk-demo-h5/src/pose/poseLandmarkerAdapter.ts \
        yhzk-demo-h5/src/pose/poseLandmarkerAdapter.spec.ts
git commit -m "feat(pose): add pinned MediaPipe pose adapter"
```

---

### Task 3: Probe diagnostics for M2.2 calibration

**Files:**
- Create: `yhzk-demo-h5/src/pose/poseProbeDiagnostics.ts`
- Create: `yhzk-demo-h5/src/pose/poseProbeDiagnostics.spec.ts`

**Interfaces:**

```ts
export interface PoseProbeDiagnostics {
  shoulderWidth: number | null;
  torsoHeight: number | null;
  upperBodyBox: {
    xMin: number;
    yMin: number;
    xMax: number;
    yMax: number;
  } | null;
}

export function derivePoseProbeDiagnostics(
  frame: PoseFrame | null,
): PoseProbeDiagnostics;
```

- [ ] **Step 1: Write diagnostics RED tests**

Use normalized landmark fixtures and assert:

- null frame returns all-null diagnostics;
- shoulder width is the 2D Euclidean distance between indices 11 and 12;
- torso height is the 2D Euclidean distance between shoulder midpoint and hip midpoint (23/24);
- upper-body bounding box is min/max x/y across required indices 11,12,13,14,15,16,23,24;
- missing/non-finite required coordinates produce null for the affected diagnostic rather than NaN;
- no threshold/classification such as too_far/too_close is produced in M2.1.

- [ ] **Step 2: Run diagnostics spec and confirm RED**

```bash
npx vitest run src/pose/poseProbeDiagnostics.spec.ts
```

Expected: FAIL because diagnostics helper does not exist.

- [ ] **Step 3: Implement the pure diagnostics helper**

This task only records normalized geometry for later M2.2 calibration. It must not decide whether the person is near/far or whether the pose is correct.

- [ ] **Step 4: Run diagnostics spec and confirm GREEN**

Expected: all diagnostics tests PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add yhzk-demo-h5/src/pose/poseProbeDiagnostics.ts \
        yhzk-demo-h5/src/pose/poseProbeDiagnostics.spec.ts
git commit -m "feat(pose): add probe calibration diagnostics"
```

---

### Task 4: Throttled Pose probe loop

**Files:**
- Create: `yhzk-demo-h5/src/pose/poseProbeLoop.ts`
- Create: `yhzk-demo-h5/src/pose/poseProbeLoop.spec.ts`

**Interfaces:**

```ts
export interface PoseProbeStats {
  effectiveFps: number;
  skippedFrames: number;
  lastInferenceMs: number | null;
}

export interface PoseProbeSample {
  frame: PoseFrame | null;
  stats: PoseProbeStats;
}

export interface PoseProbeLoopDeps {
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (handle: number) => void;
  now: () => number;
}

export class PoseProbeLoop {
  constructor(
    adapter: Pick<PoseLandmarkerAdapter, 'detect'>,
    deps?: Partial<PoseProbeLoopDeps>,
    intervalMs?: number, // default 80
  );

  start(
    video: HTMLVideoElement,
    onSample: (sample: PoseProbeSample) => void,
    onError: (error: Error) => void,
  ): void;

  stop(): void;
  isRunning(): boolean;
}
```

- [ ] **Step 1: Write loop RED tests**

Using injected fake RAF and time, assert:

- `start()` schedules one frame callback;
- default inference interval is 80 ms;
- repeated RAF ticks before 80 ms increment `skippedFrames` and do not call adapter;
- unchanged `video.currentTime` does not run inference twice;
- when inference runs, timestamp passed to adapter is `video.currentTime * 1000`;
- changing video time + crossing 80 ms produces another sample;
- `effectiveFps` counts inference timestamps in the trailing 1000 ms window;
- `lastInferenceMs` comes from returned `PoseFrame.inferenceMs`, or remains null for no-pose;
- adapter throw calls `onError` once and stops scheduling;
- `stop()` cancels the pending RAF and prevents later detection;
- repeated `start()` while running does not create a second loop.

- [ ] **Step 2: Run loop spec and confirm RED**

```bash
npx vitest run src/pose/poseProbeLoop.spec.ts
```

Expected: FAIL because loop does not exist.

- [ ] **Step 3: Implement the throttled loop**

Use `requestAnimationFrame` only as the scheduler; the 80 ms clock gate determines whether inference runs. Keep a rolling list of inference wall-clock timestamps no older than 1000 ms; `effectiveFps` is that list's count.

Do not introduce a Worker in this task.

- [ ] **Step 4: Run loop spec and confirm GREEN**

Expected: all probe scheduling tests PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add yhzk-demo-h5/src/pose/poseProbeLoop.ts \
        yhzk-demo-h5/src/pose/poseProbeLoop.spec.ts
git commit -m "feat(pose): add throttled pose probe loop"
```

---

### Task 5: Independent Pose Lab probe page and production entry

**Files:**
- Create: `yhzk-demo-h5/src/components/PoseLabPage.tsx`
- Create: `yhzk-demo-h5/src/components/PoseLabPage.spec.tsx`
- Create: `yhzk-demo-h5/pose-lab.html`
- Create: `yhzk-demo-h5/src/pose-lab.tsx`
- Create: `yhzk-demo-h5/src/pose-lab.scss`
- Modify: `yhzk-demo-h5/vite.config.ts`

**Interfaces:**

Pure view state:

```ts
export interface PoseLabViewState {
  cameraStatus: CameraStatus;
  modelStatus: 'idle' | 'loading' | 'ready' | 'error';
  frame: PoseFrame | null;
  stats: PoseProbeStats;
  diagnostics: PoseProbeDiagnostics;
  error: string;
}

export interface PoseLabViewProps {
  state: PoseLabViewState;
  onStartCamera: () => void;
  onStopCamera: () => void;
  videoElement: React.ReactNode;
}
```

Required view helpers:

```ts
export function mirroredOverlayX(x: number): number {
  return 1 - x;
}
```

- [ ] **Step 1: Write pure Pose Lab view RED tests**

Using `renderToStaticMarkup`, assert:

- idle page shows `开启摄像头` and does not imply camera is active;
- requesting shows permission/request state;
- denied/error shows the actual error;
- active state shows `关闭摄像头`;
- no pose shows `未检测到人体`;
- a fixed 33-point frame renders all 8 required anatomical labels:
  `左肩/右肩/左肘/右肘/左腕/右腕/左髋/右髋`;
- each label shows visibility rounded to two decimals;
- stats show inference milliseconds, effective FPS and skipped-frame count;
- diagnostics show normalized shoulder width, torso height and upper-body bbox when available;
- diagnostics remain measurements only and contain no near/far classification;
- `mirroredOverlayX(0.2) === 0.8`;
- an anatomical left-shoulder fixture remains labelled `左肩` after display mirroring;
- page contains no shoulder-angle, “姿势正确”, 3-second hold, Xmov or LangGraph controls.

- [ ] **Step 2: Run view spec and confirm RED**

```bash
npx vitest run src/components/PoseLabPage.spec.tsx
```

Expected: FAIL because page does not exist.

- [ ] **Step 3: Implement the pure view and SVG overlay**

Overlay only the required upper-body skeleton for the probe, using normalized coordinates.

Connections:

```text
11–12
11–13
13–15
12–14
14–16
11–23
12–24
23–24
```

The video is CSS-mirrored. SVG x coordinates use `1 - x` so overlay remains aligned while anatomical labels are not swapped or mirrored as text.

- [ ] **Step 4: Implement the state-owning PoseLabPage**

Lifecycle:

1. initial state performs no camera request;
2. user clicks start;
3. `CameraSession.start()`;
4. set `video.srcObject`, await `video.play()`;
5. lazily create `PoseLandmarkerAdapter` once;
6. start `PoseProbeLoop`;
7. update latest frame/stats from samples;
8. on inference/model error, show error and stop probe scheduling;
9. Stop Camera stops probe, closes MediaStream tracks, clears `srcObject`, frame and stats;
10. unmount does the same camera/probe cleanup and also `adapter.close()`.

Export and use these cleanup helpers so teardown is unit-testable without jsdom:

```ts
export function stopPoseLabRuntime(args: {
  camera: Pick<CameraSession, 'stop'>;
  loop: Pick<PoseProbeLoop, 'stop'>;
  video: { srcObject: MediaStream | null } | null;
}): void;

export function disposePoseLabRuntime(args: {
  camera: Pick<CameraSession, 'stop'>;
  loop: Pick<PoseProbeLoop, 'stop'>;
  adapter: Pick<PoseLandmarkerAdapter, 'close'> | null;
  video: { srcObject: MediaStream | null } | null;
}): void;
```

Add view/runtime tests proving:
- Stop Camera calls loop.stop + camera.stop and clears video.srcObject;
- dispose/unmount additionally calls adapter.close;
- both helpers are idempotent with null video/adapter.

If MediaPipe initialization fails after camera acquisition, the camera remains explicitly stoppable and the error is shown.

- [ ] **Step 5: Run all Pose Lab unit tests and confirm GREEN**

```bash
npm run test:pose-lab
```

Expected: all five Pose Lab specs PASS.

- [ ] **Step 6: Add independent HTML/entry/style**

`pose-lab.html`:
- root id `pose-lab-root`;
- title `康伴智生 · Pose Lab`;
- module entry `/src/pose-lab.tsx`.

`pose-lab.tsx` renders only `PoseLabPage` and imports `pose-lab.scss`.

Style:
- desktop: camera/overlay left, diagnostics right;
- narrow screens: stacked;
- camera preview and SVG share the same aspect box;
- visible camera/model status;
- do not add exercise feedback styling yet.

- [ ] **Step 7: Register the production page**

Add `pose-lab.html` to existing Vite `build.rollupOptions.input`; keep the existing three pages.

- [ ] **Step 8: Run final automated verification**

```bash
npm run test:pose-lab
npm run test:xmov-action-lab
npm run build
test -f dist/index.html
test -f dist/xmov-task1.html
test -f dist/xmov-action-lab.html
test -f dist/pose-lab.html
```

Expected:
- all M2.1 tests PASS;
- existing M1 Action Lab tests still PASS;
- TypeScript/Vite build exits 0;
- all four HTML entries exist.

- [ ] **Step 9: Scope verification**

Diff must contain Camera/Pose probe files and dependency/config/build wiring only.

Must not contain:
- `App.tsx` changes;
- backend changes;
- shoulder-angle rule engine;
- PoseAssessment/PerceptionEvent;
- dwell/hold timers;
- Action Registry changes;
- Xmov playback calls;
- LangGraph changes.

- [ ] **Step 10: Commit Task 5**

```bash
git add yhzk-demo-h5
git commit -m "feat(pose): add Camera Pose Lab probe page"
```

---

## M2.1 Manual Acceptance

Automated tests prove lifecycle contracts, normalization, throttling and rendering. M2.1 is not accepted until the probe is exercised with the intended demo computer and webcam.

Open:

```text
https://localhost:5273/pose-lab.html
```

Record:

```text
browser:
camera:
resolution:
MediaPipe package: 1.0.1
model: pose_landmarker_lite float16 revision 1
median inference ms:
observed effective FPS:
UI stall observed: yes/no
Worker required before M2.2: yes/no
```

Perform these checks:

- [ ] Opening the page does not prompt for camera permission.
- [ ] Clicking `开启摄像头` prompts once and starts preview.
- [ ] Preview is mirror-like.
- [ ] Move only the user's anatomical left arm and confirm the UI's `左肩/左肘/左腕` points follow that arm.
- [ ] Move the right arm and confirm the right labels.
- [ ] Shoulder/elbow/wrist/hip overlay tracks the upper body visibly.
- [ ] Stand centered and record visibility values for the 8 required landmarks.
- [ ] Move farther/closer and record shoulder width, torso height or visual observations needed for M2.2 framing thresholds.
- [ ] Observe inference for at least 30 seconds.
- [ ] Effective inference reaches at least 10 Hz on the intended machine.
- [ ] Repeated blocking/UI stalls around or above 100 ms are not observed.
- [ ] If either performance condition fails, record `Worker required before M2.2 = yes`; do not start M2.2 until the Worker change is designed.
- [ ] Clicking `关闭摄像头` turns off the camera indicator and clears the probe.
- [ ] Starting again works without refresh.
- [ ] Browser Network panel shows no HealthCompanion backend request carrying image/video/frame data.
- [ ] Expected MediaPipe model/WASM asset downloads are distinguishable from application data traffic.

## M2.1 Completion Boundary

M2.1 closes only when:

- camera lifecycle tests pass;
- MediaPipe adapter tests pass;
- probe calibration diagnostics tests pass;
- throttling/cancellation tests pass;
- Pose Lab view tests pass;
- existing M1 Action Lab regression tests pass;
- frontend production build passes;
- `dist/pose-lab.html` exists;
- real webcam shows stable anatomical upper-body landmarks;
- real probe performance is documented;
- the Worker decision is explicitly `yes` or `no`;
- no exercise correctness logic has been implemented.

Only then begin **M2.2 — Shoulder Raise Rule Engine**.
