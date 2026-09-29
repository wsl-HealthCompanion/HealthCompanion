// ============================================================
// Expression Planner (Task 3)
// intent + emotion → 面部情感 / 动作提示 / 说话风格 / 共情停顿
//
// 设计边界（保守优先）：
// 1. Xmov LiteSDK 本地没有独立的表情/动作 API（SDK 分析确认：
//    speak/think/idle/listen/interactiveidle/interrupt/setVolume），
//    风格信息只能通过 speak() 的 SSML 字符串与 extra 参数透传给网关。
// 2. SSML 渲染默认关闭（VITE_XMOV_EXPRESSION_SSML=true 开启）。
//    关闭时输出与 Task 2 完全一致的 <speak>转义文本</speak>，零行为变化；
//    开启时使用 W3C 标准 <prosody>（rate/pitch/volume），不发明私有标签。
// 3. 共情停顿（lead beat）不依赖 SDK：由 bridge 在首个 speech_chunk 前
//    延时实现，且只影响语音不影响文字流式。
// ============================================================

export type FacialEmotion = 'neutral' | 'happy' | 'concerned' | 'sad';

export interface SpeakingStyle {
  /** 语速，如 '-12%' */
  rate?: string;
  /** 音调，如 '-4%' */
  pitch?: string;
  /** 音量，如 '-10%' */
  volume?: string;
}

export interface ExpressionPlan {
  /** 面部情感（当前 SDK 通过网关 SSML/资源包生效，本地仅作语义与提示） */
  facialEmotion: FacialEmotion;
  /** 动作提示（供网关 extra 透传与后续 SDK 支持时使用） */
  action?: string;
  /** 说话风格（prosody 参数） */
  style: SpeakingStyle;
  /** 共情停顿毫秒数：think 之后、第一个语音片段之前 */
  leadBeatMs: number;
  /** 原始 emotion / intent（用于透传与调试） */
  emotion: string;
  intent: string;
}

const MAX_LEAD_BEAT_MS = 900;

/** 情感 → 表达基线 */
const EMOTION_PLANS: Record<string, Partial<ExpressionPlan>> = {
  happy: { facialEmotion: 'happy', style: { pitch: '+5%' }, leadBeatMs: 0 },
  concerned: { facialEmotion: 'concerned', style: { rate: '-8%', pitch: '-2%' }, leadBeatMs: 300 },
  anxious: { facialEmotion: 'concerned', style: { rate: '-12%', pitch: '-4%' }, leadBeatMs: 500 },
  sad: { facialEmotion: 'sad', style: { rate: '-10%', pitch: '-6%', volume: '-10%' }, leadBeatMs: 400 },
};

/** 意图 → 动作与风格覆盖（与 ai-service orchestrator 的 intent 枚举对齐） */
function planForIntent(intent: string): Partial<ExpressionPlan> {
  if (intent === 'emergency') {
    return { action: 'alert_acknowledge', style: { rate: '-5%' }, leadBeatMs: 200 };
  }
  if (intent === 'medication_query') return { action: 'medication_guidance' };
  if (intent === 'health_question') return { action: 'acknowledge_explain' };
  if (intent === 'general_chat') return { action: 'friendly_respond' };
  return {};
}

/** 依据 intent + emotion 生成一轮对话的表达计划 */
export function planExpression(intent?: string, emotion?: string): ExpressionPlan {
  const normalizedEmotion = String(emotion || 'neutral');
  const normalizedIntent = String(intent || 'unknown');
  const byEmotion = EMOTION_PLANS[normalizedEmotion] || {};
  const byIntent = planForIntent(normalizedIntent);

  const plan: ExpressionPlan = {
    ...byEmotion,
    ...byIntent,
    facialEmotion: (byEmotion.facialEmotion || 'neutral') as FacialEmotion,
    action: byIntent.action,
    style: { ...(byEmotion.style || {}), ...(byIntent.style || {}) },
    leadBeatMs: Math.min(
      Math.max(byEmotion.leadBeatMs || 0, byIntent.leadBeatMs || 0),
      MAX_LEAD_BEAT_MS,
    ),
    emotion: normalizedEmotion,
    intent: normalizedIntent,
  };
  return plan;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function hasStyle(style: SpeakingStyle): boolean {
  return Boolean(style.rate || style.pitch || style.volume);
}

function prosodyAttrs(style: SpeakingStyle): string {
  let attrs = '';
  if (style.rate) attrs += ` rate="${style.rate}"`;
  if (style.pitch) attrs += ` pitch="${style.pitch}"`;
  if (style.volume) attrs += ` volume="${style.volume}"`;
  return attrs;
}

/**
 * 渲染 speak() 使用的 SSML。
 * - ssmlEnabled=false：与 Task 2 行为逐字节一致（<speak>转义文本</speak>）
 * - ssmlEnabled=true ：带表达计划时包一层标准 <prosody>；文本已是 SSML 时原样透传
 */
export function renderSsml(
  text: string,
  plan: ExpressionPlan | null,
  ssmlEnabled: boolean,
): string {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '<speak></speak>';
  if (!ssmlEnabled) return `<speak>${escapeXml(trimmed)}</speak>`;
  if (/^<speak(?:\s|>)/i.test(trimmed)) return trimmed;
  if (plan && hasStyle(plan.style)) {
    return `<speak><prosody${prosodyAttrs(plan.style)}>${escapeXml(trimmed)}</prosody></speak>`;
  }
  return `<speak>${escapeXml(trimmed)}</speak>`;
}

/** 是否启用表达 SSML（默认关闭，保持 Task 2 行为） */
export function isExpressionSsmlEnabled(): boolean {
  const env = (import.meta as unknown as { env?: Record<string, unknown> }).env;
  return String(env?.VITE_XMOV_EXPRESSION_SSML ?? '').trim() === 'true';
}
