export interface SubtitleSegment {
  index: number;
  text: string;
}

export interface SubtitleEvent {
  eventId: number;
  roundId: string;
  fragmentIndex: number;
  subtitleText: string;
  serverTimeMs?: number;
}

export function normalizeSubtitleSegments(
  segments: SubtitleSegment[],
): SubtitleSegment[] {
  return segments
    .map(segment => ({
      index: segment.index,
      text: String(segment.text || '').trim(),
    }))
    .filter(segment => segment.text.length > 0);
}

export function computeSubtitleDelayMs(bufferedSeconds: number): number {
  const bufferMs = Number.isFinite(bufferedSeconds)
    ? Math.max(0, bufferedSeconds * 1000)
    : 0;
  return Math.min(3000, Math.round(bufferMs + 80));
}
