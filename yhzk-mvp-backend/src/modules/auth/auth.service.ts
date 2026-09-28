import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import Redis from 'ioredis';

import { User, UserStatus } from './entities/user.entity';
import { SmsCode } from './entities/sms-code.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { JwtPayload } from './jwt.strategy';
import { WechatConfig } from '../../config/wechat.config';
import { SmsConfig } from '../../config/sms.config';
import { redisConfig, RedisKeys, RedisTTL } from '../../config/redis.config';
import { ErrorCode } from '../../common/filters/all-exceptions.filter';
import {
  LoginResponseDto,
  LoginUserInfo,
  SendCodeResponseDto,
  RefreshTokenResponseDto,
} from './auth.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly redis: Redis;
  private readonly wechatConfig: WechatConfig;
  private readonly smsConfig: SmsConfig;

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(SmsCode)
    private readonly smsCodeRepo: Repository<SmsCode>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.redis = redisConfig();
    this.wechatConfig = new WechatConfig(configService);
    this.smsConfig = new SmsConfig(configService);
  }

  // ============================================================
  // 微信授权登录
  // ============================================================

  async wechatLogin(code: string, advisorId?: string): Promise<LoginResponseDto> {
    // 1. 调用微信 code2session
    const wxSession = await this.code2session(code);

    if (!wxSession.openid) {
      throw new UnauthorizedException({
        code: ErrorCode.WECHAT_CODE_INVALID,
        message: '微信授权失败,请重试',
      });
    }

    // 2. 在事务和用户行锁内查找/创建账号、复核状态并签发令牌。
    const { user, isNewUser, tokens } = await this.loginOrCreateUser(
      'openid',
      wxSession.openid,
      {
        openid: wxSession.openid,
        unionid: wxSession.unionid || null,
        status: UserStatus.REGISTERED,
      },
    );

    // 4. 缓存用户信息
    await this.cacheUserProfile(user);

    return {
      ...tokens,
      isNewUser,
      user: await this.buildLoginUserInfo(user),
    };
  }

  // ============================================================
  // 手机号验证码登录
  // ============================================================

  async sendSmsCode(phone: string, type: string = 'login'): Promise<SendCodeResponseDto> {
    // 1. 限流检查 (Redis 不可用时跳过)
    try {
      const rateKey = RedisKeys.SMS_RATE(phone);
      const rateLimited = await this.redis.get(rateKey);
      if (rateLimited) {
        throw new BadRequestException({
          code: ErrorCode.SMS_RATE_LIMITED,
          message: '验证码发送过于频繁,请60秒后再试',
        });
      }

      const dailyKey = RedisKeys.SMS_DAILY(phone);
      const dailyCount = parseInt(await this.redis.get(dailyKey) || '0', 10);
      if (dailyCount >= this.smsConfig.rateLimit.dailyLimit) {
        throw new BadRequestException({
          code: ErrorCode.SMS_DAILY_LIMIT,
          message: '今日验证码发送次数已达上限,请明天再试',
        });
      }
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      this.logger.warn('Redis unavailable, skipping SMS rate limiting');
    }

    // 2. 生成6位验证码
    const code = this.generateSmsCode();

    // 3. 保存到数据库 (数据库不可用时跳过)
    try {
      const smsCode = this.smsCodeRepo.create({
        phone, code, type,
        expires_at: new Date(Date.now() + this.smsConfig.rateLimit.codeExpiry * 1000),
      });
      await this.smsCodeRepo.save(smsCode);
    } catch (e) {
      this.logger.warn(`Failed to save SMS code to DB: ${e}`);
    }

    // 4. 发送短信
    try {
      await this.sendSmsViaTencentCloud(phone, code);
    } catch (e) {
      this.logger.warn(`SMS send failed for ${phone}: ${e}`);
    }

    this.logger.log(`SMS code for ${phone}: ${code} (DEV: use 123456 to login)`);

    return {
      expiresIn: this.smsConfig.rateLimit.codeExpiry,
      retryAfter: this.smsConfig.rateLimit.sendInterval,
    };
  }

  async phoneLogin(phone: string, code: string, advisorId?: string): Promise<LoginResponseDto> {
    const isDevMode = this.configService.get('NODE_ENV') === 'development' || !this.configService.get('NODE_ENV');

    // 1. 验证码校验: 开发模式 "123456" 直接通过
    if (!isDevMode || code !== '123456') {
      const smsCode = await this.smsCodeRepo.findOne({
        where: { phone, code, used: false, expires_at: MoreThan(new Date()) },
        order: { created_at: 'DESC' },
      });

      if (!smsCode) {
        const anyCode = await this.smsCodeRepo.findOne({
          where: { phone, code }, order: { created_at: 'DESC' },
        });
        if (anyCode && anyCode.expires_at <= new Date()) {
          throw new BadRequestException({
            code: ErrorCode.SMS_CODE_EXPIRED, message: '验证码已过期,请重新获取',
          });
        }
        throw new BadRequestException({
          code: ErrorCode.SMS_CODE_INVALID, message: '验证码错误,请重试',
        });
      }

      // 标记验证码已使用
      smsCode.used = true;
      await this.smsCodeRepo.save(smsCode);
    }

    // 2. 在事务和用户行锁内查找/创建账号、复核状态并签发令牌。
    const { user, isNewUser, tokens } = await this.loginOrCreateUser(
      'phone',
      phone,
      {
        phone,
        status: UserStatus.REGISTERED,
      },
    );

    // 5. 缓存
    await this.cacheUserProfile(user);

    return {
      ...tokens,
      isNewUser,
      user: await this.buildLoginUserInfo(user),
    };
  }

  // ============================================================
  // Token 刷新
  // ============================================================

  async refreshToken(refreshTokenStr: string): Promise<RefreshTokenResponseDto> {
    return this.userRepo.manager.transaction(async (manager) => {
      const refreshTokens = manager.getRepository(RefreshToken);
      const users = manager.getRepository(User);

      // 先读取 token 归属，再按照 user -> refresh_token 的固定顺序加锁，
      // 与管理员停用/恢复操作保持同一锁顺序，避免竞态和死锁。
      const candidate = await refreshTokens.findOne({
        where: { token: refreshTokenStr, revoked: false },
      });
      if (!candidate) this.throwRevokedToken();

      let userQuery = users
        .createQueryBuilder('user')
        .where('user.id = :userId', { userId: candidate!.user_id });
      if (manager.connection.options.type === 'postgres') {
        userQuery = userQuery.setLock('pessimistic_write');
      }
      const user = await userQuery.getOne();
      if (!user || Boolean(user.deleted_at) || Boolean(user.disabled_at)) {
        this.throwRevokedToken();
      }

      let tokenQuery = refreshTokens
        .createQueryBuilder('refreshToken')
        .where('refreshToken.id = :tokenId', { tokenId: candidate!.id })
        .andWhere('refreshToken.revoked = :revoked', { revoked: false });
      if (manager.connection.options.type === 'postgres') {
        tokenQuery = tokenQuery.setLock('pessimistic_write');
      }
      const storedToken = await tokenQuery.getOne();
      if (!storedToken || storedToken.auth_version !== (user!.auth_version ?? 0)) {
        this.throwRevokedToken();
      }
      if (storedToken!.expires_at <= new Date()) {
        throw new UnauthorizedException({
          code: ErrorCode.TOKEN_EXPIRED,
          message: '登录已过期,请重新登录',
        });
      }

      storedToken!.revoked = true;
      await refreshTokens.save(storedToken!);
      return this.issueTokens(user!, refreshTokens);
    });
  }

  // ============================================================
  // 登出
  // ============================================================

  async logout(userId: string, accessToken: string): Promise<void> {
    // 1. 撤销该用户所有 refresh token
    await this.refreshTokenRepo.update(
      { user_id: userId, revoked: false },
      { revoked: true },
    );

    // JwtStrategy validates auth_version on every protected request. Bumping
    // it here makes every already-issued access token unusable before another
    // digital-human session can be created after logout.
    await this.userRepo.increment({ id: userId }, 'auth_version', 1);

    // 2. 将当前 access token 加入黑名单 (短期)
    try {
      // 从 JWT 中提取 jti
      const payload = this.jwtService.decode(accessToken) as JwtPayload;
      if (payload?.jti) {
        const blacklistKey = RedisKeys.TOKEN_BLACKLIST(payload.jti);
        await this.redis.setex(blacklistKey, RedisTTL.TOKEN_BLACKLIST, '1');
      }
    } catch {
      this.logger.warn('Failed to blacklist token on logout');
    }

    // 3. 清除用户缓存
    try {
      await this.redis.del(RedisKeys.USER_PROFILE(userId));
    } catch {
      // 缓存删除失败不影响登出流程
    }

    this.logger.log(`User ${userId} logged out`);
  }

  // ============================================================
  // 私有方法
  // ============================================================

  /**
   * 调用微信 code2session 接口
   */
  private async code2session(code: string): Promise<{
    openid?: string;
    session_key?: string;
    unionid?: string;
    errcode?: number;
    errmsg?: string;
  }> {
    try {
      const params = this.wechatConfig.getCode2SessionParams(code);
      const response = await axios.get(this.wechatConfig.code2sessionUrl, {
        params,
        timeout: 5000,
      });

      const data = response.data;
      if (data.errcode && data.errcode !== 0) {
        this.logger.error(`Wechat code2session error: ${data.errcode} ${data.errmsg}`);
        throw new UnauthorizedException({
          code: ErrorCode.WECHAT_CODE_INVALID,
          message: `微信授权失败: ${data.errmsg || '未知错误'}`,
        });
      }

      return data;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      this.logger.error('Wechat code2session request failed', error);
      throw new UnauthorizedException({
        code: ErrorCode.WECHAT_CODE_INVALID,
        message: '微信服务暂时不可用,请稍后重试',
      });
    }
  }

  /**
   * 签发 JWT access token + refresh token
   */
  private async issueTokens(
    user: User,
    tokenRepository: Repository<RefreshToken> = this.refreshTokenRepo,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    const tokenId = uuidv4();
    const expiresIn = parseInt(this.configService.get('JWT_ACCESS_EXPIRES_IN', '604800'), 10);

    const payload: JwtPayload = {
      sub: user.id,
      phone: user.phone || undefined,
      openid: user.openid || undefined,
      jti: tokenId,
      authVersion: user.auth_version ?? 0,
    };

    const accessToken = this.jwtService.sign(payload);

    // 生成 refresh token (随机字符串)
    const refreshTokenStr = crypto.randomBytes(48).toString('base64url');

    // 保存 refresh token
    const refreshExpiry = new Date(
      Date.now() + parseInt(this.configService.get('JWT_REFRESH_EXPIRES_IN', '2592000'), 10) * 1000,
    );

    const refreshTokenEntity = tokenRepository.create({
      user_id: user.id,
      token: refreshTokenStr,
      auth_version: user.auth_version ?? 0,
      expires_at: refreshExpiry,
    });
    await tokenRepository.save(refreshTokenEntity);

    return {
      accessToken,
      refreshToken: refreshTokenStr,
      expiresIn,
    };
  }

  private async loginOrCreateUser(
    identityColumn: 'phone' | 'openid',
    identityValue: string,
    newUserData: Partial<User>,
  ): Promise<{
    user: User;
    isNewUser: boolean;
    tokens: RefreshTokenResponseDto;
  }> {
    return this.userRepo.manager.transaction(async (manager) => {
      // PostgreSQL 对“尚不存在的账号”没有行可锁，事务级 advisory lock
      // 可以把相同手机号/openid 的首次登录串行化，避免重复创建竞态。
      if (manager.connection.options.type === 'postgres') {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtext($1))',
          [`auth-login:${identityColumn}:${identityValue}`],
        );
      }

      const users = manager.getRepository(User);
      let query = users
        .createQueryBuilder('user')
        .where(`user.${identityColumn} = :identityValue`, { identityValue });
      if (manager.connection.options.type === 'postgres') {
        query = query.setLock('pessimistic_write');
      }

      let user = await query.getOne();
      const isNewUser = !user;
      if (user) {
        this.assertUserCanLogin(user);
      } else {
        user = users.create(newUserData);
      }

      user.last_login_at = new Date();
      if (user.status === UserStatus.GUEST) {
        user.status = UserStatus.REGISTERED;
      }
      user = await users.save(user);
      const tokens = await this.issueTokens(
        user,
        manager.getRepository(RefreshToken),
      );
      return { user, isNewUser, tokens };
    });
  }

  /**
   * 生成6位短信验证码
   */
  private generateSmsCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private assertUserCanLogin(user: User): void {
    if (user.deleted_at) {
      throw new ForbiddenException({
        code: ErrorCode.ACCOUNT_DELETED,
        message: '账号已删除，请联系管理员',
      });
    }
    if (user.disabled_at) {
      throw new ForbiddenException({
        code: ErrorCode.ACCOUNT_DISABLED,
        message: '账号已停用，请联系管理员',
      });
    }
  }

  private throwRevokedToken(): never {
    throw new UnauthorizedException({
      code: ErrorCode.TOKEN_REVOKED,
      message: 'Token 无效或已撤销',
    });
  }

  /**
   * 通过腾讯云SMS发送验证码
   * MVP 开发环境降级: 打印到控制台
   */
  private async sendSmsViaTencentCloud(phone: string, code: string): Promise<void> {
    if (process.env.NODE_ENV === 'development') {
      this.logger.log(`[DEV] SMS code for ${phone}: ${code}`);
      return;
    }

    try {
      // 生产环境: 调用腾讯云 SMS API
      const tencentcloud = require('tencentcloud-sdk-nodejs');
      const SmsClient = tencentcloud.sms.v20210111.Client;

      const client = new SmsClient({
        credential: {
          secretId: this.smsConfig.secretId,
          secretKey: this.smsConfig.secretKey,
        },
        region: this.smsConfig.region,
      });

      await client.SendSms({
        SmsSdkAppId: this.smsConfig.smsAppId,
        SignName: this.smsConfig.signName,
        TemplateId: this.smsConfig.templateId,
        TemplateParamSet: [code],
        PhoneNumberSet: [`+86${phone}`],
      });
    } catch (error) {
      this.logger.error(`Failed to send SMS to ${phone}`, error);
      throw new BadRequestException({
        code: ErrorCode.UNKNOWN,
        message: '短信发送失败,请稍后重试',
      });
    }
  }

  /**
   * 构建登录响应中的用户信息
   */
  private async buildLoginUserInfo(user: User): Promise<LoginUserInfo> {
    return {
      id: user.id,
      status: user.status,
      profileExists: user.status !== UserStatus.GUEST && user.status !== UserStatus.REGISTERED,
      advisorBound: false, // MVP 简化: 暂不检查顾问绑定状态
      isElderly: user.is_elderly,
      careMode: user.care_mode,
    };
  }

  /**
   * 缓存用户信息到 Redis (保留已有的 profile_summary 不被覆盖)
   */
  private async cacheUserProfile(user: User): Promise<void> {
    try {
      const key = RedisKeys.USER_PROFILE(user.id);
      // 保留已有的 profile_summary (由 chat.service.loadUserContext 写入)
      let existing: Record<string, any> = {};
      try {
        const raw = await this.redis.get(key);
        if (raw) existing = JSON.parse(raw);
      } catch { /* key 不存在或解析失败, 忽略 */ }
      await this.redis.setex(
        key,
        RedisTTL.USER_PROFILE,
        JSON.stringify({
          ...existing, // 保留 profile_summary
          id: user.id,
          phone: user.phone,
          openid: user.openid,
          status: user.status,
          is_elderly: user.is_elderly,
          care_mode: user.care_mode,
        }),
      );
    } catch {
      this.logger.warn(`Failed to cache user profile for ${user.id}`);
    }
  }
}
