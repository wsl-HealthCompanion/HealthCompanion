import type { PoseAssessment, PoseFraming, PoseIssue } from './shoulderRaiseTypes';

export type PosePerceptionEventName =
  | 'body_not_visible'
  | 'framing_issue'
  | 'exercise_feedback'
  | 'pose_correct'
  | 'completed';

export interface PerceptionEvent {
  source: 'pose';
  event: PosePerceptionEventName;
  // Monotonic observation time supplied to the controller, not video time.
  timestampMs: number;
  confidence?: number;
  payload: {
    exercise: 'shoulder_raise';
    leftArmAngle?: number;
    rightArmAngle?: number;
    torsoLean?: number;
    framing?: PoseFraming;
    issues?: PoseIssue[];
    holdMs?: number;
  };
}

export function createPosePerceptionEvent(
  event: PosePerceptionEventName,
  assessment: PoseAssessment,
  timestampMs: number,
  holdMs: number,
): PerceptionEvent {
  if (!Number.isFinite(timestampMs) || timestampMs < 0
    || !Number.isFinite(holdMs) || holdMs < 0) {
    throw new RangeError('event time and hold must be finite nonnegative milliseconds');
  }
  const { left, right, torsoLeanDeg, framing } = assessment.measurement;
  const payload: PerceptionEvent['payload'] = {
    exercise: 'shoulder_raise',
    framing,
    issues: [...assessment.issues],
    holdMs,
  };
  const isAngle = (value: number | null): value is number =>
    value !== null && Number.isFinite(value) && value >= 0 && value <= 180;
  if (isAngle(left.angleDeg)) payload.leftArmAngle = left.angleDeg;
  if (isAngle(right.angleDeg)) payload.rightArmAngle = right.angleDeg;
  if (isAngle(torsoLeanDeg)) payload.torsoLean = torsoLeanDeg;
  // Do not forward an assessment object: it may carry extra caller-owned fields.
  return { source: 'pose', event, timestampMs, payload };
}
