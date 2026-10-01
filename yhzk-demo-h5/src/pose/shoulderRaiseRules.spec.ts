import { describe, expect, it } from 'vitest';
import {
  assessShoulderRaise,
  DEFAULT_SHOULDER_RAISE_RULE_CONFIG,
} from './shoulderRaiseRules';
import { shoulderRaiseFixture } from './shoulderRaiseFixtures.test-support';
import type { ShoulderRaiseRuleConfig } from './shoulderRaiseTypes';

const calibratedConfig: ShoulderRaiseRuleConfig = {
  minArmAngleDeg: 80,
  maxArmAngleDeg: 105,
  visibilityThreshold: 0.6,
  maxTorsoLeanDeg: 15,
  framing: {
    minShoulderWidth: 0.15, maxShoulderWidth: 0.4,
    minTorsoHeight: 0.2, maxTorsoHeight: 0.55,
  },
};

describe('assessShoulderRaise', () => {
  it('accepts an upright horizontal pose without inventing a distance', () => {
    const result = assessShoulderRaise(shoulderRaiseFixture());
    expect(result.exercise).toBe('shoulder_raise');
    expect(result.correct).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.measurement.framing).toBe('unknown');
    expect(result.measurement.left.angleDeg).toBeCloseTo(90, 8);
  });

  it('reports only body_not_visible when no pose is detected', () => {
    const result = assessShoulderRaise(null);
    expect(result.correct).toBe(false);
    expect(result.issues).toEqual(['body_not_visible']);
  });

  it('suppresses angle coaching when either core side is unavailable', () => {
    const frame = shoulderRaiseFixture({ leftAngleDeg: 30, rightAngleDeg: 120, torsoLeanDeg: 20 });
    frame.landmarks[24].visibility = 0.59;
    expect(assessShoulderRaise(frame).issues).toEqual(['body_not_visible']);
  });

  it.each([
    { leftAngleDeg: 45, rightAngleDeg: 90, issues: ['left_arm_too_low'] },
    { leftAngleDeg: 90, rightAngleDeg: 45, issues: ['right_arm_too_low'] },
    { leftAngleDeg: 45, rightAngleDeg: 45, issues: ['left_arm_too_low', 'right_arm_too_low'] },
    { leftAngleDeg: 120, rightAngleDeg: 90, issues: ['left_arm_too_high'] },
    { leftAngleDeg: 90, rightAngleDeg: 120, issues: ['right_arm_too_high'] },
    { leftAngleDeg: 120, rightAngleDeg: 120, issues: ['left_arm_too_high', 'right_arm_too_high'] },
  ])('classifies anatomical sides for left $leftAngleDeg° / right $rightAngleDeg°', ({ issues, ...angles }) => {
    const result = assessShoulderRaise(shoulderRaiseFixture(angles));
    expect(result.correct).toBe(false);
    expect(result.issues).toEqual(issues);
  });

  it.each([-20, 20])('rejects %i° torso lean even when both arms are at target', (torsoLeanDeg) => {
    const result = assessShoulderRaise(shoulderRaiseFixture({ torsoLeanDeg, scale: 0.7 }));
    expect(result.correct).toBe(false);
    expect(result.issues).toEqual(['torso_lean']);
  });

  it.each([80, 105])('includes the exact %i° arm boundary and 15° torso boundary', (angle) => {
    const result = assessShoulderRaise(shoulderRaiseFixture({
      leftAngleDeg: angle, rightAngleDeg: angle, torsoLeanDeg: 15, scale: 0.7,
      imageSize: { width: 1280, height: 720 },
    }));
    expect(result.correct).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it.each([
    { leftAngleDeg: 79.999, rightAngleDeg: 90, issue: 'left_arm_too_low' },
    { leftAngleDeg: 105.001, rightAngleDeg: 90, issue: 'left_arm_too_high' },
    { leftAngleDeg: 90, rightAngleDeg: 79.999, issue: 'right_arm_too_low' },
    { leftAngleDeg: 90, rightAngleDeg: 105.001, issue: 'right_arm_too_high' },
  ])('retains meaningful deviations near angle boundaries %j', ({ issue, ...angles }) => {
    expect(assessShoulderRaise(shoulderRaiseFixture(angles)).issues).toEqual([issue]);
  });

  it('retains torso deviations just outside the boundary', () => {
    expect(assessShoulderRaise(shoulderRaiseFixture({ torsoLeanDeg: 15.001, scale: 0.7 })).issues)
      .toEqual(['torso_lean']);
  });

  it.each([
    { scale: 0.2, issue: 'too_far' }, { scale: 1.4, issue: 'too_close' },
  ])('rejects explicitly calibrated framing $issue', ({ scale, issue }) => {
    const result = assessShoulderRaise(shoulderRaiseFixture({ scale }), calibratedConfig);
    expect(result.correct).toBe(false);
    expect(result.issues).toEqual([issue]);
  });

  it('orders framing, torso and arm issues while retaining every applicable correction', () => {
    const result = assessShoulderRaise(shoulderRaiseFixture({
      scale: 0.2, torsoLeanDeg: 20, leftAngleDeg: 50, rightAngleDeg: 120,
    }), calibratedConfig);
    expect(result.issues).toEqual([
      'too_far', 'torso_lean', 'left_arm_too_low', 'right_arm_too_high',
    ]);
    expect(result.correct).toBe(false);
  });

  it('supports alternate configured angle, lean and visibility thresholds', () => {
    const frame = shoulderRaiseFixture({ leftAngleDeg: 75, rightAngleDeg: 95, torsoLeanDeg: 18, scale: 0.7 });
    frame.landmarks[13].visibility = 0.55;
    expect(assessShoulderRaise(frame).correct).toBe(false);
    const result = assessShoulderRaise(frame, {
      minArmAngleDeg: 70, maxArmAngleDeg: 95, visibilityThreshold: 0.5, maxTorsoLeanDeg: 20,
    });
    expect(result.correct).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it.each([
    { minArmAngleDeg: -1 }, { maxArmAngleDeg: 181 },
    { minArmAngleDeg: 110, maxArmAngleDeg: 100 },
    { minArmAngleDeg: NaN }, { maxArmAngleDeg: Infinity },
    { maxTorsoLeanDeg: -1 }, { maxTorsoLeanDeg: 181 }, { maxTorsoLeanDeg: NaN },
    { visibilityThreshold: 1.1 },
  ])('rejects malformed configuration %j', (override) => {
    expect(() => assessShoulderRaise(shoulderRaiseFixture(), {
      ...DEFAULT_SHOULDER_RAISE_RULE_CONFIG, ...override,
    })).toThrow(RangeError);
  });

  it('fails closed when explicitly supplied image dimensions are invalid', () => {
    const frame = { ...shoulderRaiseFixture(), imageSize: { width: 0, height: 480 } };
    expect(assessShoulderRaise(frame).issues).toEqual(['body_not_visible']);
  });

  it('evaluates the next frame independently; temporal stability belongs to M2.3', () => {
    expect(assessShoulderRaise(shoulderRaiseFixture({ leftAngleDeg: 20 })).correct).toBe(false);
    expect(assessShoulderRaise(shoulderRaiseFixture()).correct).toBe(true);
    expect(assessShoulderRaise(null).correct).toBe(false);
    expect(assessShoulderRaise(shoulderRaiseFixture()).correct).toBe(true);
  });

  it('preserves immutable default settings and input data', () => {
    const frame = shoulderRaiseFixture();
    const original = structuredClone(frame);
    expect(Object.isFrozen(DEFAULT_SHOULDER_RAISE_RULE_CONFIG)).toBe(true);
    assessShoulderRaise(frame);
    expect(frame).toEqual(original);
    expect(DEFAULT_SHOULDER_RAISE_RULE_CONFIG).toEqual({
      minArmAngleDeg: 80, maxArmAngleDeg: 105, visibilityThreshold: 0.6, maxTorsoLeanDeg: 15,
    });
  });
});
