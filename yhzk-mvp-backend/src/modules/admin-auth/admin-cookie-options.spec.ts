import { ConfigService } from '@nestjs/config';
import { isAdminCookieSecure } from './admin-cookie-options';

function config(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as ConfigService;
}

describe('isAdminCookieSecure', () => {
  it('defaults to secure cookies in production', () => {
    expect(isAdminCookieSecure(config({ NODE_ENV: 'production' }))).toBe(true);
  });

  it('allows the current HTTP-only deployment to opt out explicitly', () => {
    expect(isAdminCookieSecure(config({
      NODE_ENV: 'production',
      ADMIN_COOKIE_SECURE: 'false',
    }))).toBe(false);
  });

  it('can force secure cookies outside production for HTTPS testing', () => {
    expect(isAdminCookieSecure(config({ ADMIN_COOKIE_SECURE: 'true' }))).toBe(true);
  });
});
