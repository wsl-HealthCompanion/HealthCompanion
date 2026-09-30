import { describe, expect, it, vi } from 'vitest';
import { PoseProbeLoop } from './poseProbeLoop';
import type { PoseFrame } from './types';

function frame(inferenceMs = 7): PoseFrame {
  return {
    timestampMs: 0,
    landmarks: Array.from({ length: 33 }, () => ({
      x: 0,
      y: 0,
      z: 0,
      visibility: 1,
    })),
    inferenceMs,
  };
}

function harness() {
  let currentNow = 0;
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  const requestFrame = vi.fn((callback: FrameRequestCallback) => {
    const id = nextId++;
    callbacks.set(id, callback);
    return id;
  });
  const cancelFrame = vi.fn((handle: number) => {
    callbacks.delete(handle);
  });

  const deps = {
    requestFrame,
    cancelFrame,
    now: () => currentNow,
  };

  function setNow(value: number) {
    currentNow = value;
  }

  function fireNext() {
    const entry = callbacks.entries().next().value as
      | [number, FrameRequestCallback]
      | undefined;
    if (!entry) throw new Error('no scheduled frame');
    const [id, callback] = entry;
    callbacks.delete(id);
    callback(currentNow);
  }

  return {
    deps,
    requestFrame,
    cancelFrame,
    setNow,
    fireNext,
    pendingCount: () => callbacks.size,
  };
}

describe('PoseProbeLoop', () => {
  it('schedules one frame and ignores duplicate start calls', () => {
    const h = harness();
    const adapter = { detect: vi.fn() };
    const loop = new PoseProbeLoop(adapter, h.deps);
    const video = { currentTime: 0 } as HTMLVideoElement;

    loop.start(video, vi.fn(), vi.fn());
    loop.start(video, vi.fn(), vi.fn());

    expect(loop.isRunning()).toBe(true);
    expect(h.requestFrame).toHaveBeenCalledTimes(1);
    expect(h.pendingCount()).toBe(1);
  });

  it('uses an 80ms inference gate and counts skipped RAF ticks', () => {
    const h = harness();
    const detect = vi.fn().mockReturnValue(frame(5));
    const samples: unknown[] = [];
    const loop = new PoseProbeLoop({ detect }, h.deps);
    const video = { currentTime: 0.1 } as HTMLVideoElement;

    h.setNow(0);
    loop.start(video, (sample) => samples.push(sample), vi.fn());
    h.fireNext();

    h.setNow(40);
    video.currentTime = 0.2;
    h.fireNext();

    h.setNow(79);
    video.currentTime = 0.3;
    h.fireNext();

    h.setNow(80);
    video.currentTime = 0.4;
    h.fireNext();

    expect(detect).toHaveBeenCalledTimes(2);
    expect(samples).toHaveLength(2);
    expect(samples[1]).toMatchObject({
      stats: { skippedFrames: 2 },
    });
  });

  it('does not infer twice for the same video.currentTime', () => {
    const h = harness();
    const detect = vi.fn().mockReturnValue(frame());
    const loop = new PoseProbeLoop({ detect }, h.deps);
    const video = { currentTime: 0.1 } as HTMLVideoElement;

    loop.start(video, vi.fn(), vi.fn());
    h.fireNext();

    h.setNow(100);
    h.fireNext();

    expect(detect).toHaveBeenCalledTimes(1);
  });

  it('passes video time in milliseconds and reports inference stats', () => {
    const h = harness();
    const detect = vi.fn().mockImplementation(
      (_video: HTMLVideoElement, timestampMs: number) => ({
        ...frame(12),
        timestampMs,
      }),
    );
    const onSample = vi.fn();
    const loop = new PoseProbeLoop({ detect }, h.deps);
    const video = { currentTime: 1.234 } as HTMLVideoElement;

    loop.start(video, onSample, vi.fn());
    h.fireNext();

    expect(detect).toHaveBeenCalledWith(video, 1234);
    expect(onSample).toHaveBeenCalledWith({
      frame: expect.objectContaining({
        timestampMs: 1234,
        inferenceMs: 12,
      }),
      stats: {
        effectiveFps: 1,
        skippedFrames: 0,
        lastInferenceMs: 12,
      },
    });
  });

  it('counts effective FPS in a trailing 1000ms window', () => {
    const h = harness();
    const detect = vi.fn().mockReturnValue(frame());
    const onSample = vi.fn();
    const loop = new PoseProbeLoop({ detect }, h.deps);
    const video = { currentTime: 0.1 } as HTMLVideoElement;

    loop.start(video, onSample, vi.fn());
    h.setNow(0);
    h.fireNext();

    h.setNow(100);
    video.currentTime = 0.2;
    h.fireNext();

    h.setNow(1101);
    video.currentTime = 0.3;
    h.fireNext();

    expect(onSample.mock.calls[0][0].stats.effectiveFps).toBe(1);
    expect(onSample.mock.calls[1][0].stats.effectiveFps).toBe(2);
    expect(onSample.mock.calls[2][0].stats.effectiveFps).toBe(1);
  });

  it('keeps lastInferenceMs null when no pose is detected', () => {
    const h = harness();
    const onSample = vi.fn();
    const loop = new PoseProbeLoop(
      { detect: vi.fn().mockReturnValue(null) },
      h.deps,
    );
    const video = { currentTime: 0.1 } as HTMLVideoElement;

    loop.start(video, onSample, vi.fn());
    h.fireNext();

    expect(onSample).toHaveBeenCalledWith({
      frame: null,
      stats: {
        effectiveFps: 1,
        skippedFrames: 0,
        lastInferenceMs: null,
      },
    });
  });

  it('stops the loop and reports adapter errors once', () => {
    const h = harness();
    const failure = new Error('pose failed');
    const onError = vi.fn();
    const loop = new PoseProbeLoop(
      { detect: vi.fn(() => { throw failure; }) },
      h.deps,
    );

    loop.start({ currentTime: 0.1 } as HTMLVideoElement, vi.fn(), onError);
    h.fireNext();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(failure);
    expect(loop.isRunning()).toBe(false);
    expect(h.pendingCount()).toBe(0);
  });

  it('keeps MediaPipe timestamps monotonic across camera restarts', () => {
    const h = harness();
    const detect = vi.fn().mockReturnValue(frame());
    const loop = new PoseProbeLoop({ detect }, h.deps);
    const firstVideo = { currentTime: 2 } as HTMLVideoElement;

    loop.start(firstVideo, vi.fn(), vi.fn());
    h.fireNext();
    loop.stop();

    h.setNow(100);
    const restartedVideo = { currentTime: 0.1 } as HTMLVideoElement;
    loop.start(restartedVideo, vi.fn(), vi.fn());
    h.fireNext();

    const firstTimestamp = detect.mock.calls[0][1] as number;
    const secondTimestamp = detect.mock.calls[1][1] as number;

    expect(firstTimestamp).toBe(2000);
    expect(secondTimestamp).toBeGreaterThan(firstTimestamp);
  });

  it('cancels the pending frame and prevents later detection on stop', () => {
    const h = harness();
    const detect = vi.fn();
    const loop = new PoseProbeLoop({ detect }, h.deps);

    loop.start({ currentTime: 0.1 } as HTMLVideoElement, vi.fn(), vi.fn());
    loop.stop();

    expect(h.cancelFrame).toHaveBeenCalledTimes(1);
    expect(loop.isRunning()).toBe(false);
    expect(h.pendingCount()).toBe(0);
    expect(detect).not.toHaveBeenCalled();
  });
});
