const TRUST_PROXY_HOPS_ERROR = 'TRUST_PROXY_HOPS must be a positive integer';

export function parseTrustedProxyHops(value: string | undefined): number | false {
  const normalized = value?.trim();
  if (!normalized) return false;

  if (!/^[1-9]\d*$/.test(normalized)) {
    throw new Error(TRUST_PROXY_HOPS_ERROR);
  }

  const hops = Number(normalized);
  if (!Number.isSafeInteger(hops)) {
    throw new Error(TRUST_PROXY_HOPS_ERROR);
  }

  return hops;
}
