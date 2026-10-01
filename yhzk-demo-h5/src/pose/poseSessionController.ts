import { createPosePerceptionEvent } from './posePerceptionEvent';
import type { PerceptionEvent, PosePerceptionEventName } from './posePerceptionEvent';
import { copyPoseAssessment, normalizePoseAssessment } from './poseSessionAssessment';
import type {
  PoseSessionConfig, PoseSessionSnapshot, PoseSessionStatus, PoseSessionUpdate,
} from './poseSessionTypes';
import type { PoseAssessment, PoseIssue } from './shoulderRaiseTypes';

export const DEFAULT_POSE_SESSION_CONFIG: Readonly<PoseSessionConfig> = Object.freeze({
  classificationDwellMs: 500,
  correctHoldMs: 3000,
  maxSampleGapMs: 250,
});

export class PoseSessionController {
  private readonly config: Readonly<PoseSessionConfig>;
  private status: PoseSessionStatus = 'idle';
  private assessment: PoseAssessment | null = null;
  private stableIssues: PoseIssue[] | null = null;
  private stableKey: string | null = null;
  private candidateKey: string | null = null;
  private candidateSinceMs: number | null = null;
  private holdStartedAtMs: number | null = null;
  private holdMs = 0;
  private clockAtMs: number | null = null;
  private lastSampleAtMs: number | null = null;
  private lastSourceTimestampMs: number | null = null;

  constructor(config: Partial<PoseSessionConfig> = {}) {
    const resolved = { ...DEFAULT_POSE_SESSION_CONFIG, ...config };
    if (Object.values(resolved).some((value) => !Number.isFinite(value) || value <= 0)) {
      throw new RangeError('session durations must be positive finite milliseconds');
    }
    this.config = Object.freeze(resolved);
  }

  start(nowMs: number): PoseSessionSnapshot {
    this.validateTime(nowMs);
    // Duplicate starts do not reset an active or paused session.
    if (this.isActive() || this.status === 'paused') return this.getSnapshot();
    this.reset('acquiring', nowMs);
    return this.getSnapshot();
  }

  stop(): PoseSessionSnapshot {
    this.reset('idle', null);
    return this.getSnapshot();
  }

  pause(): PoseSessionSnapshot {
    if (!this.isActive()) return this.getSnapshot();
    const sourceTime = this.lastSourceTimestampMs;
    this.reset('paused', this.clockAtMs);
    this.lastSourceTimestampMs = sourceTime;
    return this.getSnapshot();
  }

  resume(nowMs: number): PoseSessionSnapshot {
    this.validateTime(nowMs);
    if (this.status !== 'paused') return this.getSnapshot();
    this.checkClock(nowMs);
    const sourceTime = this.lastSourceTimestampMs;
    this.reset('acquiring', nowMs);
    this.lastSourceTimestampMs = sourceTime;
    return this.getSnapshot();
  }

  getSnapshot(): PoseSessionSnapshot {
    return {
      status: this.status,
      assessment: this.assessment ? copyPoseAssessment(this.assessment) : null,
      stableIssues: this.stableIssues === null ? null : [...this.stableIssues],
      holdMs: this.holdMs,
      holdTargetMs: this.config.correctHoldMs,
    };
  }

  update(assessment: PoseAssessment, nowMs: number): PoseSessionUpdate {
    this.validateTime(nowMs);
    if (!this.isActive()) return this.result();
    this.checkClock(nowMs);
    // Normalize before changing state so a rejected input cannot partially advance time.
    const owned = normalizePoseAssessment(assessment);
    this.clockAtMs = nowMs;
    this.expireObservation(nowMs);

    const sourceTime = owned.measurement.timestampMs;
    if (sourceTime !== null && this.lastSourceTimestampMs !== null
      && sourceTime <= this.lastSourceTimestampMs) {
      return this.result();
    }
    if (sourceTime !== null) this.lastSourceTimestampMs = sourceTime;
    this.lastSampleAtMs = nowMs;
    this.assessment = owned;

    // Cancel on the first invalid sample, without waiting for its classification dwell.
    if (this.status === 'holding' && !owned.correct) this.clearClassification();
    const key = owned.correct ? 'correct' : owned.issues.join('|');
    if (key !== this.candidateKey) {
      this.candidateKey = key;
      this.candidateSinceMs = nowMs;
    }

    if (this.status === 'holding') {
      this.holdMs = Math.min(nowMs - this.holdStartedAtMs!, this.config.correctHoldMs);
      if (this.holdMs >= this.config.correctHoldMs) {
        this.status = 'completed';
        return this.result([this.event('completed', nowMs)]);
      }
      return this.result();
    }

    if (key !== this.stableKey
      && nowMs - this.candidateSinceMs! >= this.config.classificationDwellMs) {
      this.stableKey = key;
      this.stableIssues = [...owned.issues];
      if (owned.correct) {
        this.status = 'holding';
        this.holdStartedAtMs = nowMs;
        this.holdMs = 0;
        return this.result([this.event('pose_correct', nowMs)]);
      }
      this.status = 'coaching';
      const event = owned.issues.includes('body_not_visible') ? 'body_not_visible'
        : owned.issues.some((issue) => issue === 'too_far' || issue === 'too_close')
          ? 'framing_issue' : 'exercise_feedback';
      return this.result([this.event(event, nowMs)]);
    }
    return this.result();
  }

  // Widget/lifecycle callers can expire stale observations; ticks never accrue a hold.
  tick(nowMs: number): PoseSessionUpdate {
    this.validateTime(nowMs);
    if (!this.isActive()) return this.result();
    this.checkClock(nowMs);
    this.clockAtMs = nowMs;
    this.expireObservation(nowMs);
    return this.result();
  }

  private isActive(): boolean {
    return this.status === 'acquiring' || this.status === 'coaching' || this.status === 'holding';
  }

  private validateTime(nowMs: number): void {
    if (!Number.isFinite(nowMs) || nowMs < 0) {
      throw new RangeError('observation time must be finite nonnegative milliseconds');
    }
  }

  private checkClock(nowMs: number): void {
    if (this.clockAtMs !== null && nowMs < this.clockAtMs) {
      throw new RangeError('observation time must be monotonic');
    }
  }

  private clearClassification(): void {
    this.status = 'acquiring';
    this.stableIssues = null;
    this.stableKey = null;
    this.candidateKey = null;
    this.candidateSinceMs = null;
    this.holdStartedAtMs = null;
    this.holdMs = 0;
  }

  private expireObservation(nowMs: number): void {
    if (this.lastSampleAtMs !== null && nowMs - this.lastSampleAtMs > this.config.maxSampleGapMs) {
      this.clearClassification();
      this.assessment = null;
      this.lastSampleAtMs = null;
      // Retain source watermark so cached frames remain stale after a gap.
    }
  }

  private reset(status: PoseSessionStatus, clockAtMs: number | null): void {
    this.clearClassification();
    this.status = status;
    this.assessment = null;
    this.clockAtMs = clockAtMs;
    this.lastSampleAtMs = null;
    this.lastSourceTimestampMs = null;
  }

  private event(event: PosePerceptionEventName, nowMs: number): PerceptionEvent {
    return createPosePerceptionEvent(event, this.assessment!, nowMs, this.holdMs);
  }

  private result(events: PerceptionEvent[] = []): PoseSessionUpdate {
    return { snapshot: this.getSnapshot(), events };
  }
}
