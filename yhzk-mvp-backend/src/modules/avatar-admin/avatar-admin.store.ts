import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { AvatarModel } from './upload-ticket.service';
import { AvatarGenerationTask } from './entities/avatar-generation-task.entity';
import { DigitalHumanAvatar } from './entities/digital-human-avatar.entity';
import { UserAvatarAssignment } from './entities/user-avatar-assignment.entity';
import { evaluateAvatarDeletion } from './avatar-policy';

export interface AvatarTaskEvent {
  taskId: string;
  avatarId: string;
  model: AvatarModel;
  status: 'pending' | 'uploading' | 'running' | 'completed' | 'failed' | 'interrupted';
  progress: number;
  errorMessage: string | null;
  previewPath: string | null;
  sourceVideoPath: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
}

export interface AvatarDeletionSnapshot {
  avatar: DigitalHumanAvatar | null;
  assignedUserCount: number;
  activeTaskCount: number;
}

export interface ExistingAvatarImport {
  avatarId: string;
  model: AvatarModel;
  previewPath: string | null;
  sourceVideoPath: string | null;
}

export interface ExistingAvatarImportResult {
  importedAvatarCount: number;
  initializedUserCount: number;
  defaultAvatarId: string | null;
}

export type SetDefaultAvatarResult =
  | { outcome: 'not_found' }
  | { outcome: 'not_ready' }
  | { outcome: 'ready'; wasDefault: boolean; previousDefaultId: string | null };

@Injectable()
export class AvatarAdminStore {
  constructor(
    @InjectRepository(DigitalHumanAvatar)
    private readonly avatars: Repository<DigitalHumanAvatar>,
    @InjectRepository(AvatarGenerationTask)
    private readonly tasks: Repository<AvatarGenerationTask>,
    @InjectRepository(UserAvatarAssignment)
    private readonly assignments: Repository<UserAvatarAssignment>,
    private readonly dataSource: DataSource,
  ) {}

  findActiveAvatar(id: string): Promise<DigitalHumanAvatar | null> {
    return this.avatars.findOne({ where: { id, deletedAt: IsNull() } });
  }

