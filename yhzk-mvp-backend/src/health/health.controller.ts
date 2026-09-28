import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

/**
 * 健康检查端点
 * GET /api/v1/health — 检查 DB/Redis/Milvus 连接状态
 */
@ApiTags('Health — 健康检查')
@Controller('health')
export class HealthController {
  /**
   * 系统健康检查
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '系统健康检查' })
  @ApiResponse({
    status: 200,
    description: '各组件状态',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: 'ok' },
        data: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'ok' },
            postgres: { type: 'string', example: 'connected' },
            redis: { type: 'string', example: 'connected' },
            milvus: { type: 'string', example: 'connected' },
            uptime: { type: 'number', description: '进程运行时间(秒)' },
            version: { type: 'string', example: '1.0.0' },
          },
        },
      },
    },
  })
  async check() {
    const checks: Record<string, string> = {
      postgres: 'unknown',
      redis: 'unknown',
      milvus: 'unknown',
    };

    // PostgreSQL 检查
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pg = require('pg');
      const pool = new pg.Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME || 'yhzk_mvp',
        user: process.env.DB_USER || 'yhzk',
        password: process.env.DB_PASSWORD || 'yhzk_dev_2024',
        connectionTimeoutMillis: 3000,
      });
      await pool.query('SELECT 1');
      await pool.end();
      checks.postgres = 'connected';
    } catch {
      checks.postgres = 'disconnected';
    }

    // Redis 检查
    try {
      const Redis = (await import('ioredis')).default;
      const redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD,
        connectTimeout: 3000,
        maxRetriesPerRequest: 1,
        lazyConnect: true,
      });
      await redis.connect();
      await redis.ping();
      await redis.quit();
      checks.redis = 'connected';
    } catch {
      checks.redis = 'disconnected';
    }

    // Milvus 检查 — 暂未部署
    checks.milvus = 'disabled (not deployed)';

    const allConnected = Object.values(checks).every((s) => s === 'connected');

    return {
      status: allConnected ? 'ok' : 'degraded',
      ...checks,
      uptime: process.uptime(),
      version: '1.0.0',
    };
  }
}
