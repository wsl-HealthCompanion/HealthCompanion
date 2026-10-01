import type { PoseAssessment, PoseIssue } from './shoulderRaiseTypes';

const ISSUE_PRIORITY: readonly PoseIssue[] = [
  'body_not_visible', 'too_far', 'too_close', 'torso_lean',
  'left_arm_too_low', 'left_arm_too_high', 'right_arm_too_low', 'right_arm_too_high',
];

export function copyPoseAssessment(assessment: PoseAssessment): PoseAssessment {
  const { measurement } = assessment;
  return {
    exercise: 'shoulder_raise',
    correct: assessment.correct,
    issues: [...assessment.issues],
    measurement: {
      timestampMs: measurement.timestampMs,
      bodyVisible: measurement.bodyVisible,
      left: { angleDeg: measurement.left.angleDeg, visible: measurement.left.visible },
      right: { angleDeg: measurement.right.angleDeg, visible: measurement.right.visible },
      torsoLeanDeg: measurement.torsoLeanDeg,
      framing: measurement.framing,
    },
  };
}

// Validate coherence, not exercise thresholds: M2.2 owns configurable posture rules.
export function normalizePoseAssessment(assessment: PoseAssessment): PoseAssessment {
  const { measurement, issues } = assessment;
  const isAngle = (value: number | null): value is number =>
    value !== null && Number.isFinite(value) && value >= 0 && value <= 180;
  const isTimestamp = (value: number | null): value is number =>
    value !== null && Number.isFinite(value) && value >= 0;
  const bodyUsable = measurement.bodyVisible === true
    && measurement.left.visible === true && measurement.right.visible === true
    && isAngle(measurement.left.angleDeg) && isAngle(measurement.right.angleDeg)
    && isAngle(measurement.torsoLeanDeg) && isTimestamp(measurement.timestampMs);
  const framingValid = ['unknown', 'ok', 'too_far', 'too_close'].includes(measurement.framing);
  const issuesValid = Array.isArray(issues) && issues.every((issue) => ISSUE_PRIORITY.includes(issue));
  const coherent = assessment.exercise === 'shoulder_raise' && framingValid && issuesValid
    && (assessment.correct === true
      ? bodyUsable && issues.length === 0
        && (measurement.framing === 'ok' || measurement.framing === 'unknown')
      : assessment.correct === false && issues.length > 0
        && (measurement.bodyVisible === false
          ? issues.every((issue) => issue === 'body_not_visible')
          : bodyUsable && !issues.includes('body_not_visible')));

  if (!coherent) {
    return {
      exercise: 'shoulder_raise',
      correct: false,
      issues: ['body_not_visible'],
      measurement: {
        timestampMs: isTimestamp(measurement.timestampMs) ? measurement.timestampMs : null,
        bodyVisible: false,
        left: { angleDeg: null, visible: false },
        right: { angleDeg: null, visible: false },
        torsoLeanDeg: null,
        framing: 'unknown',
      },
    };
  }
  const owned = copyPoseAssessment(assessment);
  owned.issues = ISSUE_PRIORITY.filter((issue) => issues.includes(issue));
  // Unavailable sides must not carry nonfinite values into snapshots or events.
  if (!isAngle(owned.measurement.left.angleDeg)) owned.measurement.left.angleDeg = null;
  if (!isAngle(owned.measurement.right.angleDeg)) owned.measurement.right.angleDeg = null;
  if (!isAngle(owned.measurement.torsoLeanDeg)) owned.measurement.torsoLeanDeg = null;
  if (!isTimestamp(owned.measurement.timestampMs)) owned.measurement.timestampMs = null;
  return owned;
}
