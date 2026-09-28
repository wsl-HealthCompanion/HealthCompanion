import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AdminAuditEntry, AdminAuditService } from '../admin-audit/admin-audit.service';
import { AdminPrincipal } from '../admin-auth/admin-auth.guard';
import { AvatarAdminService } from './avatar-admin.service';
import { AvatarAdminStore, AvatarDeletionSnapshot } from './avatar-admin.store';
import { AvatarRuntimeClient, AvatarRuntimeState } from './avatar-runtime.client';
import { DigitalHumanAvatar } from './entities/digital-human-avatar.entity';
import { UploadTicketService } from './upload-ticket.service';

const ADMIN: AdminPrincipal = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  username: 'root',
  roleCode: 'super_admin',
};

const META = { ip: '127.0.0.1', userAgent: 'jest' };

function avatar(id: string, overrides: Partial<DigitalHumanAvatar> = {}): DigitalHumanAvatar {
  return {
    id,
    model: 'wav2lip',
    status: 'ready',
    previewPath: `data/avatar_previews/${id}.jpg`,
    sourceVideoPath: null,
    isDefault: false,
    lastError: null,
    createdBy: ADMIN.id,
    createdAt: new Date('2026-08-11T00:00:00Z'),
    updatedAt: new Date('2026-08-11T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  } as DigitalHumanAvatar;
}

class FakeStore {
  avatars = new Map<string, DigitalHumanAvatar>();
  reservations: Array<{ avatarId: string; taskId: string }> = [];
  deleted: string[] = [];
  deleteFailures: Array<{ avatarId: string; error: string }> = [];
  snapshots = new Map<string, AvatarDeletionSnapshot>();
  imports: Array<{ records: unknown[]; initializeUsers: boolean }> = [];

  async findActiveAvatar(id: string) {
    return this.avatars.get(id) ?? null;
  }

  async reserveAvatar(input: {
    avatarId: string;
    model: 'wav2lip' | 'musetalk';
    taskId: string;
    adminUserId: string;
  }) {
    this.reservations.push({ avatarId: input.avatarId, taskId: input.taskId });
    this.avatars.set(input.avatarId, avatar(input.avatarId, {
      model: input.model,
      status: 'uploading',
    }));
  }

  async setDefaultAvatar(id: string) {
    for (const stored of this.avatars.values()) stored.isDefault = stored.id === id;
  }

  async getDeletionSnapshot(id: string) {
    return this.snapshots.get(id) ?? {
      avatar: this.avatars.get(id) ?? null,
      assignedUserCount: 0,
      activeTaskCount: 0,
    };
  }

  async markDeleting(id: string) {
    const stored = this.avatars.get(id);
    if (stored) stored.status = 'deleting';
  }

  async markDeleteFailed(id: string, error: string) {
    const stored = this.avatars.get(id);
    if (stored) stored.status = 'delete_failed';
    this.deleteFailures.push({ avatarId: id, error });
  }

  async softDeleteAvatar(id: string) {
    this.deleted.push(id);
    this.avatars.delete(id);
  }

  async listAvatars() {
    return Array.from(this.avatars.values()).map((stored) => Object.assign(stored, {
      assignedUserCount: this.snapshots.get(stored.id)?.assignedUserCount ?? 0,
    }));
  }

  async listTasks() {
    return [];
  }

  async importExistingAvatars(records: unknown[], initializeUsers: boolean) {
    this.imports.push({ records, initializeUsers });
    return {
      importedAvatarCount: records.length,
      initializedUserCount: initializeUsers ? 3 : 0,
      defaultAvatarId: initializeUsers ? '1005' : null,
    };
  }
}

class FakeRuntime {
  state: AvatarRuntimeState = {
    online: true,
    testAvatarId: null,
    activeSessions: [],
  };
  deleted: string[] = [];
  testRuns: Array<{ avatarId: string; model: string }> = [];
  deleteError: Error | null = null;

  async getState() {
    return this.state;
  }

  async deleteAssets(id: string) {
    if (this.deleteError) throw this.deleteError;
    this.deleted.push(id);
    return { trashPath: `data/avatar_trash/20260811_${id}` };
  }

  async testRun(id: string, model: string) {
    this.testRuns.push({ avatarId: id, model });
    return { message: `testing ${id}` };
  }
}

function setup() {
  const store = new FakeStore();
  const runtime = new FakeRuntime();
  const auditEntries: AdminAuditEntry[] = [];
  const audit = {
    record: async (entry: AdminAuditEntry) => {
      auditEntries.push(entry);
    },
  } as AdminAuditService;
  const tickets = new UploadTicketService(
    new ConfigService({ AVATAR_UPLOAD_TICKET_SECRET: 'service-test-secret' }),
  );
  const service = new AvatarAdminService(
    store as unknown as AvatarAdminStore,
    tickets,
    runtime as unknown as AvatarRuntimeClient,
    audit,
  );
  return { service, store, runtime, auditEntries, tickets };
}

describe('AvatarAdminService', () => {
  it('imports discovered media assets and records the system migration', async () => {
    const { service, store, auditEntries } = setup();
    const records = [{
      avatarId: '1005',
      model: 'wav2lip' as const,
      previewPath: 'data/avatar_previews/1005.jpg',
      sourceVideoPath: null,
    }];

    await expect(service.importExistingAvatars(records, true, META)).resolves.toEqual({
      importedAvatarCount: 1,
      initializedUserCount: 3,
      defaultAvatarId: '1005',
    });
    expect(store.imports).toEqual([{ records, initializeUsers: true }]);
    expect(auditEntries.at(-1)).toMatchObject({
      adminUserId: null,
      action: 'AVATAR_LEGACY_IMPORT',
      resourceType: 'avatar',
      success: true,
    });
  });

  it('reserves a unique avatar and issues a scoped upload ticket', async () => {
    const { service, store, tickets } = setup();

    const result = await service.reserveAvatar(
      { avatarId: 'new_1009', model: 'musetalk' },
      ADMIN,
      META,
    );

    expect(result.taskId).toMatch(/^[0-9a-f-]{36}$/);
    expect(store.reservations).toEqual([{ avatarId: 'new_1009', taskId: result.taskId }]);
    expect(tickets.verify(result.uploadToken)).toMatchObject({
      task_id: result.taskId,
      avatar_id: 'new_1009',
      model: 'musetalk',
      scope: 'avatar:upload',
    });
  });

  it('rejects a duplicate avatar ID before issuing an upload reservation', async () => {
    const { service, store } = setup();
    store.avatars.set('1005', avatar('1005'));

    await expect(
      service.reserveAvatar({ avatarId: '1005', model: 'wav2lip' }, ADMIN, META),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(store.reservations).toHaveLength(0);
  });

  it('only permits a ready avatar to become the default', async () => {
    const { service, store } = setup();
    store.avatars.set('failed-avatar', avatar('failed-avatar', { status: 'failed' }));

    await expect(
      service.setDefaultAvatar('failed-avatar', ADMIN, META),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(store.avatars.get('failed-avatar')?.isDefault).toBe(false);
  });

  it('test-runs only a ready avatar and records the administrator action', async () => {
    const { service, store, runtime, auditEntries } = setup();
    store.avatars.set('1007', avatar('1007'));

    await expect(service.testRunAvatar('1007', ADMIN, META)).resolves.toEqual({
      message: 'testing 1007',
    });
    expect(runtime.testRuns).toEqual([{ avatarId: '1007', model: 'wav2lip' }]);
    expect(auditEntries.at(-1)).toMatchObject({
      action: 'AVATAR_TEST_RUN',
      resourceId: '1007',
      success: true,
    });
  });

  it('lists database avatars even when the runtime service is offline', async () => {
    const { service, store, runtime } = setup();
    store.avatars.set('1005', avatar('1005', { isDefault: true }));
    runtime.getState = async () => {
      throw new Error('offline');
    };

    await expect(service.listAvatars()).resolves.toEqual({
      runtimeOnline: false,
      testAvatarId: null,
      avatars: [expect.objectContaining({
        id: '1005',
        isDefault: true,
        assignedUserCount: 0,
        testRunning: false,
      })],
    });
  });

  it('blocks deletion and returns every current usage reason', async () => {
    const { service, store, runtime } = setup();
    const current = avatar('1005', { isDefault: true });
    store.avatars.set('1005', current);
    store.snapshots.set('1005', {
      avatar: current,
      assignedUserCount: 14,
      activeTaskCount: 1,
    });
    runtime.state = {
      online: true,
      testAvatarId: '1005',
      activeSessions: [{ sessionId: 's1', avatarId: '1005' }],
    };

    await expect(service.deleteAvatar('1005', '1005', ADMIN, META)).rejects.toMatchObject({
      response: {
        blockers: expect.arrayContaining([
          expect.objectContaining({ code: 'DEFAULT_AVATAR' }),
          expect.objectContaining({ code: 'ASSIGNED_USERS', count: 14 }),
          expect.objectContaining({ code: 'ACTIVE_SESSION', count: 1 }),
        ]),
      },
    });
    expect(runtime.deleted).toHaveLength(0);
  });

  it('moves an unused avatar to trash and then soft deletes its record', async () => {
    const { service, store, runtime, auditEntries } = setup();
    store.avatars.set('1008', avatar('1008'));

    const result = await service.deleteAvatar('1008', '1008', ADMIN, META);

    expect(result).toEqual({ trashPath: 'data/avatar_trash/20260811_1008' });
    expect(runtime.deleted).toEqual(['1008']);
    expect(store.deleted).toEqual(['1008']);
    expect(auditEntries.at(-1)).toMatchObject({
      action: 'AVATAR_DELETE',
      resourceId: '1008',
      success: true,
    });
  });

  it('keeps a delete-failed record when the media service cannot move files', async () => {
    const { service, store, runtime, auditEntries } = setup();
    store.avatars.set('1008', avatar('1008'));
    runtime.deleteError = new Error('disk move failed');

    await expect(
      service.deleteAvatar('1008', '1008', ADMIN, META),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(store.deleteFailures).toEqual([{ avatarId: '1008', error: 'disk move failed' }]);
    expect(auditEntries.at(-1)).toMatchObject({
      action: 'AVATAR_DELETE',
      resourceId: '1008',
      success: false,
      errorMessage: 'disk move failed',
    });
  });
});
