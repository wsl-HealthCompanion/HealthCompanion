import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { PasswordHasherService } from './password-hasher.service';
import { AdminRole } from './entities/admin-role.entity';
import { AdminUser } from './entities/admin-user.entity';

class MemoryRepository<T extends { id?: string }> {
  rows: T[] = [];

  async findOne(options: { where: Partial<T> }): Promise<T | null> {
    return this.rows.find((row) =>
      Object.entries(options.where).every(([key, value]) => row[key as keyof T] === value),
    ) ?? null;
  }

  async count(): Promise<number> {
    return this.rows.length;
  }

  create(value: Partial<T>): T {
    return value as T;
  }

  async save(value: T): Promise<T> {
    if (!value.id) value.id = `generated-${this.rows.length + 1}`;
    if (!this.rows.includes(value)) this.rows.push(value);
    return value;
  }
}

describe('AdminBootstrapService', () => {
  it('creates the super administrator once when the database is empty', async () => {
    const roles = new MemoryRepository<AdminRole>();
    const users = new MemoryRepository<AdminUser>();
    const hasher = new PasswordHasherService();
    const service = new AdminBootstrapService(
      roles as unknown as Repository<AdminRole>,
      users as unknown as Repository<AdminUser>,
      hasher,
      new ConfigService({
        ADMIN_INITIAL_USERNAME: 'RootAdmin',
        ADMIN_INITIAL_PASSWORD: 'Initial-Password-123',
      }),
    );

    await service.onModuleInit();
    await service.onModuleInit();

    expect(roles.rows).toHaveLength(1);
    expect(roles.rows[0]).toMatchObject({
      code: 'super_admin',
      name: '超级管理员',
      isActive: true,
    });
    expect(users.rows).toHaveLength(1);
    expect(users.rows[0].username).toBe('rootadmin');
    await expect(
      hasher.verify('Initial-Password-123', users.rows[0].passwordHash),
    ).resolves.toBe(true);
  });

  it('does not create an administrator when bootstrap credentials are absent', async () => {
    const roles = new MemoryRepository<AdminRole>();
    const users = new MemoryRepository<AdminUser>();
    const service = new AdminBootstrapService(
      roles as unknown as Repository<AdminRole>,
      users as unknown as Repository<AdminUser>,
      new PasswordHasherService(),
      new ConfigService({}),
    );

    await service.onModuleInit();

    expect(roles.rows).toHaveLength(1);
    expect(users.rows).toHaveLength(0);
  });
});
