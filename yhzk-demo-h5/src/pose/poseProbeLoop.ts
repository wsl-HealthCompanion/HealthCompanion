import type { PoseLandmarkerAdapter } from './poseLandmarkerAdapter';
import type { PoseFrame } from './types';

export interface PoseProbeStats {
  effectiveFps: number;
  skippedFrames: number;
  lastInferenceMs: number | null;
}

export interface PoseProbeSample {
  frame: PoseFrame | null;
  stats: PoseProbeStats;
}

export interface PoseProbeLoopDeps {
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (handle: number) => void;
  now: () => number;
}

const DEFAULT_INTERVAL_MS = 80;

export class PoseProbeLoop {
  private readonly deps: PoseProbeLoopDeps;
  private readonly intervalMs: number;

  private running = false;
  private frameHandle: number | null = null;
  private video: HTMLVideoElement | null = null;
  private onSample: ((sample: PoseProbeSample) => void) | null = null;
  private onError: ((error: Error) => void) | null = null;

  private lastInferenceAt = Number.NEGATIVE_INFINITY;
  private lastVideoTime: number | null = null;
  private skippedFrames = 0;
  private inferenceTimes: number[] = [];

  constructor(
    private readonly adapter: Pick<PoseLandmarkerAdapter, 'detect'>,
    deps: Partial<PoseProbeLoopDeps> = {},
    intervalMs = DEFAULT_INTERVAL_MS,
  ) {
    this.deps = {
      requestFrame:
        deps.requestFrame
        ?? ((callback) => requestAnimationFrame(callback)),
      cancelFrame:
        deps.cancelFrame
        ?? ((handle) => cancelAnimationFrame(handle)),
      now:
        deps.now
        ?? (() => performance.now()),
    };
    this.intervalMs = intervalMs;
  }

  start(
    video: HTMLVideoElement,
    onSample: (sample: PoseProbeSample) => void,
    onError: (error: Error) => void,
  ): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.video = video;
    this.onSample = onSample;
    this.onError = onError;
    this.lastInferenceAt = Number.NEGATIVE_INFINITY;
    this.lastVideoTime = null;
    this.skippedFrames = 0;
    this.inferenceTimes = [];
    this.schedule();
  }

  stop(): void {
    if (this.frameHandle !== null) {
      this.deps.cancelFrame(this.frameHandle);
      this.frameHandle = null;
    }
    this.running = false;
    this.video = null;
    this.onSample = null;
    this.onError = null;
  }

  isRunning(): boolean {
    return this.running;
  }

  private schedule(): void {
    if (!this.running) {
      return;
    }
    this.frameHandle = this.deps.requestFrame(() => {
      this.frameHandle = null;
      this.tick();
    });
  }

  private tick(): void {
    if (!this.running || !this.video || !this.onSample || !this.onError) {
      return;
    }

    const now = this.deps.now();
    const videoTime = this.video.currentTime;

    if (now - this.lastInferenceAt < this.intervalMs) {
      this.skippedFrames += 1;
      this.schedule();
      return;
    }

    if (this.lastVideoTime === videoTime) {
      this.skippedFrames += 1;
      this.schedule();
      return;
    }

    try {
      const timestampMs = videoTime * 1000;
      const frame = this.adapter.detect(this.video, timestampMs);

      this.lastInferenceAt = now;
      this.lastVideoTime = videoTime;
      this.inferenceTimes.push(now);
      this.inferenceTimes = this.inferenceTimes.filter(
        (time) => now - time <= 1000,
      );

      this.onSample({
        frame,
        stats: {
          effectiveFps: this.inferenceTimes.length,
          skippedFrames: this.skippedFrames,
          lastInferenceMs: frame?.inferenceMs ?? null,
        },
      });

      this.schedule();
    } catch (error) {
      this.running = false;
      this.frameHandle = null;
      const normalized =
        error instanceof Error ? error : new Error(String(error));
      this.onError(normalized);
    }
  }
}
