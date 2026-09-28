import { ConfigService } from '@nestjs/config';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AvatarInternalGuard } from './avatar-internal.guard';

function context(token?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: token ? { 'x-avatar-internal-token': token } : {},
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('AvatarInternalGuard', () => {
  const guard = new AvatarInternalGuard(
    new ConfigService({ AVATAR_INTERNAL_TOKEN: 'internal-secret-value' }),
  );

  it('accepts the exact internal service token', () => {
    expect(guard.canActivate(context('internal-secret-value'))).toBe(true);
  });

  it.each([undefined, '', 'internal-secret-valuE', 'internal-secret-value-extra'])(
    'rejects missing or different token %j',
    (token) => {
      expect(() => guard.canActivate(context(token))).toThrow(UnauthorizedException);
    },
  );
});
