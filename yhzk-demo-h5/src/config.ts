// ============================================================
// Demo 全局配置 — 全部从 .env 读取，改地址不用改代码
// ============================================================

export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000/api/v1';

export const DEMO_MODE = import.meta.env.MODE === 'demo';
