export function shouldCreateDynamicPlayer(streamUrl: string | null | undefined): boolean {
  return Boolean(String(streamUrl ?? '').trim());
}

export function shouldReplaceDynamicPlayer(
  previousUrl: string | null | undefined,
  nextUrl: string | null | undefined,
): boolean {
  return String(previousUrl ?? '') !== String(nextUrl ?? '');
}

export function dynamicPlayerKey(streamUrl: string | null | undefined): string {
  return String(streamUrl ?? '').trim() || 'no-dynamic-stream';
}

export function buildDynamicPlaybackUrl(streamUrl: string, reconnect: number): string {
  const separator = streamUrl.includes('?') ? '&' : '?';
  return `${streamUrl}${separator}reconnect=${encodeURIComponent(reconnect)}`;
}

export function buildFlvMediaDataSource(streamUrl: string, reconnect: number) {
  return {
    type: 'flv' as const,
    url: buildDynamicPlaybackUrl(streamUrl, reconnect),
    isLive: true,
    hasAudio: true,
    hasVideo: true,
    withCredentials: true,
  };
}
