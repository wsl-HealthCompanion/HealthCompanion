/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE: string;
  readonly VITE_XFYUN_APP_ID: string;
  readonly VITE_XFYUN_API_KEY: string;
  readonly VITE_XFYUN_API_SECRET: string;
  readonly VITE_AVATAR_PROVIDER: 'livetalking' | 'xmov' | string;
  readonly VITE_XMOV_APP_ID: string;
  readonly VITE_XMOV_APP_SECRET: string;
  readonly VITE_XMOV_SDK_URL: string;
  readonly VITE_XMOV_GATEWAY_URL: string;
  readonly VITE_XMOV_AUTHORIZATION: string;
  readonly VITE_XMOV_SHOW_DEV_CONTROLS: 'true' | 'false' | string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
