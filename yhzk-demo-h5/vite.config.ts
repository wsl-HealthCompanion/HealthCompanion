import { defineConfig } from 'vite';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 允许用环境变量覆盖后端代理目标：
// 不同环境后端端口不同（本地 3000，服务器 PM2 实际监听 4000）
// 启动示例：VITE_PROXY_API_TARGET=http://127.0.0.1:4000 npm run dev
declare const process: { env: Record<string, string | undefined> };
const projectDir = dirname(fileURLToPath(import.meta.url));

/**
 * H5 数字人 Demo — Vite 配置
 *
 * basicSsl:  自动生成自签证书，启用 HTTPS
 *            → 手机可以用麦克风，不再被浏览器拦截
 *
 * proxy:     所有后端请求通过 Vite 转发，统一走 HTTPS
 *            → 不再有"混合内容"报错，换 WiFi 也不用改地址
 */
export default defineConfig(({ mode }) => {
  const isDemo = mode === 'demo';
  const envDir = isDemo ? resolve(projectDir, 'demo-env') : projectDir;
  const env = loadEnv(mode, envDir, '');
  const apiProxyTarget = isDemo
    ? env.DEMO_API_PROXY_TARGET || 'http://127.0.0.1:3000'
    : process.env.VITE_PROXY_API_TARGET || 'http://127.0.0.1:3000';
  const proxy: Record<string, any> = {
    '/api': {
      target: apiProxyTarget,
      changeOrigin: true,
    },
  };

  if (!isDemo) {
    proxy['/dh'] = {
      target: 'http://127.0.0.1:8010',
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/dh/, ''),
    };
    proxy['/live'] = {
      target: 'http://115.190.225.138:8180',
      changeOrigin: true,
    };
  }

  return {
    envDir,
    plugins: isDemo ? [react()] : [react(), basicSsl()],
    server: {
      host: isDemo ? '127.0.0.1' : true,
      port: 5273,
      strictPort: isDemo,
      proxy,
    },
    preview: {
      host: isDemo ? '127.0.0.1' : true,
      port: 5273,
    },
  };
});
