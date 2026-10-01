import type { PerceptionEvent } from './posePerceptionEvent';
import type { PoseIssue } from './shoulderRaiseTypes';

export type PoseFeedbackAction = 'warm_up' | 'confirm' | 'encourage';

export interface PoseAvatarFeedback {
  key: string;
  text: string;
  action?: PoseFeedbackAction;
}

export interface PoseAvatarFeedbackState {
  status: 'unavailable' | 'ready' | 'sending' | 'submitted' | 'error';
  text: string;
  error: string;
  timing: {
    eventToSubmitMs: number | null;
  } | null;
}

export interface PoseAvatarFeedbackPort {
  isReady(): boolean;
  send(
    feedback: PoseAvatarFeedback,
    signal: AbortSignal,
    onSubmitted: () => void,
    onFailure: () => void,
  ): Promise<boolean>;
  interrupt(): Promise<void>;
}

// Priority is independent of the order/secondary issues in an event.
const CORRECTIONS: ReadonlyArray<readonly [PoseIssue, string]> = [
  ['body_not_visible', '请让肩膀、手肘和髋部完整进入画面。'],
  ['too_far', '请向摄像头靠近一点，让上半身更清楚。'],
  ['too_close', '请往后一点，让上半身完整进入画面。'],
  ['torso_lean', '身体尽量保持直立。'],
  ['left_arm_too_low', '左臂再抬高一点，到肩部高度。'],
  ['left_arm_too_high', '左臂放低一点，到肩部高度。'],
  ['right_arm_too_low', '右臂再抬高一点，到肩部高度。'],
  ['right_arm_too_high', '右臂放低一点，到肩部高度。'],
];

export function feedbackForPoseEvent(event: PerceptionEvent): PoseAvatarFeedback | null {
  if (event.source !== 'pose' || event.payload.exercise !== 'shoulder_raise') return null;
  if (event.event === 'pose_correct') {
    return { key: 'pose_correct', text: '对，就是这里，保持三秒。', action: 'confirm' };
  }
  if (event.event === 'completed') {
    return { key: 'completed', text: '很好，这一组完成了，可以放下双臂。', action: 'encourage' };
  }
  const issues = event.payload.issues ?? [];
  const correction = CORRECTIONS.find(([issue]) => issues.includes(issue));
  return correction ? { key: correction[0], text: correction[1] } : null;
}

/** Receives stable events only. Never stores measurements, frames or a replay queue. */
export class PoseAvatarFeedbackController {
  private active = false;
  private lastKey: string | null = null;
  private delivery: AbortController | null = null;
  private view: PoseAvatarFeedbackState = { status: 'unavailable', text: '', error: '', timing: null };

  constructor(
    private readonly port: PoseAvatarFeedbackPort,
    private readonly onChange: (state: PoseAvatarFeedbackState) => void,
  ) {}

  start(): void {
    this.active = true;
    this.lastKey = null;
    this.deliver({
      key: 'start', action: 'warm_up',
      text: '我们开始吧。身体直立，将双臂抬到肩部高度，保持三秒。',
    });
  }

  resume(): void {
    this.invalidate();
    this.active = true;
  }

  cancel(): void {
    this.active = false;
    this.invalidate();
  }

  invalidate(): void {
    const previous = this.delivery;
    this.delivery = null;
    this.lastKey = null;
    previous?.abort();
    if (previous) void this.port.interrupt().catch(() => {});
    this.emit({ status: this.port.isReady() ? 'ready' : 'unavailable', text: '', error: '', timing: null });
  }

  setAvailable(available: boolean): void {
    // Reconnection must not replay a pose_correct/completed event from the past.
    if (!available) this.invalidate();
    else this.emit({ status: 'ready', text: '', error: '', timing: null });
  }

  handleEvent(event: PerceptionEvent): void {
    if (!this.active) return;
    const feedback = feedbackForPoseEvent(event);
    if (!feedback || feedback.key === this.lastKey) return;
    this.deliver(feedback, event.timestampMs);
    if (event.event === 'completed') this.active = false;
  }

  private deliver(feedback: PoseAvatarFeedback, eventAtMs = performance.now()): void {
    const previous = this.delivery;
    previous?.abort();
    // Abort cancels old dispatch guards; interrupt stops old playback before replacement.
    if (previous) void this.port.interrupt().catch(() => {});
    this.lastKey = feedback.key;
    if (!this.port.isReady()) {
      this.delivery = null;
      this.emit({ status: 'unavailable', text: '', error: '', timing: null });
      return;
    }
    const delivery = new AbortController();
    this.delivery = delivery;
    this.emit({
      status: 'sending', text: feedback.text, error: '',
      timing: { eventToSubmitMs: null },
    });
    let failed = false;
    void this.port.send(feedback, delivery.signal, () => {
      if (this.delivery !== delivery || delivery.signal.aborted) return;
      const submittedAtMs = performance.now();
      this.emit({
        ...this.view,
        timing: { eventToSubmitMs: Math.max(0, submittedAtMs - eventAtMs) },
      });
    }, () => {
      if (this.delivery !== delivery || delivery.signal.aborted) return;
      failed = true;
      this.emit({ ...this.view, status: 'error', text: '', error: '数字人反馈未能发送，请重新连接数字人。' });
    }).then((submitted) => {
      if (this.delivery !== delivery || delivery.signal.aborted || failed) return;
      this.emit({
        ...this.view,
        status: submitted ? 'submitted' : 'ready',
        text: submitted ? feedback.text : '', error: '',
      });
    }).catch(() => {
      if (this.delivery !== delivery || delivery.signal.aborted) return;
      this.emit({ ...this.view, status: 'error', text: '', error: '数字人反馈未能发送，请重新连接数字人。' });
    });
  }

  private emit(state: PoseAvatarFeedbackState): void {
    this.view = state;
    this.onChange(state);
  }
}
