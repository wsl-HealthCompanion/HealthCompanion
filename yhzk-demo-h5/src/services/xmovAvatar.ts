import type { XmovAvatarProvider } from '../avatar/XmovAvatarProvider';

interface RoundContext {
  id: string;
  generation: number;
  started: boolean;
  closed: boolean;
  intent?: string;
  emotion?: string;
}

class XmovAvatarBridge {
  private provider: XmovAvatarProvider | null = null;
  private ready = false;
  private generation = 0;
  private round: RoundContext | null = null;
  private queue: Promise<void> = Promise.resolve();

  attach(provider: XmovAvatarProvider): () => void {
    this.provider = provider;
    this.ready = false;
    return () => {
      if (this.provider !== provider) return;
      this.provider = null;
      this.ready = false;
      this.round = null;
      this.generation += 1;
      this.queue = Promise.resolve();
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
    };
    this.queue = Promise.resolve();
  }

  async interruptAndBegin(roundId: string): Promise<void> {
    const provider = this.provider;
    this.beginRound(roundId);
    if (!provider || !this.ready) return;
    try {
      await provider.interrupt();
    } catch {
      // A stale speaking state must not block the next AI round.
    }
  }

  async think(roundId: string): Promise<void> {
    const round = this.round;
    const provider = this.provider;
    if (!provider || !this.ready || !round || round.id !== roundId || round.closed) return;
    try {
      await provider.think();
    } catch {
      // The text chat path remains usable even if an avatar state transition fails.
    }
  }

  setIntent(roundId: string, intent?: string, emotion?: string): void {
    const round = this.round;
    if (!round || round.id !== roundId || round.closed) return;
    round.intent = intent;
    round.emotion = emotion;
  }

  pushSpeechChunk(roundId: string, text: string): void {
    const normalized = String(text || '').trim();
    const round = this.round;
    if (!normalized || !round || round.id !== roundId || round.closed) return;

    const isStart = !round.started;
    round.started = true;
    const generation = round.generation;

    this.enqueue(generation, async (provider) => {
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

  async interrupt(): Promise<void> {
    this.generation += 1;
    this.round = null;
    this.queue = Promise.resolve();

    const provider = this.provider;
    if (!provider || !this.ready) return;
    try {
      await provider.interrupt();
    } catch {
      // Interruption is best-effort; the next round can still proceed.
    }
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
