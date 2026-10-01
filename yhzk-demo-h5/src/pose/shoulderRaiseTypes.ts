export type PoseFraming = 'too_far' | 'ok' | 'too_close' | 'unknown';

export interface ArmMeasurement {
  angleDeg: number | null;
  visible: boolean;
}

export interface ShoulderRaiseMeasurement {
  timestampMs: number | null;
  bodyVisible: boolean;
  left: ArmMeasurement;
  right: ArmMeasurement;
  torsoLeanDeg: number | null;
  framing: PoseFraming;
}

// Camera-specific normalized limits; absence means uncalibrated, not physical distance.
export interface ShoulderFramingConfig {
  minShoulderWidth: number;
  maxShoulderWidth: number;
  minTorsoHeight: number;
  maxTorsoHeight: number;
}

export interface ShoulderRaiseMeasurementConfig {
  visibilityThreshold: number;
  framing?: ShoulderFramingConfig;
}

export interface ShoulderRaiseRuleConfig extends ShoulderRaiseMeasurementConfig {
  minArmAngleDeg: number;
  maxArmAngleDeg: number;
  maxTorsoLeanDeg: number;
}

export type PoseIssue =
  | 'body_not_visible'
  | 'too_far'
  | 'too_close'
  | 'torso_lean'
  | 'left_arm_too_low'
  | 'left_arm_too_high'
  | 'right_arm_too_low'
  | 'right_arm_too_high';

export interface PoseAssessment {
  exercise: 'shoulder_raise';
  correct: boolean;
  issues: PoseIssue[];
  measurement: ShoulderRaiseMeasurement;
}
