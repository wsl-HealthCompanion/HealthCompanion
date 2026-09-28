import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * @CurrentUser() 参数装饰器
 * 从 JWT 认证后的 request.user 中提取当前登录用户信息
 *
 * 用法:
 *   @CurrentUser() user: JwtPayload
 *   @CurrentUser('id') userId: string
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return null;
    }

    return data ? user[data] : user;
  },
);
