import { loadXmovSdk } from './loadXmovSdk';
import { buildXmovKaSsml } from './xmovKa';
import { XMOV_CONFIG, getXmovConfigProblem } from './xmovConfig';
import {
  isExpressionSsmlEnabled,
  renderSsml,
  type ExpressionPlan,
} from './expressionPlanner';
import type {
  XmovAvatarInstance,
  XmovAvatarRuntimeState,
  XmovAvatarSpeakExtra,
} from './types';

export interface XmovAvatarProviderEvents {
  onStateChange?: (state: XmovAvatarRuntimeState, rawState?: string) => void;
  onVoiceStateChange?: (status: string) => void;
  onDownloadProgress?: (progress: number) => void;
  onError?: (error: Error) => void;
  onWidgetEvent?: (event: unknown) => void;
  /** Task 3：表达计划应用时通知（用于 UI 展示当前表情/动作语义） */
  onExpressionChange?: (plan: ExpressionPlan) => void;
}

function normalizeState(raw: string): XmovAvatarRuntimeState {
  const value = raw.toLowerCase().replace(/_/g, '-');
  if (value.includes('listen')) return 'listening';
  if (value.includes('think')) return 'thinking';
  if (value.includes('speak')) return 'speaking';
  if (value.includes('interactive') && value.includes('idle')) return 'interactive-idle';
  if (value.includes('idle')) return 'idle';
  return 'idle';
}

export class XmovAvatarProvider {
  private instance: XmovAvatarInstance | null = null;
  private state: XmovAvatarRuntimeState = 'unconfigured';
  /** 当前轮的表达计划（Task 3，由 bridge 在 intent 到达时写入） */
  private plan: ExpressionPlan | null = null;
  private readonly events: XmovAvatarProviderEvents;

  constructor(events: XmovAvatarProviderEvents = {}) {
    this.events = events;
  }

  getState(): XmovAvatarRuntimeState {
    return this.state;
  }

  getInstance(): XmovAvatarInstance | null {
    return this.instance;
  }

  async init(containerId: string): Promise<void> {
    const problem = getXmovConfigProblem();
    if (problem) {
      this.setState('unconfigured');
      throw new Error(problem);
    }

    if (this.instance) return;

    try {
      this.setState('loading-sdk');
      const XmovAvatar = await loadXmovSdk(XMOV_CONFIG.sdkUrl);
      this.setState('initializing');

      const selector = containerId.startsWith('#') ? containerId : `#${containerId}`;
      const gatewayUrl = new URL(XMOV_CONFIG.gatewayServer);
      if (!gatewayUrl.searchParams.has('data_source')) {
        gatewayUrl.searchParams.set('data_source', '2');
      }
      if (!gatewayUrl.searchParams.has('custom_id')) {
        gatewayUrl.searchParams.set('custom_id', 'healthy-digital-human');
      }

      this.instance = new XmovAvatar({
        containerId: selector,
        appId: XMOV_CONFIG.appId,
        appSecret: XMOV_CONFIG.appSecret,
        gatewayServer: gatewayUrl.toString(),
        headers: { Authorization: XMOV_CONFIG.authorization },
        enableDebugger: false,
        hardwareAcceleration: 'prefer-hardware',
        onStateChange: (rawState: string) => {
          this.setState(normalizeState(String(rawState || '')), rawState);
        },
        onVoiceStateChange: (status: string) => {
          const normalized = String(status || '').toLowerCase();
          if (normalized.includes('start')) this.setState('speaking', status);
          if (normalized.includes('end')) this.setState('interactive-idle', status);
          this.events.onVoiceStateChange?.(status);
        },
        onProxyWidgetEvent: (event: unknown) => {
          this.events.onWidgetEvent?.(event);
        },
        onWidgetEvent: (event: unknown) => {
          this.events.onWidgetEvent?.(event);
        },
        onMessage: (message: unknown) => {
          if (message instanceof Error) this.events.onError?.(message);
          else if (message) this.events.onError?.(new Error(String(message)));
        },
      });

      await this.instance.init({
        onDownloadProgress: (progress: number) => {
          this.events.onDownloadProgress?.(Number(progress) || 0);
        },
        onClose: () => {
          if (this.state !== 'destroyed') this.setState('error');
        },
      });

      await this.idle();
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      this.instance = null;
      this.setState('error');
      this.events.onError?.(normalized);
      throw normalized;
    }
  }

