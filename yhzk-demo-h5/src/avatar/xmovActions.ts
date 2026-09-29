import { API_BASE } from '../config';

export interface XmovAction {
  semantic: string;
  name: string;
  cnName: string;
  type: string;
  imageUrl?: string;
  movieUrl?: string;
  rawName?: string;
}

export interface FetchXmovActionsOptions {
  apiBase?: string;
  fetchImpl?: typeof fetch;
}

export async function fetchXmovActions(
  options: FetchXmovActionsOptions = {},
): Promise<XmovAction[]> {
  const apiBase = (options.apiBase ?? API_BASE).replace(/\/$/, '');
  const fetchImpl = options.fetchImpl ?? fetch;

  const response = await fetchImpl(`${apiBase}/xmov/actions`, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`Xmov actions request failed: HTTP ${response.status}`);
  }

  const json = await response.json() as unknown;
  const envelope = json && typeof json === 'object'
    ? json as Record<string, unknown>
    : {};
  const payloadValue = envelope.data ?? envelope;
  const payload = payloadValue && typeof payloadValue === 'object'
    ? payloadValue as Record<string, unknown>
    : {};

  if (!Array.isArray(payload.actions)) {
    throw new Error('Xmov actions payload must contain an actions array');
  }

  return payload.actions as XmovAction[];
}
