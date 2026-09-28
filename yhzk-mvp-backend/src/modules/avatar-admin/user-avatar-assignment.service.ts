import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  DataSource,
  EntityManager,
  IsNull,
  ObjectLiteral,
  SelectQueryBuilder,
} from 'typeorm';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import { AdminPrincipal } from '../admin-auth/admin-auth.guard';
import { AdminRequestMeta } from '../admin-auth/admin-auth.service';
import { User } from '../auth/entities/user.entity';
import { AssignUserAvatarDto } from './avatar-admin.dto';
import { DigitalHumanAvatar } from './entities/digital-human-avatar.entity';
import {
  AvatarAssignmentSource,
  UserAvatarAssignment,
} from './entities/user-avatar-assignment.entity';

export interface AdminUserAvatarView {
  userId: string;
  currentAvatar: {
    avatarId: string;
    model: DigitalHumanAvatar['model'];
    previewAvailable: boolean;
    source: AvatarAssignmentSource;
    assignedAt: string | null;
    isFallback: boolean;
  } | null;
}

export interface AdminUserAvatarMutationView extends AdminUserAvatarView {
  changed: boolean;
}

@Injectable()
export class UserAvatarAssignmentService {
  private readonly logger = new Logger(UserAvatarAssignmentService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AdminAuditService,
  ) {}

  async resolveRunnableAvatar(
    userId: string,
    runtimeModel: string,
  ): Promise<{ avatarId: string; model: string }> {
    const user = await this.dataSource.getRepository(User)
      .createQueryBuilder('user')
      .where('user.id = :userId', { userId })
      .andWhere('user.deleted_at IS NULL')
      .andWhere('user.disabled_at IS NULL')
      .getOne();
    if (!user) throw new NotFoundException(`用户 ${userId} 不存在或不可用`);

    const view = await this.resolveView(userId, this.dataSource.manager);
    if (!view.currentAvatar) {
      throw new UnprocessableEntityException('当前没有可运行的数字人形象');
    }
    const avatar = await this.dataSource.getRepository(DigitalHumanAvatar).findOne({
      where: {
        id: view.currentAvatar.avatarId,
        status: 'ready',
        deletedAt: IsNull(),
      },
    });
    if (!avatar) throw new UnprocessableEntityException('当前数字人形象未就绪');
    if (avatar.model !== runtimeModel) {
      throw new UnprocessableEntityException('当前数字人形象与运行模型不兼容');
    }
    return { avatarId: avatar.id, model: avatar.model };
  }

  async getUserAvatar(userId: string): Promise<AdminUserAvatarView> {
    const user = await this.dataSource.getRepository(User)
      .createQueryBuilder('user')
      .where('user.id = :userId', { userId })
      .andWhere('user.deleted_at IS NULL')
      .getOne();
    if (!user) throw new NotFoundException(`用户 ${userId} 不存在`);

    return this.resolveView(userId, this.dataSource.manager);
  }

