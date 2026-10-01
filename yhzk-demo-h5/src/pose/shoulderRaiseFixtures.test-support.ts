import type { PoseFrame, PoseLandmarkPoint } from './types';

interface FixtureOptions {
  leftAngleDeg?: number;
  rightAngleDeg?: number;
  torsoLeanDeg?: number;
  scale?: number;
  imageSize?: { width: number; height: number };
}

// Synthetic image-plane geometry, not an inference/model mock.
export function shoulderRaiseFixture(options: FixtureOptions = {}): PoseFrame {
  const aspect = options.imageSize
    ? options.imageSize.width / options.imageSize.height
    : 1;
  const center = { x: aspect / 2, y: 0.65 };
  const lean = (options.torsoLeanDeg ?? 0) * Math.PI / 180;
  const scale = options.scale ?? 1;
  const landmarks: PoseLandmarkPoint[] = Array.from({ length: 33 }, () => ({
    x: 0.5, y: 0.5, z: 0, visibility: 0,
  }));

  const put = (index: number, x: number, y: number) => {
    const dx = (x - center.x) * scale;
    const dy = (y - center.y) * scale;
    landmarks[index] = {
      x: (center.x + dx * Math.cos(lean) - dy * Math.sin(lean)) / aspect,
      y: center.y + dx * Math.sin(lean) + dy * Math.cos(lean),
      z: 0,
      visibility: 1,
    };
  };

  for (const side of [
    { shoulder: 11, elbow: 13, wrist: 15, hip: 23, direction: 1, angle: options.leftAngleDeg ?? 90 },
    { shoulder: 12, elbow: 14, wrist: 16, hip: 24, direction: -1, angle: options.rightAngleDeg ?? 90 },
  ]) {
    const x = center.x + side.direction * 0.15;
    const angle = side.angle * Math.PI / 180;
    put(side.shoulder, x, 0.25);
    put(side.hip, x, 0.65);
    put(side.elbow, x + side.direction * Math.sin(angle) * 0.18, 0.25 + Math.cos(angle) * 0.18);
    put(side.wrist, x + side.direction * Math.sin(angle) * 0.28, 0.25 + Math.cos(angle) * 0.28);
  }

  return {
    timestampMs: 1000,
    landmarks,
    inferenceMs: 8,
    ...(options.imageSize ? { imageSize: { ...options.imageSize } } : {}),
  };
}
