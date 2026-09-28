export interface PlaybackSample {
  nowMs: number;
  currentTime: number;
  readyState: number;
  hasPlayed: boolean;
}

interface PlaybackWatchdogOptions {
  stallTimeoutMs?: number;
  startupTimeoutMs?: number;
  minProgressSeconds?: number;
}

export interface PlaybackWatchdog {
  observe(sample: PlaybackSample): boolean;
}

export function appendReconnectToken(url: string, token: number): string {
  return `${url}${url.includes('?') ? '&' : '?'}reconnect=${encodeURIComponent(String(token))}`;
}

export function shouldReconnectForRuntimeVersion(
  previousVersion: string | null,
  nextVersion: string | null,
): boolean {
  return Boolean(previousVersion && nextVersion && previousVersion !== nextVersion);
}

export function createPlaybackWatchdog(
  options: PlaybackWatchdogOptions = {},
): PlaybackWatchdog {
  const stallTimeoutMs = options.stallTimeoutMs ?? 8_000;
  const startupTimeoutMs = options.startupTimeoutMs ?? 20_000;
  const minProgressSeconds = options.minProgressSeconds ?? 0.05;
  let firstObservedAt: number | null = null;
  let lastProgressAt: number | null = null;
  let lastCurrentTime: number | null = null;

  return {
    observe(sample) {
      if (firstObservedAt === null) firstObservedAt = sample.nowMs;
      const validTime = Number.isFinite(sample.currentTime) ? sample.currentTime : 0;
      const progressed =
        lastCurrentTime === null || validTime > lastCurrentTime + minProgressSeconds;

      if (progressed) {
        lastCurrentTime = validTime;
        lastProgressAt = sample.nowMs;
        return false;
      }

      if (!sample.hasPlayed || sample.readyState < 2) {
        return sample.nowMs - firstObservedAt > startupTimeoutMs;
      }

      if (lastProgressAt === null) lastProgressAt = sample.nowMs;
      return sample.nowMs - lastProgressAt > stallTimeoutMs;
    },
  };
}
