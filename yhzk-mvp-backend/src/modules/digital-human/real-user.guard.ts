import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtPayload } from '../auth/jwt.strategy';

@Injectable()
export class RealUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<{ user?: JwtPayload }>().user;
    if (!user || user.isDemo !== false) {
      throw new UnauthorizedException('数字人会话只允许正式登录用户使用');
    }
    return true;
  }
}
