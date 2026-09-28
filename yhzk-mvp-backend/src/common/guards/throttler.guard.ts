import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerOptions, ThrottlerGetTrackerFunction, ThrottlerGenerateKeyFunction } from '@nestjs/throttler';

/**
 * 限流守卫
 * 基于 @nestjs/throttler
 * 健康检查端点跳过限流
 */
@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  async handleRequest(
    context: ExecutionContext,
    limit: number,
    ttl: number,
    throttler: ThrottlerOptions,
    getTracker: ThrottlerGetTrackerFunction,
    generateKey: ThrottlerGenerateKeyFunction,
  ): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // 健康检查端点不限流
    if (request.url?.includes('/health')) {
      return true;
    }

    return super.handleRequest(context, limit, ttl, throttler, getTracker, generateKey);
  }
}
