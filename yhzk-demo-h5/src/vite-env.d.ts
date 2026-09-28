/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE: string;
  readonly VITE_XFYUN_APP_ID: string;
  readonly VITE_XFYUN_API_KEY: string;
  readonly VITE_XFYUN_API_SECRET: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
