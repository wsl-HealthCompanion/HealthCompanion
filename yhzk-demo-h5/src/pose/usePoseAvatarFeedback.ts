import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { xmovAvatar } from '../services/xmovAvatar';
import { PoseAvatarFeedbackController, type PoseAvatarFeedbackState } from './poseAvatarFeedback';
import type { PoseTrainingObserver } from './usePoseTrainingSession';

export function usePoseAvatarFeedback() {
  const mountedRef = useRef(true);
  const [state, setState] = useState<PoseAvatarFeedbackState>({
    status: 'unavailable', text: '', error: '',
  });
  const [controller] = useState(() => new PoseAvatarFeedbackController({
    isReady: () => xmovAvatar.isReady(),
    send: (feedback, signal) => xmovAvatar.sendPoseFeedback(feedback.text, feedback.action, signal),
    interrupt: () => xmovAvatar.interrupt(),
  }, (next) => { if (mountedRef.current) setState(next); }));
  const observer = useMemo<PoseTrainingObserver>(() => ({
    onStart: () => controller.start(),
    onResume: () => controller.resume(),
    onCancel: () => controller.cancel(),
    onInvalidate: () => controller.invalidate(),
    onEvent: (event) => controller.handleEvent(event),
  }), [controller]);
  const onAvailabilityChange = useCallback((ready: boolean) => controller.setAvailable(ready), [controller]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controller.cancel();
    };
  }, [controller]);
  return { state, observer, onAvailabilityChange };
}
