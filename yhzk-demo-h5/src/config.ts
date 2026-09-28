// ============================================================
// Demo 全局配置 — 全部从 .env 读取，改地址不用改代码
// ============================================================

export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000/api/v1';

// Demo 用固定 demo token — 后端 JwtAuthGuard 见 demo_ 前缀直接放行
export const DEMO_TOKEN = 'demo_h5_demo_fixed';
