import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { createHash } from 'crypto';
import { ErrorCode } from '../filters/all-exceptions.filter';

/**
 * 用 demo token 生成确定性 UUID v4
 * 同一个 token 永远生成同一个 userId, 不同 token 一定是不同 userId
 */
function demoUserId(token: string): string {
  const hex = createHash('md5').update(token).digest('hex');
  // 用 MD5 的 32 个 hex 字符构造 UUID v4 格式: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * JWT 认证守卫
 * 使用 Passport JWT 策略验证 Bearer Token
 * 开发模式: demo_ 前缀 token 直接通过, 每个 demo token 自动映射为独立用户
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');

    if (token && token.startsWith('demo_')) {
      // 每个 demo token 映射到独立的 UUID 用户 — 不再是所有人共用 demo_user_001
      return {
        sub: demoUserId(token),
        phone: null,
        openid: null,
        isDemo: true,
      };
    }

    if (err || !user) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: info?.message === 'jwt expired'
          ? '登录已过期,请重新登录'
          : '请先登录',
      });
    }
    return user;
  }
}
