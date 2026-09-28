import { DataSource } from 'typeorm';
import { AvatarAdminStore, AvatarTaskEvent } from './avatar-admin.store';
import { AvatarGenerationTask } from './entities/avatar-generation-task.entity';
import { DigitalHumanAvatar } from './entities/digital-human-avatar.entity';
import { UserAvatarAssignment } from './entities/user-avatar-assignment.entity';

describe('AvatarAdminStore task events', () => {
  let dataSource: DataSource;
  let store: AvatarAdminStore;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      synchronize: true,
      dropSchema: true,
      entities: [DigitalHumanAvatar, AvatarGenerationTask, UserAvatarAssignment],
    });
    await dataSource.initialize();
    store = new AvatarAdminStore(
      dataSource.getRepository(DigitalHumanAvatar),
      dataSource.getRepository(AvatarGenerationTask),
      dataSource.getRepository(UserAvatarAssignment),
      dataSource,
    );
    await store.reserveAvatar({
      avatarId: '1009',
      model: 'wav2lip',
      taskId: '11111111-1111-4111-8111-111111111111',
      adminUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('atomically turns a completed media callback into a ready avatar and task', async () => {
    const event: AvatarTaskEvent = {
      taskId: '11111111-1111-4111-8111-111111111111',
      avatarId: '1009',
      model: 'wav2lip',
      status: 'completed',
      progress: 100,
      errorMessage: null,
      previewPath: 'data/avatar_previews/1009.jpg',
      sourceVideoPath: 'data/avatar_sources/1009/source.mp4',
      startedAt: new Date('2026-08-11T10:00:00Z'),
      endedAt: new Date('2026-08-11T10:02:00Z'),
    };

    await store.applyTaskEvent(event);

    await expect(store.findActiveAvatar('1009')).resolves.toMatchObject({
      status: 'ready',
      previewPath: 'data/avatar_previews/1009.jpg',
      sourceVideoPath: 'data/avatar_sources/1009/source.mp4',
      lastError: null,
    });
    await expect(
      dataSource.getRepository(AvatarGenerationTask).findOneByOrFail({ taskId: event.taskId }),
    ).resolves.toMatchObject({
      status: 'completed',
      progress: 100,
      endedAt: new Date('2026-08-11T10:02:00Z'),
    });
  });

  it('does not let a callback update a different reserved avatar', async () => {
    const event: AvatarTaskEvent = {
      taskId: '11111111-1111-4111-8111-111111111111',
      avatarId: 'other-avatar',
      model: 'wav2lip',
      status: 'running',
      progress: 20,
      errorMessage: null,
      previewPath: null,
      sourceVideoPath: null,
      startedAt: new Date('2026-08-11T10:00:00Z'),
      endedAt: null,
    };

    await expect(store.applyTaskEvent(event)).rejects.toThrow('task/avatar mismatch');
  });

  it('does not downgrade a completed task when an upload retry reports a stale failure', async () => {
    const completed: AvatarTaskEvent = {
      taskId: '11111111-1111-4111-8111-111111111111',
      avatarId: '1009',
      model: 'wav2lip',
      status: 'completed',
      progress: 100,
      errorMessage: null,
      previewPath: 'data/avatar_previews/1009.jpg',
      sourceVideoPath: 'data/avatar_sources/1009/source.mp4',
      startedAt: new Date('2026-08-11T10:00:00Z'),
      endedAt: new Date('2026-08-11T10:02:00Z'),
    };
    await store.applyTaskEvent(completed);

    await store.applyTaskEvent({
      ...completed,
      status: 'failed',
      progress: 0,
      errorMessage: 'avatar assets already exist',
      endedAt: null,
    });

    await expect(
      dataSource.getRepository(AvatarGenerationTask).findOneByOrFail({ taskId: completed.taskId }),
    ).resolves.toMatchObject({ status: 'completed', progress: 100, errorMessage: null });
    await expect(store.findActiveAvatar('1009')).resolves.toMatchObject({
      status: 'ready',
      lastError: null,
    });
  });
});
