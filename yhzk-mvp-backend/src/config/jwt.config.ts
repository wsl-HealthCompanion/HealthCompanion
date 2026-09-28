import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * JWT RS256 配置
 * MVP 使用非对称 RS256 签名:
 *   - Auth 模块持有私钥 (签发)
 *   - 其他服务使用公钥 (验证)
 *   - Phase 2 微服务拆分后验证无需私钥
 */
export const jwtConfig = () => {
  const privateKeyPath = process.env.JWT_PRIVATE_KEY_PATH || join(__dirname, '..', '..', 'keys', 'private.pem');
  const publicKeyPath = process.env.JWT_PUBLIC_KEY_PATH || join(__dirname, '..', '..', 'keys', 'public.pem');

  let privateKey: string;
  let publicKey: string;

  try {
    privateKey = readFileSync(privateKeyPath, 'utf8');
    publicKey = readFileSync(publicKeyPath, 'utf8');
  } catch {
    // 开发环境降级: 使用 HMAC 对称签名 (HS256)
    console.warn('[JWT Config] RSA key files not found, falling back to HS256 for development');
    privateKey = process.env.JWT_SECRET || 'yhzk-mvp-dev-secret-key-change-in-production';
    publicKey = privateKey;
  }

  return {
    privateKey,
    publicKey,
    accessExpiresIn: parseInt(process.env.JWT_ACCESS_EXPIRES_IN || '604800', 10),  // 7天(秒)
    refreshExpiresIn: parseInt(process.env.JWT_REFRESH_EXPIRES_IN || '2592000', 10), // 30天(秒)
    signOptions: {
      algorithm: privateKey.startsWith('-----BEGIN') ? 'RS256' as const : 'HS256' as const,
      expiresIn: parseInt(process.env.JWT_ACCESS_EXPIRES_IN || '604800', 10),
    },
  };
};
