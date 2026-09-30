import { describe, expect, it } from 'vitest';
import { derivePoseProbeDiagnostics } from './poseProbeDiagnostics';
import type { PoseFrame, PoseLandmarkPoint } from './types';

function frameWith(overrides: Partial<Record<number, Partial<PoseLandmarkPoint>>> = {}): PoseFrame {
  const landmarks = Array.from({ length: 33 }, (_, index) => ({
    x: 0.4 + index * 0.001,
    y: 0.2 + index * 0.002,
    z: 0,
    visibility: 0.9,
    ...overrides[index],
  }));

  return {
    timestampMs: 1000,
    landmarks,
    inferenceMs: 8,
  };
}

describe('derivePoseProbeDiagnostics', () => {
  it('returns null diagnostics when no pose is available', () => {
    expect(derivePoseProbeDiagnostics(null)).toEqual({
      shoulderWidth: null,
      torsoHeight: null,
      upperBodyBox: null,
    });
  });

  it('derives normalized shoulder width and torso height', () => {
    const frame = frameWith({
      11: { x: 0.3, y: 0.3 },
      12: { x: 0.7, y: 0.3 },
      23: { x: 0.4, y: 0.7 },
      24: { x: 0.6, y: 0.7 },
    });

    const result = derivePoseProbeDiagnostics(frame);

    expect(result.shoulderWidth).toBeCloseTo(0.4, 6);
    expect(result.torsoHeight).toBeCloseTo(0.4, 6);
  });

  it('derives an upper-body box from the eight required probe points', () => {
    const frame = frameWith({
      11: { x: 0.20, y: 0.30 },
      12: { x: 0.80, y: 0.31 },
      13: { x: 0.15, y: 0.45 },
      14: { x: 0.85, y: 0.46 },
      15: { x: 0.10, y: 0.60 },
      16: { x: 0.90, y: 0.61 },
      23: { x: 0.35, y: 0.75 },
      24: { x: 0.65, y: 0.76 },
    });

    expect(derivePoseProbeDiagnostics(frame).upperBodyBox).toEqual({
      xMin: 0.10,
      yMin: 0.30,
      xMax: 0.90,
      yMax: 0.76,
    });
  });

  it('returns null instead of NaN when required coordinates are non-finite', () => {
    const frame = frameWith({
      11: { x: Number.NaN },
    });

    expect(derivePoseProbeDiagnostics(frame)).toEqual({
      shoulderWidth: null,
      torsoHeight: null,
      upperBodyBox: null,
    });
  });

  it('does not classify framing in M2.1', () => {
    const result = derivePoseProbeDiagnostics(frameWith());

    expect(result).toEqual({
      shoulderWidth: expect.any(Number),
      torsoHeight: expect.any(Number),
      upperBodyBox: expect.any(Object),
    });
    expect(result).not.toHaveProperty('framing');
    expect(result).not.toHaveProperty('tooFar');
    expect(result).not.toHaveProperty('tooClose');
  });
});
