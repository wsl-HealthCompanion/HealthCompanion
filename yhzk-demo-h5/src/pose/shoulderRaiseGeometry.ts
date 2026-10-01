import type { PoseFrame, PoseLandmarkPoint } from './types';
import type {
  ArmMeasurement,
  PoseFraming,
  ShoulderRaiseMeasurement,
  ShoulderRaiseMeasurementConfig,
} from './shoulderRaiseTypes';

const VECTOR_EPSILON = 1e-10;
const SIZE_EPSILON = 1e-10;
const DEFAULT_MEASUREMENT_CONFIG: Readonly<ShoulderRaiseMeasurementConfig> = Object.freeze({
  visibilityThreshold: 0.6,
});

function validateConfig(config: ShoulderRaiseMeasurementConfig): void {
  if (!Number.isFinite(config.visibilityThreshold)
    || config.visibilityThreshold < 0 || config.visibilityThreshold > 1) {
    throw new RangeError('visibilityThreshold must be between 0 and 1');
  }
  if (!config.framing) return;
  const { minShoulderWidth, maxShoulderWidth, minTorsoHeight, maxTorsoHeight } = config.framing;
  const values = [minShoulderWidth, maxShoulderWidth, minTorsoHeight, maxTorsoHeight];
  if (values.some((value) => !Number.isFinite(value) || value < 0 || value > Math.SQRT2)
    || minShoulderWidth >= maxShoulderWidth || minTorsoHeight >= maxTorsoHeight) {
    throw new RangeError('framing limits must be finite normalized sizes with min < max');
  }
}

function usablePoint(
  point: PoseLandmarkPoint | undefined,
  threshold: number,
): point is PoseLandmarkPoint {
  return Boolean(point
    && Number.isFinite(point.x) && point.x >= 0 && point.x <= 1
    && Number.isFinite(point.y) && point.y >= 0 && point.y <= 1
    && Number.isFinite(point.visibility)
    && point.visibility >= threshold && point.visibility <= 1);
}

function imageAspect(frame: PoseFrame): number | null {
  if (!frame.imageSize) return 1;
  const { width, height } = frame.imageSize;
  const aspect = width / height;
  return Number.isFinite(width) && Number.isFinite(height)
    && width > 0 && height > 0 && Number.isFinite(aspect) && aspect > 0
    ? aspect
    : null;
}

function armMeasurement(
  frame: PoseFrame,
  indices: readonly [number, number, number],
  aspect: number,
  threshold: number,
): ArmMeasurement {
  const [shoulder, elbow, hip] = indices.map((index) => frame.landmarks[index]);
  if (!usablePoint(shoulder, threshold) || !usablePoint(elbow, threshold) || !usablePoint(hip, threshold)) {
    return { angleDeg: null, visible: false };
  }
  const torsoX = (hip.x - shoulder.x) * aspect;
  const torsoY = hip.y - shoulder.y;
  const armX = (elbow.x - shoulder.x) * aspect;
  const armY = elbow.y - shoulder.y;
  if (Math.hypot(torsoX, torsoY) <= VECTOR_EPSILON || Math.hypot(armX, armY) <= VECTOR_EPSILON) {
    return { angleDeg: null, visible: false };
  }
  const cross = torsoX * armY - torsoY * armX;
  const dot = torsoX * armX + torsoY * armY;
  return { angleDeg: Math.atan2(Math.abs(cross), dot) * 180 / Math.PI, visible: true };
}

function torsoMetrics(frame: PoseFrame, threshold: number) {
  const [leftShoulder, rightShoulder, leftHip, rightHip] = [11, 12, 23, 24]
    .map((index) => frame.landmarks[index]);
  if (!usablePoint(leftShoulder, threshold) || !usablePoint(rightShoulder, threshold)
    || !usablePoint(leftHip, threshold) || !usablePoint(rightHip, threshold)) return null;
  const dx = (leftHip.x + rightHip.x - leftShoulder.x - rightShoulder.x) / 2;
  const dy = (leftHip.y + rightHip.y - leftShoulder.y - rightShoulder.y) / 2;
  return {
    dx,
    dy,
    shoulderWidth: Math.hypot(leftShoulder.x - rightShoulder.x, leftShoulder.y - rightShoulder.y),
    torsoHeight: Math.hypot(dx, dy),
  };
}

function classifyFraming(
  metrics: ReturnType<typeof torsoMetrics>,
  config: ShoulderRaiseMeasurementConfig,
): PoseFraming {
  if (!metrics || !config.framing) return 'unknown';
  const { minShoulderWidth, maxShoulderWidth, minTorsoHeight, maxTorsoHeight } = config.framing;
  if (metrics.shoulderWidth > maxShoulderWidth + SIZE_EPSILON
    || metrics.torsoHeight > maxTorsoHeight + SIZE_EPSILON) return 'too_close';
  if (metrics.shoulderWidth < minShoulderWidth - SIZE_EPSILON
    && metrics.torsoHeight < minTorsoHeight - SIZE_EPSILON) return 'too_far';
  return 'ok';
}

function unavailable(timestampMs: number | null): ShoulderRaiseMeasurement {
  return {
    timestampMs,
    bodyVisible: false,
    left: { angleDeg: null, visible: false },
    right: { angleDeg: null, visible: false },
    torsoLeanDeg: null,
    framing: 'unknown',
  };
}

export function measureShoulderRaise(
  frame: PoseFrame | null,
  config: ShoulderRaiseMeasurementConfig = DEFAULT_MEASUREMENT_CONFIG,
): ShoulderRaiseMeasurement {
  validateConfig(config);
  if (!frame) return unavailable(null);
  const aspect = imageAspect(frame);
  if (aspect === null) return unavailable(frame.timestampMs);
  const left = armMeasurement(frame, [11, 13, 23], aspect, config.visibilityThreshold);
  const right = armMeasurement(frame, [12, 14, 24], aspect, config.visibilityThreshold);
  const metrics = torsoMetrics(frame, config.visibilityThreshold);
  const torsoLeanDeg = metrics && Math.hypot(metrics.dx * aspect, metrics.dy) > VECTOR_EPSILON
    ? Math.atan2(Math.abs(metrics.dx * aspect), metrics.dy) * 180 / Math.PI
    : null;
  return {
    timestampMs: frame.timestampMs,
    bodyVisible: left.visible && right.visible && torsoLeanDeg !== null,
    left,
    right,
    torsoLeanDeg,
    framing: classifyFraming(metrics, config),
  };
}
