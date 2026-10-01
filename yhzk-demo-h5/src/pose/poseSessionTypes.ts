import type { PerceptionEvent } from './posePerceptionEvent';
import type { PoseAssessment, PoseIssue } from './shoulderRaiseTypes';

export type PoseSessionStatus =
  | 'idle'
  | 'acquiring'
  | 'coaching'
  | 'holding'
  | 'completed'
  | 'paused';

export interface PoseSessionConfig {
  classificationDwellMs: number;
  correctHoldMs: number;
  maxSampleGapMs: number;
}

export interface PoseSessionSnapshot {
  status: PoseSessionStatus;
  assessment: PoseAssessment | null;
  stableIssues: PoseIssue[] | null;
  holdMs: number;
  holdTargetMs: number;
}

export interface PoseSessionUpdate {
  snapshot: PoseSessionSnapshot;
  events: PerceptionEvent[];
}
