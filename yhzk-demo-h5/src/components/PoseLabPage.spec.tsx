import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  PoseLabRunGate,
  PoseLabView,
  disposePoseLabRuntime,
  mirroredOverlayX,
  stopPoseLabRuntime,
  type PoseLabViewState,
} from './PoseLabPage';
import type { PoseFrame } from '../pose/types';

function poseFrame(): PoseFrame {
  const landmarks = Array.from({ length: 33 }, (_, index) => ({
    x: 0.2 + index * 0.01,
    y: 0.1 + index * 0.005,
    z: 0,
    visibility: 0.5 + index * 0.01,
  }));

  landmarks[11] = { x: 0.2, y: 0.3, z: 0, visibility: 0.91 };
  landmarks[12] = { x: 0.8, y: 0.3, z: 0, visibility: 0.92 };
  landmarks[13] = { x: 0.15, y: 0.45, z: 0, visibility: 0.93 };
  landmarks[14] = { x: 0.85, y: 0.45, z: 0, visibility: 0.94 };
  landmarks[15] = { x: 0.1, y: 0.6, z: 0, visibility: 0.95 };
  landmarks[16] = { x: 0.9, y: 0.6, z: 0, visibility: 0.96 };
  landmarks[23] = { x: 0.35, y: 0.75, z: 0, visibility: 0.97 };
  landmarks[24] = { x: 0.65, y: 0.75, z: 0, visibility: 0.98 };

  return {
    timestampMs: 1234,
    landmarks,
    inferenceMs: 8.4,
  };
}

function state(overrides: Partial<PoseLabViewState> = {}): PoseLabViewState {
  return {
    cameraStatus: 'idle',
    modelStatus: 'idle',
    frame: null,
    stats: {
      effectiveFps: 0,
      skippedFrames: 0,
      lastInferenceMs: null,
    },
    diagnostics: {
      shoulderWidth: null,
      torsoHeight: null,
      upperBodyBox: null,
    },
    error: '',
    ...overrides,
  };
}

function render(current: PoseLabViewState): string {
  return renderToStaticMarkup(createElement(PoseLabView, {
    state: current,
    onStartCamera: () => undefined,
    onStopCamera: () => undefined,
    videoElement: createElement('video', { 'data-testid': 'camera' }),
  }));
}

describe('PoseLabView', () => {
  it('starts idle without implying camera permission was requested', () => {
    const html = render(state());

    expect(html).toContain('开启摄像头');
    expect(html).toContain('摄像头未开启');
    expect(html).not.toContain('摄像头运行中');
  });

  it('shows requesting, denied, and active camera states explicitly', () => {
    expect(render(state({
      cameraStatus: 'requesting',
    }))).toContain('等待摄像头权限');

    expect(render(state({
      cameraStatus: 'denied',
      error: 'Permission denied',
    }))).toContain('Permission denied');

    expect(render(state({
      cameraStatus: 'active',
      modelStatus: 'ready',
    }))).toContain('关闭摄像头');
  });

  it('distinguishes no detected person from camera failure', () => {
    const html = render(state({
      cameraStatus: 'active',
      modelStatus: 'ready',
      frame: null,
    }));

    expect(html).toContain('未检测到人体');
    expect(html).not.toContain('Permission denied');
  });

  it('renders all eight anatomical probe labels with visibility', () => {
    const html = render(state({
      cameraStatus: 'active',
      modelStatus: 'ready',
      frame: poseFrame(),
    }));

    for (const label of [
      '左肩 0.91',
      '右肩 0.92',
      '左肘 0.93',
      '右肘 0.94',
      '左腕 0.95',
      '右腕 0.96',
      '左髋 0.97',
      '右髋 0.98',
    ]) {
      expect(html).toContain(label);
    }
  });

  it('renders probe performance and calibration measurements only', () => {
    const html = render(state({
      cameraStatus: 'active',
      modelStatus: 'ready',
      frame: poseFrame(),
      stats: {
        effectiveFps: 12,
        skippedFrames: 3,
        lastInferenceMs: 8.4,
      },
      diagnostics: {
        shoulderWidth: 0.42,
        torsoHeight: 0.36,
        upperBodyBox: {
          xMin: 0.1,
          yMin: 0.2,
          xMax: 0.9,
          yMax: 0.8,
        },
      },
    }));

    expect(html).toContain('8.4 ms');
    expect(html).toContain('12 FPS');
    expect(html).toContain('跳帧 3');
    expect(html).toContain('肩宽 0.420');
    expect(html).toContain('躯干高度 0.360');
    expect(html).toContain('BBox 0.100, 0.200 → 0.900, 0.800');
    expect(html).not.toContain('too_far');
    expect(html).not.toContain('too_close');
  });

  it('mirrors overlay coordinates without swapping anatomical labels', () => {
    expect(mirroredOverlayX(0.2)).toBeCloseTo(0.8, 8);

    const html = render(state({
      cameraStatus: 'active',
      modelStatus: 'ready',
      frame: poseFrame(),
    }));

    expect(html).toContain('左肩 0.91');
    expect(html).toContain('data-landmark="left_shoulder"');
  });

  it('contains no M2.2+ coaching, hold, Xmov, or LangGraph behavior', () => {
    const html = render(state({
      cameraStatus: 'active',
      modelStatus: 'ready',
      frame: poseFrame(),
    }));

    expect(html).not.toContain('肩部角度');
    expect(html).not.toContain('姿势正确');
    expect(html).not.toContain('保持三秒');
    expect(html).not.toContain('Xmov');
    expect(html).not.toContain('LangGraph');
  });
});

describe('Pose Lab runtime cleanup', () => {
  it('stops probe and camera and clears the video stream', () => {
    const camera = { stop: vi.fn() };
    const loop = { stop: vi.fn() };
    const video = { srcObject: {} as MediaStream };

    stopPoseLabRuntime({ camera, loop, video });

    expect(loop.stop).toHaveBeenCalledTimes(1);
    expect(camera.stop).toHaveBeenCalledTimes(1);
    expect(video.srcObject).toBeNull();
  });

  it('dispose additionally closes MediaPipe and accepts null runtime refs', () => {
    const camera = { stop: vi.fn() };
    const loop = { stop: vi.fn() };
    const adapter = { close: vi.fn() };

    expect(() => disposePoseLabRuntime({
      camera,
      loop,
      adapter,
      video: null,
    })).not.toThrow();

    expect(loop.stop).toHaveBeenCalledTimes(1);
    expect(camera.stop).toHaveBeenCalledTimes(1);
    expect(adapter.close).toHaveBeenCalledTimes(1);

    expect(() => disposePoseLabRuntime({
      camera,
      loop,
      adapter: null,
      video: null,
    })).not.toThrow();
  });
});


describe('PoseLabRunGate', () => {
  it('invalidates an in-flight start when stop or unmount occurs', () => {
    const gate = new PoseLabRunGate();
    const firstStart = gate.begin();

    expect(gate.isCurrent(firstStart)).toBe(true);

    gate.invalidate();

    expect(gate.isCurrent(firstStart)).toBe(false);

    const secondStart = gate.begin();

    expect(gate.isCurrent(firstStart)).toBe(false);
    expect(gate.isCurrent(secondStart)).toBe(true);
  });
});
