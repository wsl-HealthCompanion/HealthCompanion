import { measureShoulderRaise } from './shoulderRaiseGeometry';
import type { PoseAssessment, PoseIssue, ShoulderRaiseRuleConfig } from './shoulderRaiseTypes';
import type { PoseFrame } from './types';

export const DEFAULT_SHOULDER_RAISE_RULE_CONFIG: Readonly<ShoulderRaiseRuleConfig> = Object.freeze({
  minArmAngleDeg: 80,
  maxArmAngleDeg: 105,
  visibilityThreshold: 0.6,
  maxTorsoLeanDeg: 15,
});

// Only absorb trigonometric rounding at exact boundaries; measurements remain unrounded.
const ANGLE_EPSILON_DEG = 1e-7;

function validateRuleConfig(config: ShoulderRaiseRuleConfig): void {
  const { minArmAngleDeg, maxArmAngleDeg, maxTorsoLeanDeg } = config;
  const angles = [minArmAngleDeg, maxArmAngleDeg, maxTorsoLeanDeg];
  if (angles.some((angle) => !Number.isFinite(angle) || angle < 0 || angle > 180)
    || minArmAngleDeg > maxArmAngleDeg) {
    throw new RangeError('rule angles must be finite degrees between 0 and 180 with min <= max');
  }
}

export function assessShoulderRaise(
  frame: PoseFrame | null,
  config: ShoulderRaiseRuleConfig = DEFAULT_SHOULDER_RAISE_RULE_CONFIG,
): PoseAssessment {
  validateRuleConfig(config);
  const measurement = measureShoulderRaise(frame, config);
  const issues: PoseIssue[] = [];
  if (!measurement.bodyVisible) {
    issues.push('body_not_visible');
  } else {
    if (measurement.framing === 'too_far' || measurement.framing === 'too_close') {
      issues.push(measurement.framing);
    }
    if (measurement.torsoLeanDeg! > config.maxTorsoLeanDeg + ANGLE_EPSILON_DEG) {
      issues.push('torso_lean');
    }
    for (const side of ['left', 'right'] as const) {
      const angle = measurement[side].angleDeg!;
      if (angle < config.minArmAngleDeg - ANGLE_EPSILON_DEG) {
        issues.push(`${side}_arm_too_low`);
      } else if (angle > config.maxArmAngleDeg + ANGLE_EPSILON_DEG) {
        issues.push(`${side}_arm_too_high`);
      }
    }
  }
  return {
    exercise: 'shoulder_raise',
    correct: issues.length === 0,
    issues,
    measurement,
  };
}
