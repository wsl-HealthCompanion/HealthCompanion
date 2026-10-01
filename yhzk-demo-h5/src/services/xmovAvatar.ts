import type { XmovAvatarProvider } from '../avatar/XmovAvatarProvider';
import { planExpression, type ExpressionPlan } from '../avatar/expressionPlanner';
import { resolveHealthAction } from '../avatar/actionRegistry';
import type { PoseFeedbackAction } from '../pose/poseAvatarFeedback';

interface RoundContext {
  id: string;
  generation: number;
  started: boolean;
  closed: boolean;
  intent?: string;
  emotion?: string;
  /** Task 3：本轮表达计划（intent/emotion 到达时更新） */
  plan: ExpressionPlan | null;
}

interface FeedbackLane {
  tail: Promise<void>;
  pending: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class XmovAvatarBridge {
  private provider: XmovAvatarProvider | null = null;
  private ready = false;
  private generation = 0;
  private round: RoundContext | null = null;
  private queue: Promise<void> = Promise.resolve();
  // Keep in-flight SDK calls ordered even after a generation is invalidated.
  private feedbackLane: FeedbackLane = { tail: Promise.resolve(), pending: 0 };

  attach(provider: XmovAvatarProvider): () => void {
    this.generation += 1;
    this.round = null;
    this.queue = Promise.resolve();
    this.feedbackLane = { tail: Promise.resolve(), pending: 0 };
    this.provider = provider;
    this.ready = false;
    return () => {
      if (this.provider !== provider) return;
      this.provider = null;
      this.ready = false;
      this.round = null;
      this.generation += 1;
      this.queue = Promise.resolve();
      this.feedbackLane = { tail: Promise.resolve(), pending: 0 };
    };
  }

  markReady(provider: XmovAvatarProvider): void {
    if (this.provider === provider) this.ready = true;
  }

  markUnavailable(provider: XmovAvatarProvider): void {
    if (this.provider === provider) this.ready = false;
  }

  isReady(): boolean {
    return Boolean(this.provider && this.ready);
  }

  beginRound(roundId: string): void {
    this.generation += 1;
    this.round = {
      id: roundId,
      generation: this.generation,
      started: false,
      closed: false,
      plan: null,
    };
    // 语义与 Task 2 一致：替换队列、立即废弃旧轮残留动作（旧链上的动作会被
    // generation 守卫快速跳过；正在合成中的语音由 interrupt() 掐断）。
    this.queue = Promise.resolve();
    // Task 3：每轮以中性表达重置，避免上一轮的情绪/风格残留到新回答。
    // 放在新链首部，保证与后续 interrupt / intent 计划严格串行。
    const round = this.round;
    const generation = round.generation;
    this.queue = this.queue
      .then(async () => {
        if (generation !== this.generation || !this.provider || !this.ready) return;
        this.provider.applyExpression(planExpression('unknown', 'neutral'));
      })
      .catch(() => {
        // expression reset must never break the round
      });
  }

  async interruptAndBegin(roundId: string): Promise<void> {
    const provider = this.provider;
    this.beginRound(roundId);
    const round = this.round;
    if (!provider || !this.ready || !round) return;

    const generation = round.generation;
    this.queue = this.queue
      .then(async () => {
        if (generation !== this.generation || this.provider !== provider || !this.ready) return;
        await provider.interrupt();
      })
      .catch(() => {
        // A stale speaking state must not block the next AI round.
      });

    await this.queue;
  }

  async think(roundId: string): Promise<void> {
    const round = this.round;
    if (!round || round.id !== roundId || round.closed) return;

    const generation = round.generation;
    this.enqueue(generation, async (provider) => {
      await provider.think();
    });
  }

  setIntent(roundId: string, intent?: string, emotion?: string): void {
    const round = this.round;
    if (!round || round.id !== roundId || round.closed) return;
    round.intent = intent;
    round.emotion = emotion;
    // Task 3：intent/emotion 到达即重算表达计划并按序应用
    const plan = planExpression(intent, emotion);
    round.plan = plan;
    const generation = round.generation;
    this.enqueue(generation, async (provider) => {
      provider.applyExpression(plan);
    });
  }

  pushSpeechChunk(roundId: string, text: string): void {
    const normalized = String(text || '').trim();
    const round = this.round;
    if (!normalized || !round || round.id !== roundId || round.closed) return;

    const isStart = !round.started;
    round.started = true;
    const generation = round.generation;
    const leadBeatMs = isStart ? (round.plan?.leadBeatMs || 0) : 0;

    this.enqueue(generation, async (provider) => {
      // Task 3：共情停顿只延迟语音首段（文字流式不受影响），think 已先行展示
      if (leadBeatMs > 0) await delay(leadBeatMs);
      // 停顿期间轮次可能已被打断，唤醒后必须重新校验
      if (generation !== this.generation) return;
      await provider.speak(normalized, isStart, false, roundId);
    });
  }

  finishRound(roundId: string): void {
    const round = this.round;
    if (!round || round.id !== roundId || round.closed) return;
    round.closed = true;

    if (!round.started) {
      const generation = round.generation;
      this.enqueue(generation, async (provider) => {
        await provider.interactiveIdle();
      });
      return;
    }

    const generation = round.generation;
    this.enqueue(generation, async (provider) => {
      // Official Xmov streaming examples close a stream with an empty final chunk
      // when the last spoken chunk has already been sent.
      await provider.speak('', false, true, roundId);
    });
  }

  speakWhole(roundId: string, text: string): void {
    const normalized = String(text || '').trim();
    const round = this.round;
    if (!normalized || !round || round.id !== roundId || round.closed) return;

    round.started = true;
    round.closed = true;
    const generation = round.generation;
    this.enqueue(generation, async (provider) => {
      await provider.speak(normalized, true, true, roundId);
    });
  }

  async playAction(semantic: string): Promise<void> {
    const provider = this.provider;
    if (!provider || !this.ready) {
      throw new Error('XmovAvatar is not ready');
    }
    await provider.playAction(semantic);
  }

  sendPoseFeedback(
    text: string,
    actionKey: PoseFeedbackAction | undefined,
    signal: AbortSignal,
    onSubmitted?: () => void,
    onVoiceStarted?: (atMs: number) => void,
    onFailure?: () => void,
  ): Promise<boolean> {
    const lane = this.feedbackLane;
    lane.pending += 1;
    const provider = this.provider;
    const generation = ++this.generation;
    this.round = null;
    this.queue = Promise.resolve();
    const current = () => !signal.aborted && generation === this.generation
      && provider === this.provider && Boolean(provider) && this.ready;
    const work = lane.tail.then(async () => {
      if (!current() || !provider) return false;
      const entry = actionKey ? resolveHealthAction(actionKey) : null;
      if (actionKey && (!entry?.verified || !entry.semantic)) {
        throw new Error('Pose feedback requires a verified action');
      }
      await provider.interrupt();
      if (!current()) return false;
      const speech = provider.speakFeedback(
        text,
        entry?.semantic ?? null,
        `pose_${generation}`,
        () => { if (current()) onSubmitted?.(); },
        (atMs) => { if (current()) onVoiceStarted?.(atMs); },
      );
      // Queue the SDK invocation, not the entire utterance. Waiting for end-of-speech
      // delayed the next stable response by however long the previous speech lasted.
      void speech.catch(() => { if (current()) onFailure?.(); });
      return current(); // submitted, not evidence of audible/visible completion
    });
    lane.tail = work.then(
      () => { lane.pending -= 1; },
      () => { lane.pending -= 1; },
    );
    return work;
  }

  async interrupt(): Promise<void> {
    this.generation += 1;
    this.round = null;
    this.queue = Promise.resolve();

    const provider = this.provider;
    // Readiness blocks new submissions, never cleanup of a captured SDK instance.
    if (!provider) return;
    const lane = this.feedbackLane;
    const pendingFeedback = lane.pending > 0;
    // Immediate interruption stops current playback. A trailing interruption also
    // clears an SDK submission that finishes after cancel; new feedback waits for both.
    const immediate = provider.interrupt().catch(() => {});
    const trailing = lane.tail.then(async () => {
      await immediate;
      if (!pendingFeedback || this.provider !== provider) return;
      try { await provider.interrupt(); } catch { /* best effort */ }
    });
    lane.tail = trailing.catch(() => {});
    await lane.tail;
  }

  private enqueue(
    generation: number,
    action: (provider: XmovAvatarProvider) => Promise<void>,
  ): void {
    this.queue = this.queue
      .then(async () => {
        if (generation !== this.generation) return;
        const provider = this.provider;
        if (!provider || !this.ready) return;
        await action(provider);
      })
      .catch(() => {
        // Keep the queue alive after a single SDK failure.
      });
  }
}

export const xmovAvatar = new XmovAvatarBridge();
