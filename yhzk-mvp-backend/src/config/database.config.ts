import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'path';

/**
 * TypeORM 数据库配置
 * 轻量开发模式 → SQLite (无需Docker) / 生产模式 → PostgreSQL
 */
export const databaseConfig = (): TypeOrmModuleOptions => {
  const useLightweight = process.env.DB_LIGHTWEIGHT === 'true';

  if (useLightweight) {
    // 轻量开发模式：SQLite 文件数据库，零依赖
    return {
      type: 'sqlite',
      database: join(__dirname, '..', '..', 'data', 'yhzk-mvp-dev.sqlite'),
      entities: [join(__dirname, '..', 'modules', '**', '*.entity.{ts,js}')],
      synchronize: true, // 自动建表
      logging: ['error', 'warn'],
    };
  }

  // 生产模式：PostgreSQL
  // 安全检查：生产环境不允许 NODE_ENV 误配导致 synchronize:true
  const isProduction = process.env.NODE_ENV === 'production';
  const syncEnabled = process.env.DB_SYNCHRONIZE === 'true'
    ? true
    : process.env.DB_SYNCHRONIZE === 'false'
      ? false
      : !isProduction; // 未设置时：非生产环境默认 true，生产环境默认 false

  // 禁止明文密码回退 — 生产环境必须通过环境变量注入
  const dbPassword = process.env.DB_PASSWORD;
  if (!dbPassword && isProduction) {
    throw new Error('[Database] DB_PASSWORD must be set in production environment');
  }

  return {
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER || 'yhzk',
    password: dbPassword || 'yhzk_dev_2024',
    database: process.env.DB_NAME || 'yhzk_mvp',
    entities: [join(__dirname, '..', 'modules', '**', '*.entity.{ts,js}')],
    synchronize: syncEnabled,
    logging: isProduction ? ['error'] : ['error', 'warn'],
    ssl: isProduction ? { rejectUnauthorized: false } : false,
    extra: {
      max: parseInt(process.env.DB_POOL_MAX || '20', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    },
    // 连接池耗尽时等待而非立即报错
    poolErrorHandler: (err) => {
      console.error('[Database] Pool error:', err.message);
    },
  };
};
