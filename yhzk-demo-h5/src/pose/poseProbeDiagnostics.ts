import { REQUIRED_POSE_LANDMARKS } from './poseConfig';
import type { PoseFrame, PoseLandmarkPoint } from './types';

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

function finitePoint(
  point: PoseLandmarkPoint | undefined,
): point is PoseLandmarkPoint {
  return Boolean(
    point
    && Number.isFinite(point.x)
    && Number.isFinite(point.y),
  );
}

function distance2d(
  a: PoseLandmarkPoint,
  b: PoseLandmarkPoint,
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(
  a: PoseLandmarkPoint,
  b: PoseLandmarkPoint,
): PoseLandmarkPoint {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: 0,
    visibility: Math.min(a.visibility, b.visibility),
  };
}

export function derivePoseProbeDiagnostics(
  frame: PoseFrame | null,
): PoseProbeDiagnostics {
  if (!frame) {
    return {
      shoulderWidth: null,
      torsoHeight: null,
      upperBodyBox: null,
    };
  }

  const leftShoulder = frame.landmarks[11];
  const rightShoulder = frame.landmarks[12];
  const leftHip = frame.landmarks[23];
  const rightHip = frame.landmarks[24];

  const shouldersValid =
    finitePoint(leftShoulder)
    && finitePoint(rightShoulder);
  const torsoValid =
    shouldersValid
    && finitePoint(leftHip)
    && finitePoint(rightHip);

  const shoulderWidth = shouldersValid
    ? distance2d(leftShoulder, rightShoulder)
    : null;

  const torsoHeight = torsoValid
    ? distance2d(
        midpoint(leftShoulder, rightShoulder),
        midpoint(leftHip, rightHip),
      )
    : null;

  const boxPoints = REQUIRED_POSE_LANDMARKS
    .map(({ index }) => frame.landmarks[index]);
  const upperBodyBox = boxPoints.every(finitePoint)
    ? {
        xMin: Math.min(...boxPoints.map((point) => point.x)),
        yMin: Math.min(...boxPoints.map((point) => point.y)),
        xMax: Math.max(...boxPoints.map((point) => point.x)),
        yMax: Math.max(...boxPoints.map((point) => point.y)),
      }
    : null;

  return {
    shoulderWidth,
    torsoHeight,
    upperBodyBox,
  };
}
