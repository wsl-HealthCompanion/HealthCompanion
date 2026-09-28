export type LiveEdgePhase = 'pre-speech' | 'speaking' | 'other';

export interface LiveEdgeMedia {
  buffered: {
    length: number;
    start(index: number): number;
    end(index: number): number;
  };
  currentTime: number;
  playbackRate: number;
  seeking: boolean;
}

const TARGET_LATENCY_SECONDS = 0.35;
const HARD_CHASE_THRESHOLD_SECONDS = 1;
const SPEED_UP_THRESHOLD_SECONDS = 0.5;
const NORMAL_SPEED_THRESHOLD_SECONDS = 0.25;
const NORMAL_PLAYBACK_RATE = 1;
const CHASE_PLAYBACK_RATE = 1.05;

function setPlaybackRate(media: LiveEdgeMedia, rate: number): void {
  try {
    if (media.playbackRate !== rate) media.playbackRate = rate;
  } catch {
    // A detached or transitioning media element may reject mutations.
  }
}

/**
 * Keeps the FLV player near the live edge without seeking during speech.
 * Returns true only when this call performed the round's hard chase.
 */
export function controlLiveEdge(
  media: LiveEdgeMedia | null,
  phase: LiveEdgePhase,
  allowHardChase: boolean,
): boolean {
  if (!media) return false;

  if (phase === 'other' || media.seeking) {
    setPlaybackRate(media, NORMAL_PLAYBACK_RATE);
    return false;
  }

  let bufferedStart: number;
  let bufferedEnd: number;
  let currentTime: number;

  try {
    const lastRange = media.buffered.length - 1;
    if (lastRange < 0) {
      setPlaybackRate(media, NORMAL_PLAYBACK_RATE);
      return false;
    }
    bufferedStart = media.buffered.start(lastRange);
    bufferedEnd = media.buffered.end(lastRange);
    currentTime = media.currentTime;
  } catch {
    setPlaybackRate(media, NORMAL_PLAYBACK_RATE);
    return false;
  }

  if (
    !Number.isFinite(bufferedStart)
    || !Number.isFinite(bufferedEnd)
    || !Number.isFinite(currentTime)
    || bufferedEnd <= bufferedStart
  ) {
    setPlaybackRate(media, NORMAL_PLAYBACK_RATE);
    return false;
  }

  const latency = Math.max(0, bufferedEnd - currentTime);

  if (phase === 'pre-speech') {
    setPlaybackRate(media, NORMAL_PLAYBACK_RATE);
    if (!allowHardChase || latency <= HARD_CHASE_THRESHOLD_SECONDS) return false;

    const targetTime = Math.max(bufferedStart, bufferedEnd - TARGET_LATENCY_SECONDS);
    if (!Number.isFinite(targetTime) || targetTime <= currentTime) return false;

    try {
      media.currentTime = targetTime;
      return true;
    } catch {
      return false;
    }
  }

  if (latency > SPEED_UP_THRESHOLD_SECONDS) {
    setPlaybackRate(media, CHASE_PLAYBACK_RATE);
  } else if (latency < NORMAL_SPEED_THRESHOLD_SECONDS) {
    setPlaybackRate(media, NORMAL_PLAYBACK_RATE);
  } else if (media.playbackRate !== NORMAL_PLAYBACK_RATE && media.playbackRate !== CHASE_PLAYBACK_RATE) {
    setPlaybackRate(media, NORMAL_PLAYBACK_RATE);
  }

  return false;
}
