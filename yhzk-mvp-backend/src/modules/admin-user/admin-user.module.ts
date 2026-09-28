import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuditModule } from '../admin-audit/admin-audit.module';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { User } from '../auth/entities/user.entity';
import { AdminUserController } from './admin-user.controller';
import { AdminUserService } from './admin-user.service';
import { DigitalHumanModule } from '../digital-human/digital-human.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    AdminAuthModule,
    AdminAuditModule,
    DigitalHumanModule,
  ],
  controllers: [AdminUserController],
  providers: [AdminUserService],
})
export class AdminUserModule {}
