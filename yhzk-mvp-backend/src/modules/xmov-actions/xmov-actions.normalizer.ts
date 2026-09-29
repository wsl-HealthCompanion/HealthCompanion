import type {
  XmovAction,
  XmovKaSummaryRawResponse,
} from './xmov-actions.types';

type XmovRawAction = Record<string, unknown>;

export class XmovActionsNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XmovActionsNormalizationError';
  }
}

function optionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizationContext(index?: number): string {
  return index === undefined ? '' : ` at index ${index}`;
}

function normalizeAction(value: unknown, index?: number): XmovAction {
  const context = normalizationContext(index);

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new XmovActionsNormalizationError(
      `Xmov action${context} must be an object`,
    );
  }

  const action = value as XmovRawAction;
  if (typeof action.name !== 'string' || !action.name.trim()) {
    throw new XmovActionsNormalizationError(
      `Xmov action${context} must have a non-empty name`,
    );
  }

  const rawName = action.name;
  const nameParts = rawName.trim().split('__');
  const semantic = nameParts[nameParts.length - 1].trim();

  if (!semantic) {
    throw new XmovActionsNormalizationError(
      `Xmov action${context} has an empty semantic segment in name`,
    );
  }

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
  if (raw.data === null || raw.data === undefined) {
    throw new XmovActionsNormalizationError(
      'Xmov KA response data must contain an action object or action array',
    );
  }

  if (Array.isArray(raw.data)) {
    return raw.data.map((item, index) => normalizeAction(item, index));
  }

  if (typeof raw.data !== 'object') {
    throw new XmovActionsNormalizationError(
      'Xmov KA response data must contain an action object or action array',
    );
  }

  return [normalizeAction(raw.data)];
}
