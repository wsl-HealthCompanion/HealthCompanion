const DEFAULT_SDK_URL =
  'https://media.xingyun3d.com/xingyun3d/general/litesdk/xmovAvatar@latest.js';

const DEFAULT_GATEWAY_URL =
  'https://nebula-agent.xingyun3d.com/user/v1/ttsa/session';

function readEnv(name: keyof ImportMetaEnv): string {
  return String(import.meta.env[name] ?? '').trim();
}

export const XMOV_CONFIG = {
  appId: readEnv('VITE_XMOV_APP_ID'),
  appSecret: readEnv('VITE_XMOV_APP_SECRET'),
  sdkUrl: readEnv('VITE_XMOV_SDK_URL') || DEFAULT_SDK_URL,
  gatewayServer: readEnv('VITE_XMOV_GATEWAY_URL') || DEFAULT_GATEWAY_URL,
  authorization: readEnv('VITE_XMOV_AUTHORIZATION') || '888jn',
  showDevControls: readEnv('VITE_XMOV_SHOW_DEV_CONTROLS') === 'true',
} as const;

export const AVATAR_PROVIDER =
  (readEnv('VITE_AVATAR_PROVIDER') || 'livetalking').toLowerCase();

export function hasXmovCredentials(): boolean {
  return Boolean(XMOV_CONFIG.appId && XMOV_CONFIG.appSecret);
}

export function getXmovConfigProblem(): string | null {
  if (!XMOV_CONFIG.appId && !XMOV_CONFIG.appSecret) {
    return '缺少 VITE_XMOV_APP_ID 和 VITE_XMOV_APP_SECRET';
  }
  if (!XMOV_CONFIG.appId) return '缺少 VITE_XMOV_APP_ID';
  if (!XMOV_CONFIG.appSecret) return '缺少 VITE_XMOV_APP_SECRET';
  return null;
}
