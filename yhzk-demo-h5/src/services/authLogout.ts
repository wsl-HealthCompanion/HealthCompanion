export function requestLogoutRevocation(
  apiBase: string,
  accessToken: string,
  fetcher: typeof fetch = fetch,
): void {
  if (!accessToken) return;
  void fetcher(`${apiBase}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
    headers: { Authorization: `Bearer ${accessToken}` },
    keepalive: true,
  }).catch(() => undefined);
}
