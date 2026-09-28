import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PasswordHasherService } from './password-hasher.service';
import { AdminRole } from './entities/admin-role.entity';
import { AdminUser } from './entities/admin-user.entity';

@Injectable()
export class AdminBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    @InjectRepository(AdminRole)
    private readonly roles: Repository<AdminRole>,
    @InjectRepository(AdminUser)
    private readonly administrators: Repository<AdminUser>,
    private readonly passwordHasher: PasswordHasherService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    let role = await this.roles.findOne({ where: { code: 'super_admin' } });
    if (!role) {
      role = await this.roles.save(this.roles.create({
        code: 'super_admin',
        name: '超级管理员',
        isActive: true,
      }));
    }

    if (await this.administrators.count() > 0) return;

    const username = this.config.get<string>('ADMIN_INITIAL_USERNAME')?.trim().toLowerCase();
    const password = this.config.get<string>('ADMIN_INITIAL_PASSWORD');
    if (!username || !password) {
      this.logger.warn(
        'No administrator exists. Set ADMIN_INITIAL_USERNAME and ADMIN_INITIAL_PASSWORD before first login.',
      );
      return;
    }

    const administrator = this.administrators.create({
      username,
      passwordHash: await this.passwordHasher.hash(password),
      displayName: '超级管理员',
      roleId: role.id,
      role,
      isActive: true,
      failedLoginCount: 0,
      lastLoginAt: null,
      lastLoginIp: null,
      deletedAt: null,
    });
    await this.administrators.save(administrator);
    this.logger.log(`Initial super administrator created: ${username}`);
  }
}
