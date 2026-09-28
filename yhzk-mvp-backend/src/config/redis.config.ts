import Redis from 'ioredis';

/**
 * Redis 连接配置
 * 参考 MVP-SPEC §2.2 Redis Key 设计
 *
 * 用途:
 *   - 会话上下文缓存 (context:{userId}:{sessionId})
 *   - 限流计数器 (sms:rate:{phone}, chat:rate:{userId})
 *   - Token黑名单 (token:blacklist:{tokenJti})
 *   - 数据缓存 (user:{id}:profile, advisor:available)
 *   - 微信 access_token 缓存
 */
export const redisConfig = () => {
  // 使用 ioredis 获取更丰富的功能支持
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || 'redis_dev_2024',
    db: 0,
    retryStrategy: (times: number) => {
      if (times > 3) return null; // 停止重试
      const delay = Math.min(times * 100, 3000);
      console.warn(`[Redis] Retry attempt ${times}, reconnecting in ${delay}ms...`);
      return delay;
    },
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    lazyConnect: true,
  });

  redis.on('connect', () => console.log('[Redis] Connected'));
  redis.on('error', (err) => console.error('[Redis] Error:', err.message));

  return redis;
};

/**
 * Redis Key 前缀常量 (参考 MVP-SPEC §2.2)
 */
export const RedisKeys = {
  // 会话缓存
  CONTEXT: (userId: string, sessionId: string) => `context:${userId}:${sessionId}`,

  // 限流
  SMS_RATE: (phone: string) => `sms:rate:${phone}`,
  SMS_DAILY: (phone: string) => `sms:daily:${phone}`,
  CHAT_RATE: (userId: string) => `chat:rate:${userId}`,

  // Token黑名单
  TOKEN_BLACKLIST: (tokenJti: string) => `token:blacklist:${tokenJti}`,

  // 缓存
  USER_PROFILE: (userId: string) => `user:${userId}:profile`,
  ADVISOR_AVAILABLE: 'advisor:available',
  DISEASE_HOT: 'disease:hot',

  // 微信
  WECHAT_ACCESS_TOKEN: 'wechat:access_token',

  // 独立数字人会话
  DH_ACTIVE_USER: (userId: string) => `dh:active:user:${userId}`,
  DH_PENDING_USER: (userId: string) => `dh:pending:user:${userId}`,
  DH_REVOCATION_GENERATION: (userId: string) => `dh:revocation:user:${userId}`,
  DH_SESSION: (sessionId: string) => `dh:session:${sessionId}`,
  DH_USER_LOCK: (userId: string) => `dh:lock:user:${userId}`,
  DH_HEARTBEATS: 'dh:sessions:heartbeat',
  DH_CLEANUP_LOCK: 'dh:lock:cleanup',
} as const;

// Redis TTL 常量 (秒)
export const RedisTTL = {
  CONTEXT: 7 * 24 * 3600,          // 7天
  SMS_RATE: 60,                     // 60秒
  SMS_DAILY: 86400,                 // 24小时
  CHAT_RATE: 1,                     // 1秒
  TOKEN_BLACKLIST: 7 * 24 * 3600,  // 7天
  USER_PROFILE: 3600,              // 1小时
  ADVISOR_AVAILABLE: 300,          // 5分钟
  DISEASE_HOT: 86400,              // 24小时
  WECHAT_ACCESS_TOKEN: 7000,       // ~2小时
  DH_SESSION: 180,                 // 心跳丢失后自动过期
  DH_CLOSING: 24 * 3600,
} as const;
