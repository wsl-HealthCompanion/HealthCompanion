import { ConfigService } from '@nestjs/config';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminAuthGuard } from './admin-auth.guard';

function contextFor(headers: Record<string, string>): {
  context: ExecutionContext;
  request: Record<string, unknown>;
} {
  const request: Record<string, unknown> = { headers };
  return {
    request,
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext,
  };
}

describe('AdminAuthGuard', () => {
  const secret = 'guard-test-secret-with-enough-length';
  const jwt = new JwtService({ secret });
  const guard = new AdminAuthGuard(jwt, new ConfigService({ ADMIN_JWT_SECRET: secret }));

  function token(scope = 'admin') {
    return jwt.sign({
      sub: '11111111-1111-4111-8111-111111111111',
      username: 'superadmin',
      role: 'super_admin',
      scope,
    });
  }

  it('accepts the HttpOnly session cookie and attaches the administrator identity', () => {
    const { context, request } = contextFor({
      cookie: `theme=dark; yhzk_admin_session=${token()}; language=zh-CN`,
    });

    expect(guard.canActivate(context)).toBe(true);
    expect(request.admin).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      username: 'superadmin',
      roleCode: 'super_admin',
    });
  });

  it('accepts a bearer token for non-browser administration clients', () => {
    const { context } = contextFor({ authorization: `Bearer ${token()}` });

    expect(guard.canActivate(context)).toBe(true);
  });

  it.each([
    {},
    { cookie: 'yhzk_admin_session=invalid' },
    { authorization: `Bearer ${token('user')}` },
  ])('rejects a missing, malformed, or non-admin token', (headers) => {
    const { context } = contextFor(headers as Record<string, string>);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
