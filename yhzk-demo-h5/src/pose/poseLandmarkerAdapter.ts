import {
  FilesetResolver,
  PoseLandmarker,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';
import {
  MEDIAPIPE_WASM_ROOT,
  POSE_LANDMARKER_MODEL_URL,
} from './poseConfig';
import type {
  PoseFrame,
  PoseLandmarkPoint,
} from './types';

export class PoseLandmarkerAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PoseLandmarkerAdapterError';
  }
}

export interface PoseLandmarkerAdapterOptions {
  wasmRoot?: string;
  modelAssetPath?: string;
  now?: () => number;
}

function normalizePose(
  points: readonly NormalizedLandmark[],
  label: string,
): PoseLandmarkPoint[] {
  if (points.length !== 33) {
    throw new PoseLandmarkerAdapterError(
      `${label} must contain exactly 33 landmarks; received ${points.length}`,
    );
  }

  return points.map((point) => ({
    x: point.x,
    y: point.y,
    z: point.z ?? 0,
    visibility: point.visibility ?? 0,
  }));
}

export class PoseLandmarkerAdapter {
  private closed = false;

  private constructor(
    private readonly runtime: PoseLandmarker,
    private readonly now: () => number,
  ) {}

  static async create(
    options: PoseLandmarkerAdapterOptions = {},
  ): Promise<PoseLandmarkerAdapter> {
    const fileset = await FilesetResolver.forVisionTasks(
      options.wasmRoot ?? MEDIAPIPE_WASM_ROOT,
    );
    const runtime = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          options.modelAssetPath ?? POSE_LANDMARKER_MODEL_URL,
      },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputSegmentationMasks: false,
    });

    return new PoseLandmarkerAdapter(
      runtime,
      options.now ?? (() => performance.now()),
    );
  }

  detect(
    video: HTMLVideoElement,
    timestampMs: number,
  ): PoseFrame | null {
    const startedAt = this.now();
    const result = this.runtime.detectForVideo(video, timestampMs);
    const finishedAt = this.now();

    const pose = result.landmarks[0];
    if (!pose) {
      return null;
    }

    const frame: PoseFrame = {
      timestampMs,
      landmarks: normalizePose(pose, 'Pose'),
      inferenceMs: finishedAt - startedAt,
    };

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
      frame.imageSize = { width, height };
    }

    const worldPose = result.worldLandmarks?.[0];
    if (worldPose) {
      frame.worldLandmarks = normalizePose(worldPose, 'World pose');
    }

    return frame;
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.runtime.close();
  }
}
