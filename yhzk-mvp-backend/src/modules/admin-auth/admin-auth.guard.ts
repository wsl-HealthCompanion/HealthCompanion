import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

export interface AdminPrincipal {
  id: string;
  username: string;
  roleCode: string;
}

interface AdminTokenPayload {
  sub: string;
  username: string;
  role: string;
  scope: string;
}

function cookieValue(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const item of header.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0) continue;
    const key = item.slice(0, separator).trim();
    if (key === name) {
      return decodeURIComponent(item.slice(separator + 1).trim());
    }
  }
  return null;
}

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      admin?: AdminPrincipal;
    }>();
    const authorization = request.headers.authorization ?? '';
    const bearer = authorization.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length).trim()
      : null;
    const token = bearer || cookieValue(request.headers.cookie, 'yhzk_admin_session');
    const secret = this.config.get<string>('ADMIN_JWT_SECRET');
    if (!token || !secret) {
      throw new UnauthorizedException('请先登录管理员账号');
    }

    try {
      const payload = this.jwtService.verify<AdminTokenPayload>(token, { secret });
      if (
        payload.scope !== 'admin' ||
        !payload.sub ||
        !payload.username ||
        payload.role !== 'super_admin'
      ) {
        throw new Error('invalid admin scope');
      }
      request.admin = {
        id: payload.sub,
        username: payload.username,
        roleCode: payload.role,
      };
      return true;
    } catch {
      throw new UnauthorizedException('管理员登录已失效，请重新登录');
    }
  }
}
