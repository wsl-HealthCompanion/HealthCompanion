import { loadXmovSdk } from './loadXmovSdk';
import { XMOV_CONFIG, getXmovConfigProblem } from './xmovConfig';
import type {
  XmovAvatarInstance,
  XmovAvatarRuntimeState,
} from './types';

export interface XmovAvatarProviderEvents {
  onStateChange?: (state: XmovAvatarRuntimeState, rawState?: string) => void;
  onVoiceStateChange?: (status: string) => void;
  onDownloadProgress?: (progress: number) => void;
  onError?: (error: Error) => void;
  onWidgetEvent?: (event: unknown) => void;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toSsml(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '<speak></speak>';
  if (/^<speak(?:\s|>)/i.test(trimmed)) return trimmed;
  return `<speak>${escapeXml(trimmed)}</speak>`;
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

      this.instance = new XmovAvatar({
        containerId: selector,
        appId: XMOV_CONFIG.appId,
        appSecret: XMOV_CONFIG.appSecret,
        gatewayServer: XMOV_CONFIG.gatewayServer,
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
    if (!text.trim()) return;
    this.setState('speaking');
    await this.instance?.speak?.(toSsml(text), isStart, isEnd, {
      client_speak_id: clientSpeakId,
    });
  }

  async interrupt(): Promise<void> {
    if (!this.instance) return;
    await this.instance.interrupt?.('speak');
    this.setState('interactive-idle');
  }

  async destroy(): Promise<void> {
    const instance = this.instance;
    this.instance = null;
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
