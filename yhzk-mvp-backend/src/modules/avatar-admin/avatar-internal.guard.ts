import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class AvatarInternalGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const receivedHeader = request.headers['x-avatar-internal-token'];
    const received = Array.isArray(receivedHeader) ? receivedHeader[0] : receivedHeader;
    const expected = this.config.get<string>('AVATAR_INTERNAL_TOKEN');
    if (!received || !expected) throw new UnauthorizedException('invalid internal token');

    const receivedBytes = Buffer.from(received);
    const expectedBytes = Buffer.from(expected);
    if (
      receivedBytes.length !== expectedBytes.length ||
      !timingSafeEqual(receivedBytes, expectedBytes)
    ) {
      throw new UnauthorizedException('invalid internal token');
    }
    return true;
  }
}
