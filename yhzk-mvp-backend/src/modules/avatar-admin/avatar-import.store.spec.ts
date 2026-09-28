import { DataSource } from 'typeorm';
import { AvatarAdminStore } from './avatar-admin.store';
import { AvatarGenerationTask } from './entities/avatar-generation-task.entity';
import { DigitalHumanAvatar } from './entities/digital-human-avatar.entity';
import { UserAvatarAssignment } from './entities/user-avatar-assignment.entity';

describe('AvatarAdminStore existing asset import', () => {
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
    await dataSource.query(`
      CREATE TABLE users (
        id varchar(36) PRIMARY KEY,
        deleted_at datetime NULL
      )
    `);
    store = new AvatarAdminStore(
      dataSource.getRepository(DigitalHumanAvatar),
      dataSource.getRepository(AvatarGenerationTask),
      dataSource.getRepository(UserAvatarAssignment),
      dataSource,
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('imports assets idempotently and assigns only active users without an assignment', async () => {
    await dataSource.query(
      'INSERT INTO users (id, deleted_at) VALUES (?, NULL), (?, NULL), (?, ?)',
      ['user-1', 'user-2', 'deleted-user', '2026-08-11 00:00:00'],
    );
    await dataSource.getRepository(DigitalHumanAvatar).save({
      id: '1006',
      model: 'wav2lip',
      status: 'ready',
      previewPath: 'keep-existing-preview.jpg',
      sourceVideoPath: null,
      isDefault: false,
      lastError: null,
      createdBy: null,
      deletedAt: null,
    });
    await dataSource.getRepository(UserAvatarAssignment).save({
      userId: 'user-2',
      avatarId: '1006',
      source: 'manual',
      assignedBy: null,
      endedAt: null,
    });

    const records = [
      {
        avatarId: '1005',
        model: 'wav2lip' as const,
        previewPath: 'data/avatar_previews/1005.jpg',
        sourceVideoPath: null,
      },
      {
        avatarId: '1006',
        model: 'musetalk' as const,
        previewPath: 'must-not-overwrite.jpg',
        sourceVideoPath: null,
      },
    ];

    await expect(store.importExistingAvatars(records, true)).resolves.toEqual({
      importedAvatarCount: 2,
      initializedUserCount: 1,
      defaultAvatarId: '1005',
    });
    await expect(store.importExistingAvatars(records, true)).resolves.toEqual({
      importedAvatarCount: 2,
      initializedUserCount: 0,
      defaultAvatarId: '1005',
    });

    await expect(store.findActiveAvatar('1005')).resolves.toMatchObject({ isDefault: true });
    await expect(store.findActiveAvatar('1006')).resolves.toMatchObject({
      model: 'wav2lip',
      previewPath: 'keep-existing-preview.jpg',
    });
    await expect(dataSource.getRepository(UserAvatarAssignment).find({
      where: { endedAt: null as never },
      order: { userId: 'ASC' },
    })).resolves.toMatchObject([
      { userId: 'user-1', avatarId: '1005', source: 'migration' },
      { userId: 'user-2', avatarId: '1006', source: 'manual' },
    ]);
  });

  it('rolls back the import when user initialization is requested without avatar 1005', async () => {
    await expect(store.importExistingAvatars([
      {
        avatarId: '1006',
        model: 'wav2lip',
        previewPath: 'data/avatar_previews/1006.jpg',
        sourceVideoPath: null,
      },
    ], true)).rejects.toThrow('1005');

    await expect(store.findActiveAvatar('1006')).resolves.toBeNull();
  });
});
