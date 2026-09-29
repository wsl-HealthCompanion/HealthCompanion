import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { CustomThrottlerGuard } from './common/guards/throttler.guard';
import { databaseConfig } from './config/database.config';

// 业务模块导入
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { ChatModule } from './modules/chat/chat.module';
import { AdvisorModule } from './modules/advisor/advisor.module';
import { NotificationModule } from './modules/notification/notification.module';
import { AdminAuditModule } from './modules/admin-audit/admin-audit.module';
import { AdminAuthModule } from './modules/admin-auth/admin-auth.module';
import { AvatarAdminModule } from './modules/avatar-admin/avatar-admin.module';
import { AdminUserModule } from './modules/admin-user/admin-user.module';
import { DigitalHumanModule } from './modules/digital-human/digital-human.module';
import { XmovActionsModule } from './modules/xmov-actions/xmov-actions.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    // 环境变量 (全局)
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // 数据库 (TypeORM + PostgreSQL)
    TypeOrmModule.forRootAsync({
      useFactory: () => databaseConfig(),
    }),

    // 限流 (全局)
    ThrottlerModule.forRoot([
      {
        ttl: 60000,    // 60秒窗口
        limit: 30,     // 最多30次
      },
    ]),

    // 业务模块
    AuthModule,
    UserModule,
    OnboardingModule,
    ChatModule,
    AdvisorModule,
    NotificationModule,
    AdminAuditModule,
    AdminAuthModule,
    AvatarAdminModule,
    AdminUserModule,
    DigitalHumanModule,
    XmovActionsModule,
  ],
  controllers: [HealthController],
  providers: [
    // 全局限流守卫
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
  ],
})
export class AppModule {}
