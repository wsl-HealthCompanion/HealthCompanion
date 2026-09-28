import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { PasswordHasherService } from './password-hasher.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import { AdminUser } from './entities/admin-user.entity';
import { Repository } from 'typeorm';

type AuditEntry = Parameters<AdminAuditService['record']>[0];

class InMemoryAdminRepository {
  constructor(private readonly admin: AdminUser | null) {}

  saved: AdminUser[] = [];

  async findOne(): Promise<AdminUser | null> {
    return this.admin;
  }

  async save(admin: AdminUser): Promise<AdminUser> {
    this.saved.push(admin);
    return admin;
  }
}

describe('AdminAuthService', () => {
  const passwordHasher = new PasswordHasherService();
  const jwt = new JwtService({ secret: 'test-admin-jwt-secret-with-enough-length' });
  const config = new ConfigService({
    ADMIN_JWT_SECRET: 'test-admin-jwt-secret-with-enough-length',
    NODE_ENV: 'test',
  });

  async function setup(options?: { password?: string; active?: boolean }) {
    const password = options?.password ?? 'Right-Password';
    const admin = {
      id: '11111111-1111-4111-8111-111111111111',
      username: 'superadmin',
      passwordHash: await passwordHasher.hash(password),
      displayName: '超级管理员',
      isActive: options?.active ?? true,
      failedLoginCount: 0,
      lastLoginAt: null,
      lastLoginIp: null,
      createdAt: new Date('2026-08-11T00:00:00Z'),
      updatedAt: new Date('2026-08-11T00:00:00Z'),
      deletedAt: null,
      roleId: '22222222-2222-4222-8222-222222222222',
      role: {
        id: '22222222-2222-4222-8222-222222222222',
        code: 'super_admin',
        name: '超级管理员',
        isActive: true,
      },
    } as AdminUser;
    const repository = new InMemoryAdminRepository(admin);
    const auditEntries: AuditEntry[] = [];
    const audit = {
      record: async (entry: AuditEntry) => {
        auditEntries.push(entry);
      },
    } as AdminAuditService;
    const service = new AdminAuthService(
      repository as unknown as Repository<AdminUser>,
      passwordHasher,
      jwt,
      config,
      audit,
    );
    return { service, admin, repository, auditEntries };
  }

  it('returns an eight-hour scoped token and records a successful login', async () => {
    const { service, admin, repository, auditEntries } = await setup();

    const result = await service.login('superadmin', 'Right-Password', {
      ip: '127.0.0.1',
      userAgent: 'jest',
    });

    const payload = jwt.verify(result.token, {
      secret: 'test-admin-jwt-secret-with-enough-length',
    });
    expect(payload).toMatchObject({
      sub: admin.id,
      username: 'superadmin',
      role: 'super_admin',
      scope: 'admin',
    });
    expect(payload.exp - payload.iat).toBe(8 * 60 * 60);
    expect(result.admin).toEqual({
      id: admin.id,
      username: 'superadmin',
      displayName: '超级管理员',
      roleCode: 'super_admin',
    });
    expect(repository.saved).toHaveLength(1);
    expect(repository.saved[0].lastLoginIp).toBe('127.0.0.1');
    expect(repository.saved[0].lastLoginAt).toBeInstanceOf(Date);
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0]).toMatchObject({ action: 'ADMIN_LOGIN', success: true });
  });

  it('rejects a wrong password and records the failed login', async () => {
    const { service, repository, auditEntries } = await setup();

    await expect(
      service.login('superadmin', 'Wrong-Password', {
        ip: '10.0.0.8',
        userAgent: 'jest',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(repository.saved).toHaveLength(1);
    expect(repository.saved[0].failedLoginCount).toBe(1);
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0]).toMatchObject({
      action: 'ADMIN_LOGIN_FAILED',
      success: false,
      ipAddress: '10.0.0.8',
    });
  });

  it('rejects an inactive administrator even when the password is correct', async () => {
    const { service, auditEntries } = await setup({ active: false });

    await expect(
      service.login('superadmin', 'Right-Password', {
        ip: '127.0.0.1',
        userAgent: 'jest',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0].success).toBe(false);
  });
});
