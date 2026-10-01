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
}

export interface PoseAvatarFeedbackPort {
  isReady(): boolean;
  send(feedback: PoseAvatarFeedback, signal: AbortSignal): Promise<boolean>;
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
    this.onChange({ status: this.port.isReady() ? 'ready' : 'unavailable', text: '', error: '' });
  }

  setAvailable(available: boolean): void {
    // Reconnection must not replay a pose_correct/completed event from the past.
    if (!available) this.invalidate();
    else this.onChange({ status: 'ready', text: '', error: '' });
  }

  handleEvent(event: PerceptionEvent): void {
    if (!this.active) return;
    const feedback = feedbackForPoseEvent(event);
    if (!feedback || feedback.key === this.lastKey) return;
    this.deliver(feedback);
    if (event.event === 'completed') this.active = false;
  }

  private deliver(feedback: PoseAvatarFeedback): void {
    const previous = this.delivery;
    previous?.abort();
    // Abort cancels our dispatch guards; interrupt also stops SDK playback now.
    // send() joins the trailing cleanup barrier before submitting the replacement.
    if (previous) void this.port.interrupt().catch(() => {});
    this.lastKey = feedback.key;
    if (!this.port.isReady()) {
      this.delivery = null;
      this.onChange({ status: 'unavailable', text: '', error: '' });
      return;
    }
    const delivery = new AbortController();
    this.delivery = delivery;
    this.onChange({ status: 'sending', text: feedback.text, error: '' });
    void this.port.send(feedback, delivery.signal).then((submitted) => {
      if (this.delivery !== delivery || delivery.signal.aborted) return;
      this.onChange({
        status: submitted ? 'submitted' : 'ready',
        text: submitted ? feedback.text : '', error: '',
      });
    }).catch(() => {
      if (this.delivery !== delivery || delivery.signal.aborted) return;
      this.onChange({ status: 'error', text: '', error: '数字人反馈未能发送，请重新连接数字人。' });
    });
  }
}
