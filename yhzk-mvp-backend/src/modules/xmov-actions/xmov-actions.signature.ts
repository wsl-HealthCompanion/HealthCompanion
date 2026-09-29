import { createHash } from 'crypto';

export const XMOV_KA_SUMMARY_PATH = '/user/v1/external/lite_ka_summary' as const;

export interface XmovSignInput {
  appId: string;
  appSecret: string;
  method: 'GET';
  apiPath: string;
  data: Record<string, unknown>;
  timestamp: number;
}

type XmovAuthHeaders = Record<
  'X-APP-ID' | 'X-TOKEN' | 'X-TIMESTAMP',
  string
>;

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJsonValue(nested)]),
    );
  }

  return value;
}

export function buildXmovAuthHeaders(input: XmovSignInput): XmovAuthHeaders {
  const json = JSON.stringify(sortJsonValue(input.data));
  const signSource =
    input.apiPath.toLowerCase()
    + input.method.toLowerCase()
    + json
    + input.appSecret
    + String(input.timestamp);

  const token = createHash('md5').update(signSource, 'utf8').digest('hex');

  return {
    'X-APP-ID': input.appId,
    'X-TOKEN': token,
    'X-TIMESTAMP': String(input.timestamp),
  };
}