  async assignUserAvatar(
    userId: string,
    input: AssignUserAvatarDto,
    admin: AdminPrincipal,
    meta: AdminRequestMeta,
  ): Promise<AdminUserAvatarMutationView> {
    const requestedAvatarId = input.avatarId;
    try {
      return await this.dataSource.transaction(async (manager) => {
        const avatarQuery = manager.getRepository(DigitalHumanAvatar)
          .createQueryBuilder('avatar')
          .where('avatar.id = :avatarId', { avatarId: requestedAvatarId })
          .andWhere('avatar.deleted_at IS NULL');
        const avatar = await this.withMutationLock(avatarQuery, manager).getOne();
        if (!avatar) {
          throw new NotFoundException(`数字人形象 ${requestedAvatarId} 不存在`);
        }
        if (avatar.status !== 'ready') {
          throw new UnprocessableEntityException('只能为用户分配已就绪的数字人形象');
        }

        const userQuery = manager.getRepository(User)
          .createQueryBuilder('user')
          .where('user.id = :userId', { userId })
          .andWhere('user.deleted_at IS NULL');
        const user = await this.withMutationLock(userQuery, manager).getOne();
        if (!user) throw new NotFoundException(`用户 ${userId} 不存在`);

        const assignmentQuery = manager.getRepository(UserAvatarAssignment)
          .createQueryBuilder('assignment')
          .where('assignment.user_id = :userId', { userId })
          .andWhere('assignment.ended_at IS NULL');
        const current = await this.withMutationLock(assignmentQuery, manager).getOne();

        if (current?.avatarId === requestedAvatarId) {
          await this.audit.record({
            adminUserId: admin.id,
            action: 'USER_AVATAR_ASSIGN',
            resourceType: 'user',
            resourceId: userId,
            beforeData: { avatarId: current.avatarId },
            afterData: {
              avatarId: current.avatarId,
              source: current.source,
              changed: false,
            },
            success: true,
            ipAddress: meta.ip,
            userAgent: meta.userAgent,
          }, manager);
          return {
            userId,
            currentAvatar: this.toAvatarView(avatar, current.source, current.assignedAt, false),
            changed: false,
          };
        }

        const now = new Date();
        if (current) {
          current.endedAt = now;
          await manager.getRepository(UserAvatarAssignment).save(current);
        }
        const next = await manager.getRepository(UserAvatarAssignment).save({
          userId,
          avatarId: requestedAvatarId,
          source: 'manual',
          assignedBy: admin.id,
          assignedAt: now,
          endedAt: null,
        });

        await this.audit.record({
          adminUserId: admin.id,
          action: 'USER_AVATAR_ASSIGN',
          resourceType: 'user',
          resourceId: userId,
          beforeData: { avatarId: current?.avatarId ?? null },
          afterData: {
            avatarId: requestedAvatarId,
            source: 'manual',
            changed: true,
          },
          success: true,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
        }, manager);

        return {
          userId,
          currentAvatar: this.toAvatarView(avatar, next.source, next.assignedAt, false),
          changed: true,
        };
      });
    } catch (error) {
      await this.recordFailureSafely({
        adminUserId: admin.id,
        action: 'USER_AVATAR_ASSIGN',
        resourceType: 'user',
        resourceId: userId,
        afterData: { requestedAvatarId },
        success: false,
        errorMessage: this.errorMessage(error),
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
      throw error;
    }
  }

  private async resolveView(
    userId: string,
    manager: EntityManager,
  ): Promise<AdminUserAvatarView> {
    const assignment = await manager.getRepository(UserAvatarAssignment).findOne({
      where: { userId, endedAt: IsNull() },
    });
    if (assignment) {
      const avatar = await manager.getRepository(DigitalHumanAvatar).findOne({
        where: { id: assignment.avatarId, deletedAt: IsNull() },
      });
      return {
        userId,
        currentAvatar: avatar
          ? this.toAvatarView(avatar, assignment.source, assignment.assignedAt, false)
          : null,
      };
    }

    const fallback = await manager.getRepository(DigitalHumanAvatar).findOne({
      where: { isDefault: true, status: 'ready', deletedAt: IsNull() },
    });
    return {
      userId,
      currentAvatar: fallback
        ? this.toAvatarView(fallback, 'default', null, true)
        : null,
    };
  }

  private toAvatarView(
    avatar: DigitalHumanAvatar,
    source: AvatarAssignmentSource,
    assignedAt: Date | null,
    isFallback: boolean,
  ): NonNullable<AdminUserAvatarView['currentAvatar']> {
    return {
      avatarId: avatar.id,
      model: avatar.model,
      previewAvailable: Boolean(avatar.previewPath),
      source,
      assignedAt: assignedAt?.toISOString() ?? null,
      isFallback,
    };
  }

  private withMutationLock<T extends ObjectLiteral>(
    query: SelectQueryBuilder<T>,
    manager: EntityManager,
  ): SelectQueryBuilder<T> {
    return manager.connection.options.type === 'postgres'
      ? query.setLock('pessimistic_write')
      : query;
  }

  private async recordFailureSafely(
    entry: Parameters<AdminAuditService['record']>[0],
  ): Promise<void> {
    try {
      await this.audit.record(entry);
    } catch (error) {
      this.logger.error(
        `Failed to record audit entry for ${entry.action}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