  async reserveAvatar(input: {
    avatarId: string;
    model: AvatarModel;
    taskId: string;
    adminUserId: string;
  }): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(DigitalHumanAvatar).save({
        id: input.avatarId,
        model: input.model,
        status: 'uploading',
        previewPath: null,
        sourceVideoPath: null,
        isDefault: false,
        lastError: null,
        createdBy: input.adminUserId,
        deletedAt: null,
      });
      await manager.getRepository(AvatarGenerationTask).save({
        taskId: input.taskId,
        avatarId: input.avatarId,
        model: input.model,
        status: 'pending',
        progress: 0,
        errorMessage: null,
        createdBy: input.adminUserId,
        startedAt: null,
        endedAt: null,
      });
    });
  }

  async setDefaultReadyAvatar(id: string): Promise<SetDefaultAvatarResult> {
    return this.dataSource.transaction(async (manager) => {
      if (manager.connection.options.type === 'postgres') {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtext($1))',
          ['digital-human-avatar-default'],
        );
      }
      const targetQuery = manager.getRepository(DigitalHumanAvatar)
        .createQueryBuilder('avatar')
        .where('avatar.id = :id', { id })
        .andWhere('avatar.deleted_at IS NULL');
      const target = await (
        manager.connection.options.type === 'postgres'
          ? targetQuery.setLock('pessimistic_write')
          : targetQuery
      ).getOne();
      if (!target) return { outcome: 'not_found' };
      if (target.status !== 'ready') return { outcome: 'not_ready' };

      const previousDefault = await manager.getRepository(DigitalHumanAvatar).findOne({
        where: { isDefault: true, deletedAt: IsNull() },
      });
      const wasDefault = target.isDefault;
      await manager.getRepository(DigitalHumanAvatar).update(
        { isDefault: true, deletedAt: IsNull() },
        { isDefault: false },
      );
      await manager.getRepository(DigitalHumanAvatar).update(
        { id, deletedAt: IsNull() },
        { isDefault: true },
      );
      return {
        outcome: 'ready',
        wasDefault,
        previousDefaultId: previousDefault?.id ?? null,
      };
    });
  }

  async getDeletionSnapshot(id: string): Promise<AvatarDeletionSnapshot> {
    const [avatar, assignedUserCount, activeTaskCount] = await Promise.all([
      this.findActiveAvatar(id),
      this.assignments.count({ where: { avatarId: id, endedAt: IsNull() } }),
      this.tasks.count({
        where: {
          avatarId: id,
          status: In(['pending', 'uploading', 'running']),
        },
      }),
    ]);
    return { avatar, assignedUserCount, activeTaskCount };
  }

  async prepareDeletion(
    id: string,
    runtime: { testRunning: boolean; activeSessionCount: number },
  ): Promise<ReturnType<typeof evaluateAvatarDeletion> | null> {
    return this.dataSource.transaction(async (manager) => {
      const avatarQuery = manager.getRepository(DigitalHumanAvatar)
        .createQueryBuilder('avatar')
        .where('avatar.id = :id', { id })
        .andWhere('avatar.deleted_at IS NULL');
      const avatar = await (
        manager.connection.options.type === 'postgres'
          ? avatarQuery.setLock('pessimistic_write')
          : avatarQuery
      ).getOne();
      if (!avatar) return null;

      const [assignedUserCount, activeTaskCount] = await Promise.all([
        manager.getRepository(UserAvatarAssignment).count({
          where: { avatarId: id, endedAt: IsNull() },
        }),
        manager.getRepository(AvatarGenerationTask).count({
          where: {
            avatarId: id,
            status: In(['pending', 'uploading', 'running']),
          },
        }),
      ]);
      const result = evaluateAvatarDeletion({
        avatarId: id,
        status: avatar.status,
        isDefault: avatar.isDefault,
        assignedUserCount,
        activeTaskCount,
        testRunning: runtime.testRunning,
        activeSessionCount: runtime.activeSessionCount,
      });
      if (result.allowed) {
        avatar.status = 'deleting';
        avatar.lastError = null;
        await manager.getRepository(DigitalHumanAvatar).save(avatar);
      }
      return result;
    });
  }

  async markDeleteFailed(id: string, error: string): Promise<void> {
    await this.avatars.update(id, { status: 'delete_failed', lastError: error });
  }

  async softDeleteAvatar(id: string): Promise<void> {
    await this.avatars.update(id, { isDefault: false });
    await this.avatars.softDelete(id);
  }

  async listAvatars(): Promise<Array<DigitalHumanAvatar & { assignedUserCount: number }>> {
    const avatars = await this.avatars.find({
      where: { deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    return Promise.all(avatars.map(async (avatar) => Object.assign(avatar, {
      assignedUserCount: await this.assignments.count({
        where: { avatarId: avatar.id, endedAt: IsNull() },
      }),
    })));
  }

  listTasks(limit = 50): Promise<AvatarGenerationTask[]> {
    return this.tasks.find({ order: { createdAt: 'DESC' }, take: limit });
  }

  async applyTaskEvent(event: AvatarTaskEvent): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const taskRepository = manager.getRepository(AvatarGenerationTask);
      const avatarRepository = manager.getRepository(DigitalHumanAvatar);
      const task = await taskRepository.findOneBy({ taskId: event.taskId });
      if (!task || task.avatarId !== event.avatarId || task.model !== event.model) {
        throw new Error('task/avatar mismatch');
      }
      if (
        ['completed', 'failed', 'interrupted'].includes(task.status) &&
        task.endedAt &&
        (!event.endedAt || event.endedAt.getTime() <= task.endedAt.getTime())
      ) {
        return;
      }
      const avatarQuery = avatarRepository
        .createQueryBuilder('avatar')
        .where('avatar.id = :avatarId', { avatarId: event.avatarId })
        .andWhere('avatar.deleted_at IS NULL');
      const avatar = await (
        manager.connection.options.type === 'postgres'
          ? avatarQuery.setLock('pessimistic_write')
          : avatarQuery
      ).getOne();
      if (!avatar) throw new Error('avatar not found');

      task.status = event.status;
      task.progress = Math.min(Math.max(Math.trunc(event.progress), 0), 100);
      task.errorMessage = event.errorMessage;
      task.startedAt = event.startedAt ?? task.startedAt;
      task.endedAt = event.endedAt;

      if (avatar.status === 'deleting') {
        await taskRepository.save(task);
        return;
      }

      avatar.status = event.status === 'completed'
        ? 'ready'
        : event.status === 'failed'
          ? 'failed'
          : event.status === 'interrupted'
            ? 'interrupted'
            : event.status === 'running'
              ? 'generating'
              : 'uploading';
      avatar.previewPath = event.previewPath ?? avatar.previewPath;
      avatar.sourceVideoPath = event.sourceVideoPath ?? avatar.sourceVideoPath;
      avatar.lastError = event.errorMessage;

      await taskRepository.save(task);
      await avatarRepository.save(avatar);
    });
  }

  async importExistingAvatars(
    records: ExistingAvatarImport[],
    initializeUsers: boolean,
  ): Promise<ExistingAvatarImportResult> {
    return this.dataSource.transaction(async (manager) => {
      if (manager.connection.options.type === 'postgres') {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtext($1))',
          ['digital-human-avatar-default'],
        );
      }
      const avatarRepository = manager.getRepository(DigitalHumanAvatar);
      const assignmentRepository = manager.getRepository(UserAvatarAssignment);
      let importedAvatarCount = 0;

      for (const record of [...records].sort((left, right) => (
        left.avatarId.localeCompare(right.avatarId)
      ))) {
        const existingQuery = avatarRepository
          .createQueryBuilder('avatar')
          .withDeleted()
          .where('avatar.id = :avatarId', { avatarId: record.avatarId });
        const existing = await (
          manager.connection.options.type === 'postgres'
            ? existingQuery.setLock('pessimistic_write')
            : existingQuery
        ).getOne();
        if (existing?.deletedAt || existing?.status === 'deleting') continue;

        if (existing) {
          if (!existing.previewPath && record.previewPath) {
            existing.previewPath = record.previewPath;
          }
          if (!existing.sourceVideoPath && record.sourceVideoPath) {
            existing.sourceVideoPath = record.sourceVideoPath;
          }
          if (!['uploading', 'generating', 'deleting'].includes(existing.status)) {
            existing.status = 'ready';
            existing.lastError = null;
          }
          await avatarRepository.save(existing);
        } else {
          await avatarRepository.save({
            id: record.avatarId,
            model: record.model,
            status: 'ready',
            previewPath: record.previewPath,
            sourceVideoPath: record.sourceVideoPath,
            isDefault: false,
            lastError: null,
            createdBy: null,
            deletedAt: null,
          });
        }
        importedAvatarCount += 1;
      }

      let initializedUserCount = 0;
      if (initializeUsers) {
        const defaultAvatarQuery = avatarRepository
          .createQueryBuilder('avatar')
          .where('avatar.id = :avatarId', { avatarId: '1005' })
          .andWhere('avatar.deleted_at IS NULL');
        const defaultAvatar = await (
          manager.connection.options.type === 'postgres'
            ? defaultAvatarQuery.setLock('pessimistic_write')
            : defaultAvatarQuery
        ).getOne();
        if (!defaultAvatar) {
          throw new Error('avatar 1005 must exist before initializing users');
        }
        if (defaultAvatar.status !== 'ready') {
          throw new Error('avatar 1005 must be ready before initializing users');
        }

        await avatarRepository.update(
          { isDefault: true, deletedAt: IsNull() },
          { isDefault: false },
        );
        await avatarRepository.update(
          { id: '1005', deletedAt: IsNull() },
          { isDefault: true },
        );

        const activeUsers = await manager.query(
          manager.connection.options.type === 'postgres'
            ? 'SELECT id FROM users WHERE deleted_at IS NULL FOR UPDATE'
            : 'SELECT id FROM users WHERE deleted_at IS NULL',
        ) as Array<{ id: string }>;
        for (const user of activeUsers) {
          const currentAssignment = await assignmentRepository.findOne({
            where: { userId: user.id, endedAt: IsNull() },
          });
          if (currentAssignment) continue;
          await assignmentRepository.save({
            userId: user.id,
            avatarId: '1005',
            source: 'migration',
            assignedBy: null,
            endedAt: null,
          });
          initializedUserCount += 1;
        }
      }

      const currentDefault = await avatarRepository.findOne({
        where: { isDefault: true, deletedAt: IsNull() },
      });
      return {
        importedAvatarCount,
        initializedUserCount,
        defaultAvatarId: currentDefault?.id ?? null,
      };
    });
  }
}
