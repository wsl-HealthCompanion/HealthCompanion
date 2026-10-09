// ============================================================
// Demo 全局配置 — 全部从 .env 读取，改地址不用改代码
// ============================================================

export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000/api/v1';

// Demo 用固定 demo token — 后端 JwtAuthGuard 见 demo_ 前缀直接放行
export const DEMO_TOKEN = 'demo_h5_demo_fixed';

// 本地预览开关：跳过登录页与建档向导，直接进入主界面（方便调 UI / 看效果）
// 默认关闭，只有 .env.local 里写 VITE_DEV_SKIP_LOGIN=true 才生效
export const DEV_SKIP_LOGIN =
  import.meta.env.VITE_DEV_SKIP_LOGIN === 'true' || import.meta.env.VITE_DEV_SKIP_LOGIN === '1';
