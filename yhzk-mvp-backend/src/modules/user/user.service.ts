import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { User } from '../auth/entities/user.entity';
import { UpdateUserDto, UserProfileDto } from './user.dto';
import { redisConfig, RedisKeys, RedisTTL } from '../../config/redis.config';
import { ErrorCode } from '../../common/filters/all-exceptions.filter';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  private readonly redis: Redis;

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {
    this.redis = redisConfig();
  }

  /**
   * 获取用户信息 (先查缓存, 再查数据库)
   */
  async getProfile(userId: string): Promise<UserProfileDto> {
    // 直接读数据库，避免管理员修改老年/关怀模式后读到旧缓存。
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: '用户不存在',
      });
    }

    const profile = this.mapUserToProfile(user);

    // 写回缓存，供其他场景使用。
    const cacheKey = RedisKeys.USER_PROFILE(userId);
    try {
      await this.redis.setex(cacheKey, RedisTTL.USER_PROFILE, JSON.stringify(profile));
    } catch {
      this.logger.warn(`Failed to cache profile for ${userId}`);
    }

    return profile;
  }

  /**
   * 更新用户信息
   */
  async updateProfile(userId: string, dto: UpdateUserDto): Promise<UserProfileDto> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: '用户不存在',
      });
    }

    if (dto.care_mode !== undefined) {
      user.care_mode = dto.care_mode;
    }

    await this.userRepo.save(user);

    // 清除缓存
    try {
      await this.redis.del(RedisKeys.USER_PROFILE(userId));
    } catch {
      // ignore cache deletion failure
    }

    return this.mapUserToProfile(user);
  }

  /**
   * 映射 User Entity → UserProfileDto
   */
  private mapUserToProfile(user: User): UserProfileDto {
    return {
      id: user.id,
      phone: user.phone,
      status: user.status,
      isElderly: user.is_elderly,
      careMode: user.care_mode,
      createdAt: user.created_at.toISOString(),
      lastLoginAt: user.last_login_at?.toISOString() || null,
    };
  }
}
