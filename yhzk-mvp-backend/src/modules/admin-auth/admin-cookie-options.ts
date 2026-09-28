import { ConfigService } from '@nestjs/config';

export function isAdminCookieSecure(config: ConfigService): boolean {
  const configured = config.get<string>('ADMIN_COOKIE_SECURE')?.trim().toLowerCase();
  if (configured === 'true') return true;
  if (configured === 'false') return false;
  return config.get<string>('NODE_ENV') === 'production';
}
