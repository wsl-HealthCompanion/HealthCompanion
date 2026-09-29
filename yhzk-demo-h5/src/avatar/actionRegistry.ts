export type HealthActionKey =
  | 'acknowledge'
  | 'encourage'
  | 'show_direction'
  | 'warm_up'
  | 'confirm'
  | 'fallback';

export interface ActionRegistryEntry {
  readonly businessKey: HealthActionKey;
  readonly semantic: string | null;
  readonly verified: boolean;
  readonly note?: string;
}

const ACTION_REGISTRY: Readonly<Record<HealthActionKey, ActionRegistryEntry>> = {
  acknowledge: {
    businessKey: 'acknowledge',
    semantic: 'Nod',
    verified: true,
    note: '真实画面可见低头并抬手至胸前。',
  },
  encourage: {
    businessKey: 'encourage',
    semantic: 'skill_like',
    verified: true,
    note: '真实画面可见竖拇指。',
  },
  show_direction: {
    businessKey: 'show_direction',
    semantic: 'LeftSide',
    verified: true,
    note: '真实画面可见向数字人左侧伸手指示。',
  },
  warm_up: {
    businessKey: 'warm_up',
    semantic: 'daoyou_Hello01',
    verified: true,
    note: '真实画面可见双手抬起的打招呼动作。',
  },
  confirm: {
    businessKey: 'confirm',
    semantic: 'Nod',
    verified: true,
    note: '复用真实画面确认过的肯定动作。',
  },
  fallback: {
    businessKey: 'fallback',
    semantic: null,
    verified: false,
    note: '没有匹配 KA；使用语音或互动待机回退。',
  },
};

export function resolveHealthAction(key: string): ActionRegistryEntry | null {
  if (!Object.prototype.hasOwnProperty.call(ACTION_REGISTRY, key)) return null;
  return ACTION_REGISTRY[key as HealthActionKey];
}
