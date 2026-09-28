import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import Redis from 'ioredis';
import { redisConfig } from '../../config/redis.config';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AvatarAdminModule } from '../avatar-admin/avatar-admin.module';
import { DigitalHumanCleanupService } from './digital-human-cleanup.service';
import { DigitalHumanController } from './digital-human.controller';
import { DigitalHumanMediaTicketService } from './digital-human-media-ticket.service';
import { DigitalHumanSessionRepository } from './digital-human-session.repository';
import { DigitalHumanSessionService } from './digital-human.service';
import { LiveTalkingSessionClient } from './live-talking-session.client';
import { RealUserGuard } from './real-user.guard';
import { RedisDigitalHumanSessionRepository } from './redis-digital-human-session.repository';

export const DIGITAL_HUMAN_REDIS = Symbol('DIGITAL_HUMAN_REDIS');

@Module({
  imports: [ConfigModule, AvatarAdminModule],
  controllers: [DigitalHumanController],
  providers: [
    { provide: DIGITAL_HUMAN_REDIS, useFactory: () => redisConfig() },
    {
      provide: DigitalHumanSessionRepository,
      inject: [DIGITAL_HUMAN_REDIS],
      useFactory: (redis: Redis) => new RedisDigitalHumanSessionRepository(redis),
    },
    DigitalHumanMediaTicketService,
    LiveTalkingSessionClient,
    DigitalHumanSessionService,
    DigitalHumanCleanupService,
    RealUserGuard,
    JwtAuthGuard,
  ],
  exports: [DigitalHumanSessionService],
})
export class DigitalHumanModule {}
