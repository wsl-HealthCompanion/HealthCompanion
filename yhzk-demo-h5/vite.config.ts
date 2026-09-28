import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

/**
 * H5 数字人 Demo — Vite 配置
 *
 * basicSsl:  自动生成自签证书，启用 HTTPS
 *            → 手机可以用麦克风，不再被浏览器拦截
 *
 * proxy:     所有后端请求通过 Vite 转发，统一走 HTTPS
 *            → 不再有"混合内容"报错，换 WiFi 也不用改地址
 */
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: true,
    port: 5273,
    proxy: {
      // NestJS 后端 API (3000)
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      // LiveTalking 数字人 (8010)
      // 请求 /dh/human → 转发到 http://localhost:8010/human
      '/dh': {
        target: 'http://127.0.0.1:8010',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/dh/, ''),
      },
      // SRS 流媒体 远程服务器
      '/live': {
        target: 'http://115.190.225.138:8180',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: true,
    port: 5273,
  },
});
