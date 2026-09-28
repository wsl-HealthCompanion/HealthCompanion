import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { EntityManager, SelectQueryBuilder } from 'typeorm';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import { AdminPrincipal } from '../admin-auth/admin-auth.guard';
import { AdminRequestMeta } from '../admin-auth/admin-auth.service';
import { User } from '../auth/entities/user.entity';
import { UserStatus } from '../auth/entities/user.entity';
import {
  AdminUserListQueryDto,
  AdminUserListResult,
  AdminUserView,
  CreateAdminUserDto,
  UpdateAdminUserDto,
} from './admin-user.dto';

@Injectable()
export class AdminUserService {
  private readonly logger = new Logger(AdminUserService.name);

  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly audit: AdminAuditService,
  ) {}

  async listUsers(query: AdminUserListQueryDto): Promise<AdminUserListResult> {
    const page = Math.max(1, Number.isInteger(query.page) ? query.page! : 1);
    const requestedPageSize = Number.isInteger(query.pageSize) ? query.pageSize! : 20;
    const pageSize = Math.min(100, Math.max(1, requestedPageSize));
    const keyword = query.keyword?.trim().toLowerCase();

    const builder = this.users
      .createQueryBuilder('user')
      .where('user.deleted_at IS NULL');

    if (keyword) {
      builder.andWhere(
        "(LOWER(COALESCE(user.phone, '')) LIKE :keyword OR LOWER(CAST(user.id AS TEXT)) LIKE :keyword)",
        { keyword: `%${keyword}%` },
      );
    }
    if (query.status) {
      builder.andWhere('user.status = :status', { status: query.status });
    }

    const [records, total] = await builder
      .orderBy('user.created_at', 'DESC')
      .addOrderBy('user.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return {
      items: records.map((user) => this.toView(user)),
      total,
      page,
      pageSize,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    };
  }

  async getUser(userId: string): Promise<AdminUserView> {
    const user = await this.users
      .createQueryBuilder('user')
      .where('user.id = :userId', { userId })
      .andWhere('user.deleted_at IS NULL')
      .getOne();

    if (!user) {
      throw new NotFoundException(`用户 ${userId} 不存在`);
    }
    return this.toView(user);
  }

  async createUser(
    input: CreateAdminUserDto,
    admin: AdminPrincipal,
    meta: AdminRequestMeta,
  ): Promise<AdminUserView> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(User);
        const user = repository.create({
          phone: input.phone.trim(),
          openid: null,
          unionid: null,
          status: UserStatus.REGISTERED,
          is_elderly: input.isElderly ?? false,
          care_mode: input.careMode ?? false,
          last_login_at: null,
          deleted_at: null,
        });
        const saved = await repository.save(user);
        await this.audit.record(
          {
            adminUserId: admin.id,
            action: 'USER_CREATE',
            resourceType: 'user',
            resourceId: saved.id,
            afterData: this.editableSnapshot(saved),
            success: true,
            ipAddress: meta.ip,
            userAgent: meta.userAgent,
          },
          manager,
        );
        return this.toView(saved);
      });
    } catch (error) {
      const converted = this.convertPhoneConflict(error);
      await this.recordFailureSafely({
        adminUserId: admin.id,
        action: 'USER_CREATE',
        resourceType: 'user',
        afterData: this.mutationSummary(input),
        success: false,
        errorMessage: this.auditErrorMessage(converted, input.phone),
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
      throw converted;
    }
  }

  async updateUser(
    userId: string,
    input: UpdateAdminUserDto,
    admin: AdminPrincipal,
    meta: AdminRequestMeta,
  ): Promise<AdminUserView> {
    try {
      if (
        input.phone === undefined &&
        input.isElderly === undefined &&
        input.careMode === undefined
      ) {
        throw new BadRequestException('请至少提供一项需要修改的用户信息');
      }

      return await this.dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(User);
        const userQuery = repository
          .createQueryBuilder('user')
          .where('user.id = :userId', { userId })
          .andWhere('user.deleted_at IS NULL');
        const user = await this.withMutationLock(userQuery, manager).getOne();
        if (!user) throw new NotFoundException(`用户 ${userId} 不存在`);

        const beforeData = this.editableSnapshot(user);
        if (input.phone !== undefined) user.phone = input.phone.trim();
        if (input.isElderly !== undefined) user.is_elderly = input.isElderly;
        if (input.careMode !== undefined) user.care_mode = input.careMode;
        const saved = await repository.save(user);
        await this.audit.record(
          {
            adminUserId: admin.id,
            action: 'USER_UPDATE',
            resourceType: 'user',
            resourceId: saved.id,
            beforeData,
            afterData: this.editableSnapshot(saved),
            success: true,
            ipAddress: meta.ip,
            userAgent: meta.userAgent,
          },
          manager,
        );
        return this.toView(saved);
      });
    } catch (error) {
      const converted = this.convertPhoneConflict(error);
      await this.recordFailureSafely({
        adminUserId: admin.id,
        action: 'USER_UPDATE',
        resourceType: 'user',
        resourceId: userId,
        afterData: this.mutationSummary(input),
        success: false,
        errorMessage: this.auditErrorMessage(converted, input.phone),
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
      throw converted;
    }
  }

  async disableUser(
    userId: string,
    admin: AdminPrincipal,
    meta: AdminRequestMeta,
  ): Promise<AdminUserView> {
    return this.changeLifecycle(userId, 'disable', admin, meta);
  }

  async restoreUser(
    userId: string,
    admin: AdminPrincipal,
    meta: AdminRequestMeta,
  ): Promise<AdminUserView> {
    return this.changeLifecycle(userId, 'restore', admin, meta);
  }

  async deleteUser(
    userId: string,
    admin: AdminPrincipal,
    meta: AdminRequestMeta,
  ): Promise<void> {
    await this.changeLifecycle(userId, 'delete', admin, meta);
  }

  private async changeLifecycle(
    userId: string,
    operation: 'disable' | 'restore' | 'delete',
    admin: AdminPrincipal,
    meta: AdminRequestMeta,
  ): Promise<AdminUserView> {
    const action = {
      disable: 'USER_DISABLE',
      restore: 'USER_RESTORE',
      delete: 'USER_DELETE',
    }[operation];
    try {
      return await this.dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(User);
        const userQuery = repository
          .createQueryBuilder('user')
          .where('user.id = :userId', { userId })
          .andWhere('user.deleted_at IS NULL');
        const user = await this.withMutationLock(userQuery, manager).getOne();
        if (!user) throw new NotFoundException(`用户 ${userId} 不存在`);
        if (operation === 'disable' && user.disabled_at !== null) {
          throw new ConflictException('该用户已经处于停用状态');
        }
        if (operation === 'restore' && user.disabled_at === null) {
          throw new ConflictException('该用户当前未停用');
        }

        const beforeData = this.lifecycleSnapshot(user);
        const now = new Date();
        if (operation === 'restore') {
          user.disabled_at = null;
        } else {
          user.disabled_at = user.disabled_at ?? now;
        }
        if (operation === 'delete') user.deleted_at = now;
        user.auth_version = (user.auth_version ?? 0) + 1;
        const saved = await repository.save(user);

        await manager
          .createQueryBuilder()
          .update('refresh_tokens')
          .set({ revoked: true })
          .where('user_id = :userId AND revoked = :revoked', {
            userId,
            revoked: false,
          })
          .execute();
        if (operation === 'delete') {
          await manager
            .createQueryBuilder()
            .update('user_avatar_assignments')
            .set({ ended_at: now })
            .where('user_id = :userId AND ended_at IS NULL', { userId })
            .execute();
        }
        await this.audit.record(
          {
            adminUserId: admin.id,
            action,
            resourceType: 'user',
            resourceId: saved.id,
            beforeData,
            afterData: this.lifecycleSnapshot(saved),
            success: true,
            ipAddress: meta.ip,
            userAgent: meta.userAgent,
          },
          manager,
        );
        return this.toView(saved);
      });
    } catch (error) {
      await this.recordFailureSafely({
        adminUserId: admin.id,
        action,
        resourceType: 'user',
        resourceId: userId,
        afterData: { requestedAccountState: operation === 'restore' ? 'enabled' : operation === 'disable' ? 'disabled' : 'deleted' },
        success: false,
        errorMessage: this.errorMessage(error),
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
      throw error;
    }
  }

  private editableSnapshot(user: User): Record<string, unknown> {
    return {
      phone: user.phone,
      status: user.status,
      isElderly: user.is_elderly,
      careMode: user.care_mode,
    };
  }

  private withMutationLock(
    query: SelectQueryBuilder<User>,
    manager: EntityManager,
  ): SelectQueryBuilder<User> {
    return manager.connection.options.type === 'postgres'
      ? query.setLock('pessimistic_write')
      : query;
  }

  private lifecycleSnapshot(user: User): Record<string, unknown> {
    return {
      accountState: user.deleted_at ? 'deleted' : user.disabled_at ? 'disabled' : 'enabled',
      disabledAt: this.toIso(user.disabled_at),
      deletedAt: this.toIso(user.deleted_at),
    };
  }

  private mutationSummary(input: CreateAdminUserDto | UpdateAdminUserDto) {
    const summary: Record<string, unknown> = {};
    if (input.phone !== undefined) summary.phone = this.maskPhone(input.phone);
    if (input.isElderly !== undefined) summary.isElderly = input.isElderly;
    if (input.careMode !== undefined) summary.careMode = input.careMode;
    return summary;
  }

  private maskPhone(phone: string): string {
    const normalized = phone.trim();
    if (normalized.length < 7) return '****';
    return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
  }

  private convertPhoneConflict(error: unknown): unknown {
    return this.isPhoneUniqueViolation(error)
      ? new ConflictException('该手机号已存在')
      : error;
  }

  private isPhoneUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driver = error.driverError as {
      code?: string;
      constraint?: string;
      detail?: string;
      message?: string;
    };
    const context = [driver.constraint, driver.detail, driver.message, error.message]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const postgresPhoneConflict = driver.code === '23505' && context.includes('phone');
    const sqlitePhoneConflict =
      driver.code === 'SQLITE_CONSTRAINT' && context.includes('users.phone');
    return postgresPhoneConflict || sqlitePhoneConflict;
  }

  private async recordFailureSafely(
    entry: Parameters<AdminAuditService['record']>[0],
  ): Promise<void> {
    try {
      await this.audit.record(entry);
    } catch (error) {
      // Preserve the original user-operation error if failure auditing is unavailable.
      this.logger.error(
        `Failed to record audit entry for ${entry.action}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private auditErrorMessage(error: unknown, phone?: string): string {
    const message = this.errorMessage(error);
    if (!phone) return message;
    return message.split(phone).join(this.maskPhone(phone));
  }

  private toView(user: User): AdminUserView {
    return {
      id: user.id,
      phone: user.phone,
      status: user.status,
      isElderly: user.is_elderly,
      careMode: user.care_mode,
      accountState: user.disabled_at ? 'disabled' : 'enabled',
      disabledAt: this.toIso(user.disabled_at),
      createdAt: this.toIso(user.created_at)!,
      lastLoginAt: this.toIso(user.last_login_at),
    };
  }

  private toIso(value: Date | string | null | undefined): string | null {
    if (!value) return null;
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }
}
