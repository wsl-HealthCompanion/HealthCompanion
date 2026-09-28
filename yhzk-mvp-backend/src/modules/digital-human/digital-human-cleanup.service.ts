/**
 * 数字人会话清理服务
 * 定时扫描并清理过期的数字人会话（超过 2 分钟无心跳）
 * 通过 Redis 分布式锁保证多实例下只由一个实例执行清理
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { RedisTTL } from '../../config/redis.config';
import { DigitalHumanSessionRepository } from './digital-human-session.repository';
import { LiveTalkingSessionClient } from './live-talking-session.client';

@Injectable()
export class DigitalHumanCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DigitalHumanCleanupService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly sessions: DigitalHumanSessionRepository,
    private readonly runtime: LiveTalkingSessionClient,
  ) {}

  // 模块启动时启动定时清理任务，每 30 秒扫描一次
  onModuleInit() {
    this.timer = setInterval(() => {
      void this.cleanup().catch((error) =>
        this.logger.error(
          'Digital-human cleanup failed; ownership records were retained for retry',
          error instanceof Error ? error.stack : String(error),
        ),
      );
    }, 30_000);
    this.timer.unref(); // 允许事件循环在只有这个定时器时正常退出
  }

  // 模块销毁时清除定时器
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // 清理过期会话的主流程
  async cleanup(): Promise<void> {
    // 生成唯一 owner 标识，用于分布式锁
    const owner = randomBytes(16).toString('hex');

    // 获取清理锁 — 多实例部署时只有一个实例能执行清理
    if (!await this.sessions.acquireCleanupLock(owner, 25_000)) return;

    try {
      // 找出 2 分钟前心跳之后就没更新的会话（最多 20 个）
      const cutoff = Date.now() - 120_000;
      const stale = await this.sessions.listStale(cutoff, 20);

      for (const candidate of stale) {
        try {
          // 标记会话为 closing — 如果心跳已更新则返回 null，跳过该会话
          const closing = await this.sessions.markClosingIfUnchanged(
            candidate.sessionId,
            candidate.lastHeartbeatAt,
            RedisTTL.DH_CLOSING,
          );
          if (!closing) continue;

          try {
            // 停止 LiveTalking 侧的会话资源
            await this.runtime.stop(closing.sessionId);
            // 停止成功，从 Redis 删除会话记录
            await this.sessions.remove(closing.sessionId);
          } catch (error) {
            // 停止失败 — 保留 closing 记录，下次清理时重试
            this.logger.warn(
              `Runtime stop failed for ${closing.sessionId}; closing record retained for retry: ${String(error)}`,
            );
          }
        } catch (error) {
          // 单个会话处理失败，不影响批次中其他会话
          this.logger.error(
            `Cleanup candidate ${candidate.sessionId} failed; continuing with the batch`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
    } finally {
      // 无论成功失败，都要释放清理锁
      await this.sessions.releaseCleanupLock(owner).catch(() => undefined);
    }
  }
}
