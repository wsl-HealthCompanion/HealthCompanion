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
  private activeFeedbackSpeakId: string | null = null;
  private activeFeedbackVoiceStart: ((atMs: number) => void) | null = null;
  private lifecycle = 0;
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

    const lifecycle = ++this.lifecycle;
    const current = () => lifecycle === this.lifecycle;
    let ownedInstance: XmovAvatarInstance | null = null;
    let closed = false;
    const releaseOwned = async () => {
      try { await ownedInstance?.destroy?.('user'); } catch { /* preserve original error */ }
    };

    try {
      this.setState('loading-sdk');
      const XmovAvatar = await loadXmovSdk(XMOV_CONFIG.sdkUrl);
      if (!current()) return;
      this.setState('initializing');

      const selector = containerId.startsWith('#') ? containerId : `#${containerId}`;
      const gatewayUrl = new URL(XMOV_CONFIG.gatewayServer);
      if (!gatewayUrl.searchParams.has('data_source')) {
        gatewayUrl.searchParams.set('data_source', '2');
      }
      if (!gatewayUrl.searchParams.has('custom_id')) {
        gatewayUrl.searchParams.set('custom_id', 'healthy-digital-human');
      }

      ownedInstance = new XmovAvatar({
        containerId: selector,
        appId: XMOV_CONFIG.appId,
        appSecret: XMOV_CONFIG.appSecret,
        gatewayServer: gatewayUrl.toString(),
        headers: { Authorization: XMOV_CONFIG.authorization },
        enableDebugger: false,
        hardwareAcceleration: 'prefer-hardware',
        onStateChange: (rawState: string) => {
          if (!current() || closed) return;
          this.setState(normalizeState(String(rawState || '')), rawState);
        },
        onVoiceStateChange: (status: string) => {
          if (!current() || closed) return;
          const normalized = String(status || '').toLowerCase();
          if (normalized.includes('start')) {
            this.setState('speaking', status);
            const onVoiceStart = this.activeFeedbackSpeakId
              ? this.activeFeedbackVoiceStart : null;
            this.activeFeedbackVoiceStart = null;
            onVoiceStart?.(performance.now());
          }
          if (normalized.includes('end')) {
            this.activeFeedbackSpeakId = null;
            this.activeFeedbackVoiceStart = null;
            this.setState('interactive-idle', status);
          }
          this.events.onVoiceStateChange?.(status);
        },
        onProxyWidgetEvent: (event: unknown) => {
          if (!current() || closed) return;
          this.events.onWidgetEvent?.(event);
        },
        onWidgetEvent: (event: unknown) => {
          if (!current() || closed) return;
          this.events.onWidgetEvent?.(event);
        },
        onMessage: (message: unknown) => {
          if (!current() || closed) return;
          if (message instanceof Error) this.events.onError?.(message);
          else if (message) this.events.onError?.(new Error(String(message)));
        },
      });
      this.instance = ownedInstance;

      await ownedInstance.init({
        onDownloadProgress: (progress: number) => {
          if (!current() || closed) return;
          this.events.onDownloadProgress?.(Number(progress) || 0);
        },
        onClose: () => {
          if (!current()) return;
          closed = true;
          if (this.state !== 'destroyed') this.setState('error');
        },
      });

      if (!current()) { await releaseOwned(); return; }
      if (closed) throw new Error('数字人连接已中断');
      await this.idle();
      if (!current()) { await releaseOwned(); return; }
      if (closed) throw new Error('数字人连接已中断');
    } catch (error) {
      if (!current()) { await releaseOwned(); return; }
      const normalized = error instanceof Error ? error : new Error(String(error));
      this.instance = null;
      this.lifecycle += 1;
      this.setState('error');
      this.events.onError?.(normalized);
      await releaseOwned();
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
    this.activeFeedbackSpeakId = null;
    this.activeFeedbackVoiceStart = null;
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
    this.activeFeedbackSpeakId = null;
    this.activeFeedbackVoiceStart = null;
    this.setState('speaking');
    await this.instance?.speak?.(
      buildXmovKaSsml(semantic),
      true,
      true,
      { client_speak_id: clientSpeakId },
    );
  }

  /** One utterance keeps fixed coaching speech and the verified KA together. */
  async speakFeedback(
    text: string,
    semantic: string | null,
    clientSpeakId: string,
    onSubmitted?: () => void,
    onVoiceStart?: (atMs: number) => void,
  ): Promise<void> {
    this.requireInstance();
    const instance = this.instance;
    if (!instance?.speak) throw new Error('Xmov speech is unavailable');
    this.setState('speaking');
    this.activeFeedbackSpeakId = clientSpeakId;
    this.activeFeedbackVoiceStart = onVoiceStart ?? null;
    const ssml = semantic ? buildXmovKaSsml(semantic, text) : renderSsml(text, null, false);
    onSubmitted?.();
    try {
      await instance.speak(ssml, true, true, { client_speak_id: clientSpeakId });
    } catch (error) {
      if (this.activeFeedbackSpeakId === clientSpeakId) {
        this.activeFeedbackSpeakId = null;
        this.activeFeedbackVoiceStart = null;
      }
      throw error;
    }
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
    this.activeFeedbackSpeakId = null;
    this.activeFeedbackVoiceStart = null;
    if (!this.instance) return;
    await this.instance.interrupt?.('speak');
    this.setState('interactive-idle');
  }

  async destroy(): Promise<void> {
    const lifecycle = ++this.lifecycle;
    this.activeFeedbackSpeakId = null;
    this.activeFeedbackVoiceStart = null;
    const instance = this.instance;
    this.instance = null;
    this.plan = null;
    if (instance) {
      try {
        await instance.destroy?.('user');
      } finally {
        if (lifecycle === this.lifecycle) this.setState('destroyed');
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
