import { describe, expect, it } from 'vitest';
import { measureShoulderRaise } from './shoulderRaiseGeometry';
import { shoulderRaiseFixture } from './shoulderRaiseFixtures.test-support';

const calibratedFraming = {
  minShoulderWidth: 0.15,
  maxShoulderWidth: 0.4,
  minTorsoHeight: 0.2,
  maxTorsoHeight: 0.55,
};

describe('measureShoulderRaise', () => {
  it('returns unavailable measurements when no person is detected', () => {
    expect(measureShoulderRaise(null)).toEqual({
      timestampMs: null,
      bodyVisible: false,
      left: { angleDeg: null, visible: false },
      right: { angleDeg: null, visible: false },
      torsoLeanDeg: null,
      framing: 'unknown',
    });
  });

  it.each([0, 90, 120, 180])('measures a %i° arm against its own torso vector', (angle) => {
    const result = measureShoulderRaise(shoulderRaiseFixture({
      leftAngleDeg: angle,
      rightAngleDeg: angle,
    }));
    expect(result.left.angleDeg).toBeCloseTo(angle, 8);
    expect(result.right.angleDeg).toBeCloseTo(angle, 8);
    expect(result.bodyVisible).toBe(true);
    expect(result.timestampMs).toBe(1000);
  });

  it('keeps anatomical sides independent of mirrored display coordinates', () => {
    const result = measureShoulderRaise(shoulderRaiseFixture({ leftAngleDeg: 40, rightAngleDeg: 100 }));
    expect(result.left.angleDeg).toBeCloseTo(40, 8);
    expect(result.right.angleDeg).toBeCloseTo(100, 8);
  });

  it.each([
    { width: 640, height: 480 },
    { width: 1280, height: 720 },
    { width: 480, height: 640 },
  ])('corrects independently normalized axes for $width × $height video', (imageSize) => {
    const result = measureShoulderRaise(shoulderRaiseFixture({
      leftAngleDeg: 80, rightAngleDeg: 105, torsoLeanDeg: 12, imageSize, scale: 0.7,
    }));
    expect(result.left.angleDeg).toBeCloseTo(80, 8);
    expect(result.right.angleDeg).toBeCloseTo(105, 8);
    expect(result.torsoLeanDeg).toBeCloseTo(12, 8);
  });

  it.each([-20, 0, 20])('measures absolute torso deviation for %i° lean', (torsoLeanDeg) => {
    expect(measureShoulderRaise(shoulderRaiseFixture({ torsoLeanDeg })).torsoLeanDeg)
      .toBeCloseTo(Math.abs(torsoLeanDeg), 8);
  });

  it.each([11, 13, 23, 12, 14, 24])('invalidates a side when core point %i has low visibility', (index) => {
    const frame = shoulderRaiseFixture();
    frame.landmarks[index].visibility = 0.59;
    const result = measureShoulderRaise(frame);
    const side = [11, 13, 23].includes(index) ? 'left' : 'right';
    const other = side === 'left' ? 'right' : 'left';
    expect(result[side]).toEqual({ angleDeg: null, visible: false });
    expect(result[other].angleDeg).toBeCloseTo(90, 8);
    expect(result.bodyVisible).toBe(false);
  });

  it('accepts visibility exactly at the configurable threshold', () => {
    const frame = shoulderRaiseFixture();
    frame.landmarks[11].visibility = 0.6;
    expect(measureShoulderRaise(frame).bodyVisible).toBe(true);
    expect(measureShoulderRaise(frame, { visibilityThreshold: 0.7 }).bodyVisible).toBe(false);
  });

  it('does not require wrists or 3D/world coordinates', () => {
    const frame = shoulderRaiseFixture();
    frame.landmarks[15] = { x: NaN, y: NaN, z: NaN, visibility: 0 };
    frame.landmarks[16] = { x: NaN, y: NaN, z: NaN, visibility: 0 };
    frame.landmarks[11].z = NaN;
    expect(measureShoulderRaise(frame).bodyVisible).toBe(true);
  });

  it('handles incomplete landmark arrays without throwing', () => {
    const frame = shoulderRaiseFixture();
    frame.landmarks = frame.landmarks.slice(0, 12);
    expect(measureShoulderRaise(frame).bodyVisible).toBe(false);
  });

  it.each([
    { x: NaN }, { y: Infinity }, { x: -0.01 }, { y: 1.01 },
    { visibility: NaN }, { visibility: Infinity }, { visibility: 1.1 },
  ])('fails closed for unusable core coordinates/visibility %j', (badPoint) => {
    const frame = shoulderRaiseFixture();
    Object.assign(frame.landmarks[11], badPoint);
    const result = measureShoulderRaise(frame);
    expect(result.left).toEqual({ angleDeg: null, visible: false });
    expect(result.bodyVisible).toBe(false);
    expect(result.torsoLeanDeg).toBeNull();
  });

  it.each([13, 23])('returns null for a coincident shoulder vector at point %i', (index) => {
    const frame = shoulderRaiseFixture();
    frame.landmarks[index] = { ...frame.landmarks[11] };
    expect(measureShoulderRaise(frame).left.angleDeg).toBeNull();
    expect(measureShoulderRaise(frame).bodyVisible).toBe(false);
  });

  it('does not accept a torso whose shoulder and hip midpoints coincide', () => {
    const frame = shoulderRaiseFixture();
    frame.landmarks[23] = { ...frame.landmarks[12] };
    frame.landmarks[24] = { ...frame.landmarks[11] };
    expect(measureShoulderRaise(frame).torsoLeanDeg).toBeNull();
    expect(measureShoulderRaise(frame).bodyVisible).toBe(false);
  });

  it.each([
    { width: 0, height: 480 }, { width: 640, height: NaN },
    { width: Infinity, height: 480 }, { width: 640, height: -1 },
  ])('fails closed for explicitly invalid image dimensions %j', (imageSize) => {
    const frame = { ...shoulderRaiseFixture(), imageSize };
    expect(measureShoulderRaise(frame).bodyVisible).toBe(false);
    expect(measureShoulderRaise(frame).left.angleDeg).toBeNull();
  });

  it('returns unknown framing until camera-specific limits are provided', () => {
    expect(measureShoulderRaise(shoulderRaiseFixture()).framing).toBe('unknown');
  });

  it.each([
    { scale: 0.2, expected: 'too_far' },
    { scale: 1, expected: 'ok' },
    { scale: 1.4, expected: 'too_close' },
  ])('applies explicitly calibrated framing for scale $scale', ({ scale, expected }) => {
    const result = measureShoulderRaise(shoulderRaiseFixture({ scale }), {
      visibilityThreshold: 0.6, framing: calibratedFraming,
    });
    expect(result.framing).toBe(expected);
  });

  it('does not infer too_far from only a narrow shoulder span', () => {
    const frame = shoulderRaiseFixture();
    frame.landmarks[11].x = 0.51;
    frame.landmarks[12].x = 0.49;
    expect(measureShoulderRaise(frame, {
      visibilityThreshold: 0.6, framing: calibratedFraming,
    }).framing).toBe('ok');
  });

  it('reports unknown framing when shoulders or hips are unavailable', () => {
    const frame = shoulderRaiseFixture();
    frame.landmarks[23].visibility = 0.1;
    expect(measureShoulderRaise(frame, {
      visibilityThreshold: 0.6, framing: calibratedFraming,
    }).framing).toBe('unknown');
  });

  it('leaves the input coordinates unchanged', () => {
    const frame = shoulderRaiseFixture({ imageSize: { width: 1280, height: 720 } });
    const original = structuredClone(frame);
    measureShoulderRaise(frame);
    expect(frame).toEqual(original);
  });

  it.each([-0.1, 1.1, NaN, Infinity])('rejects invalid visibility threshold %s', (visibilityThreshold) => {
    expect(() => measureShoulderRaise(shoulderRaiseFixture(), { visibilityThreshold })).toThrow(RangeError);
  });

  it('rejects inverted or nonfinite calibration limits', () => {
    for (const framing of [
      { ...calibratedFraming, minShoulderWidth: 0.5 },
      { ...calibratedFraming, minTorsoHeight: -0.1 },
      { ...calibratedFraming, maxTorsoHeight: NaN },
    ]) {
      expect(() => measureShoulderRaise(shoulderRaiseFixture(), {
        visibilityThreshold: 0.6, framing,
      })).toThrow(RangeError);
    }
  });
});
