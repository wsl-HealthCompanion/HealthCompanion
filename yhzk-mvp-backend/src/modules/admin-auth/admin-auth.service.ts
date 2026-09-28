import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import { PasswordHasherService } from './password-hasher.service';
import { AdminUser } from './entities/admin-user.entity';

export interface AdminRequestMeta {
  ip: string | null;
  userAgent: string | null;
}

export interface AdminIdentity {
  id: string;
  username: string;
  displayName: string;
  roleCode: string;
}

@Injectable()
export class AdminAuthService {
  constructor(
    @InjectRepository(AdminUser)
    private readonly administrators: Repository<AdminUser>,
    private readonly passwordHasher: PasswordHasherService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AdminAuditService,
  ) {}

  async login(
    usernameInput: string,
    password: string,
    meta: AdminRequestMeta,
  ): Promise<{ token: string; admin: AdminIdentity }> {
    const username = usernameInput.trim().toLowerCase();
    const admin = await this.administrators.findOne({
      where: { username, deletedAt: IsNull() },
      relations: { role: true },
    });

    const passwordMatches = admin
      ? await this.passwordHasher.verify(password, admin.passwordHash)
      : false;
    if (!admin || !admin.isActive || !admin.role?.isActive || !passwordMatches) {
      if (admin) {
        admin.failedLoginCount += 1;
        await this.administrators.save(admin);
      }
      await this.audit.record({
        adminUserId: admin?.id ?? null,
        action: 'ADMIN_LOGIN_FAILED',
        resourceType: 'admin_user',
        resourceId: admin?.id ?? username,
        success: false,
        errorMessage: 'invalid_credentials_or_inactive',
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedException('管理员账号或密码错误');
    }

    admin.failedLoginCount = 0;
    admin.lastLoginAt = new Date();
    admin.lastLoginIp = meta.ip;
    await this.administrators.save(admin);

    const secret = this.config.get<string>('ADMIN_JWT_SECRET');
    if (!secret) {
      throw new Error('ADMIN_JWT_SECRET is required');
    }
    const token = this.jwtService.sign(
      {
        sub: admin.id,
        username: admin.username,
        role: admin.role.code,
        scope: 'admin',
      },
      { secret, expiresIn: 8 * 60 * 60 },
    );
    const identity: AdminIdentity = {
      id: admin.id,
      username: admin.username,
      displayName: admin.displayName,
      roleCode: admin.role.code,
    };
    await this.audit.record({
      adminUserId: admin.id,
      action: 'ADMIN_LOGIN',
      resourceType: 'admin_user',
      resourceId: admin.id,
      afterData: { username: admin.username, role: admin.role.code },
      success: true,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
    return { token, admin: identity };
  }
}
