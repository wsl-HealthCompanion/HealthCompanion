import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_POSE_SESSION_CONFIG, PoseSessionController } from './poseSessionController';
import type { PoseSessionSnapshot } from './poseSessionTypes';
import type { PerceptionEvent } from './posePerceptionEvent';
import { assessShoulderRaise } from './shoulderRaiseRules';
import type { PoseAssessment } from './shoulderRaiseTypes';
import type { PoseFrame } from './types';

export interface PoseTrainingView {
  snapshot: PoseSessionSnapshot;
  assessment: PoseAssessment | null;
  hasFreshSample: boolean;
  latestEvent: PerceptionEvent | null;
}

const EXPIRY_CHECK_INTERVAL_MS = 50;

export function usePoseTrainingSession(enabled: boolean) {
  const [controller] = useState(() => new PoseSessionController());
  const mountedRef = useRef(true);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const assessmentRef = useRef<PoseAssessment | null>(null);
  const eventRef = useRef<PerceptionEvent | null>(null);
  const lastSampleAtRef = useRef<number | null>(null);
  const lastSourceTimeRef = useRef<number | null>(null);
  const publishedSnapshotRef = useRef(controller.getSnapshot());
  const [view, setView] = useState<PoseTrainingView>(() => ({
    snapshot: controller.getSnapshot(), assessment: null, hasFreshSample: false, latestEvent: null,
  }));

  const publish = useCallback((snapshot: PoseSessionSnapshot) => {
    publishedSnapshotRef.current = snapshot;
    if (mountedRef.current) {
      setView({
        snapshot,
        assessment: assessmentRef.current,
        hasFreshSample: lastSampleAtRef.current !== null,
        latestEvent: eventRef.current,
      });
    }
  }, []);

  const dropLiveObservation = useCallback(() => {
    assessmentRef.current = null;
    eventRef.current = null;
    lastSampleAtRef.current = null;
  }, []);

  const clearObservation = useCallback(() => {
    enabledRef.current = false;
    dropLiveObservation();
    lastSourceTimeRef.current = null;
    publish(controller.stop());
  }, [controller, dropLiveObservation, publish]);

  const suspendObservation = useCallback(() => {
    dropLiveObservation();
    publish(controller.pause());
  }, [controller, dropLiveObservation, publish]);

  const ingest = useCallback((frame: PoseFrame | null) => {
    if (!mountedRef.current || !enabledRef.current || document.hidden) return;
    if (frame && lastSourceTimeRef.current !== null
      && frame.timestampMs <= lastSourceTimeRef.current) return;
    const assessment = assessShoulderRaise(frame);
    const nowMs = performance.now();
    const update = controller.update(assessment, nowMs);
    assessmentRef.current = assessment;
    lastSampleAtRef.current = nowMs;
    if (frame) lastSourceTimeRef.current = frame.timestampMs;
    if (update.events.length > 0) eventRef.current = update.events[update.events.length - 1];
    publish(update.snapshot);
  }, [controller, publish]);

  const canBegin = useCallback(() => enabledRef.current && !document.hidden, []);

  const start = useCallback(() => {
    const nowMs = performance.now();
    if (!canBegin()) return;
    eventRef.current = null;
    // Do not replay the current React assessment: the next inference starts the dwell.
    publish(controller.start(nowMs));
  }, [canBegin, controller, publish]);

  const pause = useCallback(() => {
    eventRef.current = null;
    publish(controller.pause());
  }, [controller, publish]);

  const resume = useCallback(() => {
    const nowMs = performance.now();
    if (!canBegin()) return;
    eventRef.current = null;
    publish(controller.resume(nowMs));
  }, [canBegin, controller, publish]);

  const stopTraining = useCallback(() => {
    dropLiveObservation();
    publish(controller.stop());
  }, [controller, dropLiveObservation, publish]);

  useEffect(() => {
    mountedRef.current = true;
    const onVisibilityChange = () => {
      if (document.hidden) suspendObservation();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    onVisibilityChange();
    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      controller.stop();
      dropLiveObservation();
      lastSourceTimeRef.current = null;
    };
  }, [controller, dropLiveObservation, suspendObservation]);

  useEffect(() => {
    if (!enabled) {
      suspendObservation();
      return;
    }
    const handle = window.setInterval(() => {
      const nowMs = performance.now();
      const snapshot = controller.tick(nowMs).snapshot;
      const expired = lastSampleAtRef.current !== null
        && nowMs - lastSampleAtRef.current > DEFAULT_POSE_SESSION_CONFIG.maxSampleGapMs;
      if (expired) dropLiveObservation();
      if (expired || snapshot.status !== publishedSnapshotRef.current.status
        || snapshot.holdMs !== publishedSnapshotRef.current.holdMs) {
        publish(snapshot);
      }
    }, EXPIRY_CHECK_INTERVAL_MS);
    return () => window.clearInterval(handle);
  }, [enabled, controller, dropLiveObservation, publish, suspendObservation]);

  return { view, ingest, start, pause, resume, stopTraining, clearObservation, suspendObservation };
}
