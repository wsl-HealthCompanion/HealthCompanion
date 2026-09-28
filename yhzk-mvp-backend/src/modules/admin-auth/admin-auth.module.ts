import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuditModule } from '../admin-audit/admin-audit.module';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminAuthService } from './admin-auth.service';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { PasswordHasherService } from './password-hasher.service';
import { AdminRole } from './entities/admin-role.entity';
import { AdminUser } from './entities/admin-user.entity';
import { AdminPermission } from './entities/admin-permission.entity';
import { AdminRolePermission } from './entities/admin-role-permission.entity';

@Module({
  imports: [
    JwtModule.register({}),
    TypeOrmModule.forFeature([AdminRole, AdminUser, AdminPermission, AdminRolePermission]),
    AdminAuditModule,
  ],
  controllers: [AdminAuthController],
  providers: [
    PasswordHasherService,
    AdminAuthService,
    AdminAuthGuard,
    AdminBootstrapService,
  ],
  exports: [AdminAuthGuard, AdminAuthService, JwtModule, TypeOrmModule],
})
export class AdminAuthModule {}
