import { beforeEach, describe, expect, it, vi } from 'vitest';

const mediaPipeMocks = vi.hoisted(() => ({
  forVisionTasks: vi.fn(),
  createFromOptions: vi.fn(),
}));

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: {
    forVisionTasks: mediaPipeMocks.forVisionTasks,
  },
  PoseLandmarker: {
    createFromOptions: mediaPipeMocks.createFromOptions,
  },
}));

import {
  MEDIAPIPE_WASM_ROOT,
  POSE_LANDMARKER_MODEL_URL,
} from './poseConfig';
import {
  PoseLandmarkerAdapter,
  PoseLandmarkerAdapterError,
} from './poseLandmarkerAdapter';

function point(index: number) {
  return {
    x: index / 100,
    y: index / 200,
    z: -index / 300,
    visibility: index === 5 ? undefined : 0.8,
  };
}

function pose(count = 33) {
  return Array.from({ length: count }, (_, index) => point(index));
}

describe('PoseLandmarkerAdapter', () => {
  const detectForVideo = vi.fn();
  const close = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mediaPipeMocks.forVisionTasks.mockResolvedValue({ fileset: true });
    mediaPipeMocks.createFromOptions.mockResolvedValue({
      detectForVideo,
      close,
    });
  });

  it('creates MediaPipe VIDEO landmarker with pinned probe options', async () => {
    await PoseLandmarkerAdapter.create();

    expect(mediaPipeMocks.forVisionTasks).toHaveBeenCalledWith(
      MEDIAPIPE_WASM_ROOT,
    );
    expect(mediaPipeMocks.createFromOptions).toHaveBeenCalledWith(
      { fileset: true },
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
      },
    );
  });

  it('normalizes a 33-point pose into repository-owned data', async () => {
    detectForVideo.mockReturnValue({
      landmarks: [pose()],
      worldLandmarks: [pose()],
    });
    const times = [100, 104];
    const adapter = await PoseLandmarkerAdapter.create({
      now: () => times.shift() ?? 104,
    });
    const video = {} as HTMLVideoElement;

    const frame = adapter.detect(video, 1234);

    expect(detectForVideo).toHaveBeenCalledWith(video, 1234);
    expect(frame?.timestampMs).toBe(1234);
    expect(frame?.inferenceMs).toBe(4);
    expect(frame?.landmarks).toHaveLength(33);
    expect(frame?.landmarks[4]).toEqual({
      x: 0.04,
      y: 0.02,
      z: -4 / 300,
      visibility: 0.8,
    });
    expect(frame?.landmarks[5].visibility).toBe(0);
    expect(frame?.worldLandmarks).toHaveLength(33);
    expect(frame?.worldLandmarks).not.toBe(detectForVideo.mock.results[0]?.value?.worldLandmarks?.[0]);
  });

  it('returns null when MediaPipe reports no detected person', async () => {
    detectForVideo.mockReturnValue({
      landmarks: [],
      worldLandmarks: [],
    });
    const adapter = await PoseLandmarkerAdapter.create();

    expect(adapter.detect({} as HTMLVideoElement, 500)).toBeNull();
  });

  it('rejects malformed pose landmark counts diagnostically', async () => {
    detectForVideo.mockReturnValue({
      landmarks: [pose(32)],
      worldLandmarks: [],
    });
    const adapter = await PoseLandmarkerAdapter.create();

    expect(() => adapter.detect({} as HTMLVideoElement, 500)).toThrow(
      PoseLandmarkerAdapterError,
    );
    expect(() => adapter.detect({} as HTMLVideoElement, 500)).toThrow(/33/);
  });

  it('delegates close exactly once', async () => {
    const adapter = await PoseLandmarkerAdapter.create();

    adapter.close();
    adapter.close();

    expect(close).toHaveBeenCalledTimes(1);
  });
});
