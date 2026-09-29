import type {
  XmovAction,
  XmovKaSummaryRawResponse,
} from './xmov-actions.types';

type XmovRawAction = Record<string, unknown>;

function optionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeAction(value: unknown): XmovAction {
  const action = value as XmovRawAction;
  const rawName = action.name as string;
  const parts = rawName.split('__');
  const semantic = parts[parts.length - 1];

  const normalized: XmovAction = {
    semantic,
    name: semantic,
    cnName: typeof action.cn_name === 'string' ? action.cn_name : '',
    type: typeof action.ka_type === 'string' ? action.ka_type : 'unknown',
    rawName,
  };

  const imageUrl = optionalTrimmedString(action.render_image_oss);
  if (imageUrl) {
    normalized.imageUrl = imageUrl;
  }

  const movieUrl = optionalTrimmedString(action.render_movie_oss);
  if (movieUrl) {
    normalized.movieUrl = movieUrl;
  }

  return normalized;
}

export function normalizeXmovActions(
  raw: XmovKaSummaryRawResponse,
): XmovAction[] {
  const items = Array.isArray(raw.data) ? raw.data : [raw.data];
  return items.map(normalizeAction);
}