  async idle(): Promise<void> {
    this.requireInstance();
    await this.instance?.idle?.();
    this.setState('idle');
  }

  async listen(): Promise<void> {
    this.requireInstance();
    await this.instance?.listen?.();
    this.setState('listening');
  }

  async think(): Promise<void> {
    this.requireInstance();
    await this.instance?.think?.();
    this.setState('thinking');
  }

  async interactiveIdle(): Promise<void> {
    this.requireInstance();
    await this.instance?.interactiveidle?.();
    this.setState('interactive-idle');
  }

  async speak(
    text: string,
    isStart = true,
    isEnd = true,
    clientSpeakId = `xmov_${Date.now()}`,
  ): Promise<void> {
    this.requireInstance();
    const normalized = text.trim();
    if (!normalized && !isEnd) return;
    this.setState('speaking');
    const ssmlEnabled = isExpressionSsmlEnabled();
    const extra: XmovAvatarSpeakExtra = { client_speak_id: clientSpeakId };
    if (ssmlEnabled && this.plan) {
      if (this.plan.facialEmotion !== 'neutral') extra.xmov_facial_emotion = this.plan.facialEmotion;
      if (this.plan.action) extra.xmov_action = this.plan.action;
    }
    await this.instance?.speak?.(
      normalized ? renderSsml(normalized, this.plan, ssmlEnabled) : '<speak></speak>',
      isStart,
      isEnd,
      extra,
    );
  }

  async playAction(
    semantic: string,
    clientSpeakId = `xmov_ka_${Date.now()}`,
  ): Promise<void> {
    this.requireInstance();
    this.setState('speaking');
    await this.instance?.speak?.(
      buildXmovKaSsml(semantic),
      true,
      true,
      { client_speak_id: clientSpeakId },
    );
  }

  /** One utterance keeps fixed coaching speech and the verified KA together. */
  async speakFeedback(text: string, semantic: string | null, clientSpeakId: string): Promise<void> {
    this.requireInstance();
    const instance = this.instance;
    if (!instance?.speak) throw new Error('Xmov speech is unavailable');
    this.setState('speaking');
    await instance.speak(
      semantic ? buildXmovKaSsml(semantic, text) : renderSsml(text, null, false),
      true, true, { client_speak_id: clientSpeakId },
    );
  }

  /**
   * Task 3：应用本轮表达计划。
   * 纯本地记录 + 事件通知（SDK 无本地表情 API；风格经 speak 的 SSML/extra 透传网关）。
   */
  applyExpression(plan: ExpressionPlan): void {
    this.plan = plan;
    this.events.onExpressionChange?.(plan);
  }

  getExpression(): ExpressionPlan | null {
    return this.plan;
  }

  async interrupt(): Promise<void> {
    if (!this.instance) return;
    await this.instance.interrupt?.('speak');
    this.setState('interactive-idle');
  }

  async destroy(): Promise<void> {
    const instance = this.instance;
    this.instance = null;
    this.plan = null;
    if (instance) {
      try {
        await instance.destroy?.('user');
      } finally {
        this.setState('destroyed');
      }
    } else {
      this.setState('destroyed');
    }
  }

  private requireInstance(): void {
    if (!this.instance) throw new Error('XmovAvatar has not been initialized');
  }

  private setState(state: XmovAvatarRuntimeState, rawState?: string): void {
    this.state = state;
    this.events.onStateChange?.(state, rawState);
  }
}
