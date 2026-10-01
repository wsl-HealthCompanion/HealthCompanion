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

export interface PoseTrainingObserver {
  onStart?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  onInvalidate?: () => void;
  onEvent?: (event: PerceptionEvent) => void;
}

export function usePoseTrainingSession(enabled: boolean, observer: PoseTrainingObserver = {}) {
  const [controller] = useState(() => new PoseSessionController());
  const mountedRef = useRef(true);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const observerRef = useRef(observer);
  observerRef.current = observer;
  const notify = useCallback((action: keyof PoseTrainingObserver, event?: PerceptionEvent) => {
    try {
      if (action === 'onEvent') {
        if (event) observerRef.current.onEvent?.(event);
      } else observerRef.current[action]?.();
    } catch {
      // Feedback must never turn a successful inference into an inference failure.
    }
  }, []);
  const assessmentRef = useRef<PoseAssessment | null>(null);
  const eventRef = useRef<PerceptionEvent | null>(null);
  const lastSampleAtRef = useRef<number | null>(null);
  const lastSourceTimeRef = useRef<number | null>(null);
  const publishedSnapshotRef = useRef(controller.getSnapshot());
  const [view, setView] = useState<PoseTrainingView>(() => ({
    snapshot: controller.getSnapshot(), assessment: null, hasFreshSample: false, latestEvent: null,
  }));

  const publish = useCallback((snapshot: PoseSessionSnapshot) => {
    const previous = publishedSnapshotRef.current.status;
    if (snapshot.status === 'acquiring' && (previous === 'holding' || previous === 'coaching')) {
      notify('onInvalidate');
    }
    publishedSnapshotRef.current = snapshot;
    if (mountedRef.current) {
      setView({
        snapshot,
        assessment: assessmentRef.current,
        hasFreshSample: lastSampleAtRef.current !== null,
        latestEvent: eventRef.current,
      });
    }
  }, [notify]);

  const dropLiveObservation = useCallback(() => {
    assessmentRef.current = null;
    eventRef.current = null;
    lastSampleAtRef.current = null;
  }, []);

  const clearObservation = useCallback(() => {
    notify('onCancel');
    enabledRef.current = false;
    dropLiveObservation();
    lastSourceTimeRef.current = null;
    publish(controller.stop());
  }, [controller, dropLiveObservation, publish, notify]);

  const suspendObservation = useCallback(() => {
    notify('onCancel');
    dropLiveObservation();
    publish(controller.pause());
  }, [controller, dropLiveObservation, publish, notify]);

  const ingest = useCallback((frame: PoseFrame | null) => {
    if (!mountedRef.current || !enabledRef.current || document.hidden) return;
    if (frame && lastSourceTimeRef.current !== null
      && frame.timestampMs <= lastSourceTimeRef.current) return;
    const assessment = assessShoulderRaise(frame);
    const nowMs = performance.now();
    if (lastSampleAtRef.current !== null
      && nowMs - lastSampleAtRef.current > DEFAULT_POSE_SESSION_CONFIG.maxSampleGapMs
      && publishedSnapshotRef.current.status === 'acquiring') notify('onInvalidate');
    const update = controller.update(assessment, nowMs);
    assessmentRef.current = assessment;
    lastSampleAtRef.current = nowMs;
    if (frame) lastSourceTimeRef.current = frame.timestampMs;
    if (update.events.length > 0) eventRef.current = update.events[update.events.length - 1];
    publish(update.snapshot);
    for (const event of update.events) notify('onEvent', event);
  }, [controller, publish, notify]);

  const canBegin = useCallback(() => enabledRef.current && !document.hidden, []);

  const start = useCallback(() => {
    const nowMs = performance.now();
    if (!canBegin()) return;
    const previous = controller.getSnapshot().status;
    eventRef.current = null;
    // Do not replay the current React assessment: the next inference starts the dwell.
    publish(controller.start(nowMs));
    if (previous === 'idle' || previous === 'completed') notify('onStart');
  }, [canBegin, controller, publish, notify]);

  const pause = useCallback(() => {
    notify('onCancel');
    eventRef.current = null;
    publish(controller.pause());
  }, [controller, publish, notify]);

  const resume = useCallback(() => {
    const nowMs = performance.now();
    if (!canBegin()) return;
    const previous = controller.getSnapshot().status;
    eventRef.current = null;
    publish(controller.resume(nowMs));
    if (previous === 'paused') notify('onResume');
  }, [canBegin, controller, publish, notify]);

  const stopTraining = useCallback(() => {
    notify('onCancel');
    dropLiveObservation();
    publish(controller.stop());
  }, [controller, dropLiveObservation, publish, notify]);

  useEffect(() => {
    mountedRef.current = true;
    const onVisibilityChange = () => {
      if (document.hidden) suspendObservation();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    onVisibilityChange();
    return () => {
      mountedRef.current = false;
      notify('onCancel');
      document.removeEventListener('visibilitychange', onVisibilityChange);
      controller.stop();
      dropLiveObservation();
      lastSourceTimeRef.current = null;
    };
  }, [controller, dropLiveObservation, suspendObservation, notify]);

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
      if (expired) {
        dropLiveObservation();
        if (snapshot.status === 'acquiring'
          && publishedSnapshotRef.current.status === 'acquiring') notify('onInvalidate');
      }
      if (expired || snapshot.status !== publishedSnapshotRef.current.status
        || snapshot.holdMs !== publishedSnapshotRef.current.holdMs) {
        publish(snapshot);
      }
    }, EXPIRY_CHECK_INTERVAL_MS);
    return () => window.clearInterval(handle);
  }, [enabled, controller, dropLiveObservation, publish, suspendObservation, notify]);

  return { view, ingest, start, pause, resume, stopTraining, clearObservation, suspendObservation };
}
