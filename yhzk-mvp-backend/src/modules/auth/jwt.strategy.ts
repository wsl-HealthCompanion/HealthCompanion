import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { jwtConfig } from '../../config/jwt.config';
import { ErrorCode } from '../../common/filters/all-exceptions.filter';
import { User } from './entities/user.entity';

/**
 * JWT Payload 结构
 */
export interface JwtPayload {
  sub: string;        // user_id
  phone?: string;
  openid?: string;
  iat?: number;
  exp?: number;
  jti?: string;       // token 唯一标识(用于黑名单)
  authVersion?: number;
  isDemo?: boolean;
}

/**
 * Passport JWT 策略 (RS256)
 * 从 Authorization: Bearer <token> 中提取并验证 JWT
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {
    const config = jwtConfig();

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.publicKey,
      algorithms: [config.signOptions.algorithm],
    });
  }

  /**
   * JWT 验证通过后调用
   * 返回值挂载到 request.user
   */
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    const tokenAuthVersion = payload.authVersion ?? 0;
    if (
      !user ||
      Boolean(user.disabled_at) ||
      Boolean(user.deleted_at) ||
      (user.auth_version ?? 0) !== tokenAuthVersion
    ) {
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_REVOKED,
        message: '账号状态已变更，请重新登录',
      });
    }
    return {
      sub: payload.sub,
      phone: payload.phone,
      openid: payload.openid,
      jti: payload.jti,
      authVersion: user.auth_version ?? 0,
      isDemo: false,
    };
  }
}
