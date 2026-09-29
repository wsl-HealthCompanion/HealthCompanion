export type XmovAvatarRuntimeState =
  | 'unconfigured'
  | 'loading-sdk'
  | 'initializing'
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'interactive-idle'
  | 'error'
  | 'destroyed';

export interface XmovAvatarInitOptions {
  onDownloadProgress?: (progress: number) => void;
  onClose?: () => void;
}

export interface XmovAvatarSpeakExtra {
  client_speak_id?: string;
  [key: string]: unknown;
}

export interface XmovAvatarInstance {
  init(options?: XmovAvatarInitOptions): Promise<void>;
  idle?(): void | Promise<void>;
  listen?(): void | Promise<void>;
  think?(): void | Promise<void>;
  interactiveidle?(): void | Promise<void>;
  speak?(
    ssml: string,
    isStart: boolean,
    isEnd: boolean,
    extra?: XmovAvatarSpeakExtra,
  ): void | Promise<void>;
  interrupt?(type?: string): void | Promise<void>;
  destroy?(reason?: string): void | Promise<void>;
  stop?(): void | Promise<void>;
  getStatus?(): unknown;
  getSessionId?(): string | undefined;
  setVolume?(volume: number): void;
}

export interface XmovAvatarConstructorOptions {
  containerId: string;
  appId: string;
  appSecret: string;
  gatewayServer: string;
  headers?: Record<string, string>;
  enableDebugger?: boolean;
  hardwareAcceleration?: 'default' | 'prefer-hardware' | 'prefer-software';
  onProxyWidgetEvent?: (event: unknown) => void;
  onWidgetEvent?: (event: unknown) => void;
  onStateChange?: (state: string) => void;
  onVoiceStateChange?: (status: string) => void;
  onMessage?: (message: unknown) => void;
}

export type XmovAvatarConstructor = new (
  options: XmovAvatarConstructorOptions,
) => XmovAvatarInstance;

declare global {
  interface Window {
    XmovAvatar?: XmovAvatarConstructor;
  }
}
