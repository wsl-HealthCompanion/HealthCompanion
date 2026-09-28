import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import { AdminPrincipal } from '../admin-auth/admin-auth.guard';
import { AdminRequestMeta } from '../admin-auth/admin-auth.service';
import {
  AvatarAdminStore,
  AvatarTaskEvent,
  ExistingAvatarImport,
} from './avatar-admin.store';
import { evaluateAvatarDeletion } from './avatar-policy';
import { AvatarRuntimeClient, AvatarRuntimeState } from './avatar-runtime.client';
import { AvatarModel, UploadTicketService } from './upload-ticket.service';

const AVATAR_ID = /^[A-Za-z0-9_-]{1,64}$/;

@Injectable()
export class AvatarAdminService {
  constructor(
    private readonly store: AvatarAdminStore,
    private readonly uploadTickets: UploadTicketService,
    private readonly runtime: AvatarRuntimeClient,
    private readonly audit: AdminAuditService,
  ) {}

  async reserveAvatar(
    input: { avatarId: string; model: AvatarModel },
    admin: AdminPrincipal,
    meta: AdminRequestMeta,
  ): Promise<{ taskId: string; uploadToken: string }> {
    const avatarId = input.avatarId.trim();
    if (!AVATAR_ID.test(avatarId)) {
      throw new BadRequestException('形象编号只能包含字母、数字、下划线和短横线，长度1至64位');
    }
    if (await this.store.findActiveAvatar(avatarId)) {
      throw new ConflictException(`形象编号${avatarId}已经存在`);
    }
    const taskId = randomUUID();
    await this.store.reserveAvatar({
      avatarId,
      model: input.model,
      taskId,
      adminUserId: admin.id,
    });
    const uploadToken = this.uploadTickets.issue({ taskId, avatarId, model: input.model });
    await this.audit.record({
      adminUserId: admin.id,
      action: 'AVATAR_UPLOAD_RESERVED',
      resourceType: 'avatar',
      resourceId: avatarId,
      afterData: { taskId, model: input.model },
      success: true,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
    return { taskId, uploadToken };
  }

  async listAvatars() {
    const avatars = await this.store.listAvatars();
    let runtimeState: AvatarRuntimeState = {
      online: false,
      testAvatarId: null,
      activeSessions: [],
    };
    try {
      runtimeState = await this.runtime.getState();
    } catch {
      // Database browsing remains available while the media service is offline.
    }
    return {
      runtimeOnline: runtimeState.online,
      testAvatarId: runtimeState.testAvatarId,
      avatars: avatars.map((avatar) => ({
        ...avatar,
        testRunning: runtimeState.testAvatarId === avatar.id,
      })),
    };
  }

  listTasks() {
    return this.store.listTasks();
  }

  handleTaskEvent(event: AvatarTaskEvent): Promise<void> {
    return this.store.applyTaskEvent(event);
  }

  async importExistingAvatars(
    records: ExistingAvatarImport[],
    initializeUsers: boolean,
    meta: AdminRequestMeta,
  ) {
    const ids = new Set<string>();
    for (const record of records) {
      if (!AVATAR_ID.test(record.avatarId) || ids.has(record.avatarId)) {
        throw new BadRequestException('导入列表包含无效或重复的形象编号');
      }
      ids.add(record.avatarId);
    }

    try {
      const result = await this.store.importExistingAvatars(records, initializeUsers);
      await this.audit.record({
        adminUserId: null,
        action: 'AVATAR_LEGACY_IMPORT',
        resourceType: 'avatar',
        resourceId: initializeUsers ? '1005' : null,
        afterData: {
          avatarIds: records.map((record) => record.avatarId),
          initializeUsers,
          ...result,
        },
        success: true,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.audit.record({
        adminUserId: null,
        action: 'AVATAR_LEGACY_IMPORT',
        resourceType: 'avatar',
        resourceId: initializeUsers ? '1005' : null,
        beforeData: {
          avatarIds: records.map((record) => record.avatarId),
          initializeUsers,
        },
        success: false,
        errorMessage: message,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
      throw error;
    }
  }

  async getPreview(avatarId: string) {
    await this.requiredAvatar(avatarId);
    try {
      return await this.runtime.getPreview(avatarId);
    } catch {
      throw new ServiceUnavailableException('形象预览暂时不可用');
    }
  }

  async setDefaultAvatar(
    avatarId: string,
    admin: AdminPrincipal,
    meta: AdminRequestMeta,
  ): Promise<void> {
    const result = await this.store.setDefaultReadyAvatar(avatarId);
    if (result.outcome === 'not_found') {
      throw new NotFoundException(`形象${avatarId}不存在`);
    }
    if (result.outcome === 'not_ready') {
      throw new UnprocessableEntityException('只有可用状态的形象才能设为默认形象');
    }
    await this.audit.record({
      adminUserId: admin.id,
      action: 'AVATAR_SET_DEFAULT',
      resourceType: 'avatar',
      resourceId: avatarId,
      beforeData: {
        isDefault: result.wasDefault,
        previousDefaultId: result.previousDefaultId,
      },
      afterData: { isDefault: true },
      success: true,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  async deletionCheck(avatarId: string) {
    const [snapshot, runtimeState] = await Promise.all([
      this.store.getDeletionSnapshot(avatarId),
      this.safeRuntimeState(),
    ]);
    if (!snapshot.avatar) throw new NotFoundException(`形象${avatarId}不存在`);
    const activeSessionCount = runtimeState.activeSessions.filter(
      (session) => session.avatarId === avatarId,
    ).length;
    return evaluateAvatarDeletion({
      avatarId,
      status: snapshot.avatar.status,
      isDefault: snapshot.avatar.isDefault,
      assignedUserCount: snapshot.assignedUserCount,
      testRunning: runtimeState.testAvatarId === avatarId,
      activeTaskCount: snapshot.activeTaskCount,
      activeSessionCount,
    });
  }

  async testRunAvatar(
    avatarId: string,
    admin: AdminPrincipal,
    meta: AdminRequestMeta,
  ): Promise<{ message: string }> {
    const avatar = await this.requiredAvatar(avatarId);
    if (avatar.status !== 'ready') {
      throw new UnprocessableEntityException('只有可用状态的形象才能测试运行');
    }
    try {
      const result = await this.runtime.testRun(avatarId, avatar.model);
      await this.audit.record({
        adminUserId: admin.id,
        action: 'AVATAR_TEST_RUN',
        resourceType: 'avatar',
        resourceId: avatarId,
        success: true,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.audit.record({
        adminUserId: admin.id,
        action: 'AVATAR_TEST_RUN',
        resourceType: 'avatar',
        resourceId: avatarId,
        success: false,
        errorMessage: message,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
      throw new ServiceUnavailableException('数字人测试运行启动失败');
    }
  }

  async deleteAvatar(
    avatarId: string,
    confirmationId: string,
    admin: AdminPrincipal,
    meta: AdminRequestMeta,
  ): Promise<{ trashPath: string }> {
    if (confirmationId !== avatarId) {
      throw new BadRequestException('二次确认的形象编号不一致');
    }
    const runtimeState = await this.safeRuntimeState();
    const check = await this.store.prepareDeletion(avatarId, {
      testRunning: runtimeState.testAvatarId === avatarId,
      activeSessionCount: runtimeState.activeSessions.filter(
        (session) => session.avatarId === avatarId,
      ).length,
    });
    if (!check) throw new NotFoundException(`形象${avatarId}不存在`);
    if (!check.allowed) {
      throw new ConflictException({ message: '该形象正在使用，不能删除', blockers: check.blockers });
    }
    try {
      const result = await this.runtime.deleteAssets(avatarId);
      await this.store.softDeleteAvatar(avatarId);
      await this.audit.record({
        adminUserId: admin.id,
        action: 'AVATAR_DELETE',
        resourceType: 'avatar',
        resourceId: avatarId,
        afterData: { trashPath: result.trashPath },
        success: true,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.store.markDeleteFailed(avatarId, message);
      await this.audit.record({
        adminUserId: admin.id,
        action: 'AVATAR_DELETE',
        resourceType: 'avatar',
        resourceId: avatarId,
        success: false,
        errorMessage: message,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
      throw new ServiceUnavailableException('数字人文件移动失败，形象记录已保留');
    }
  }

  private async requiredAvatar(avatarId: string) {
    const avatar = await this.store.findActiveAvatar(avatarId);
    if (!avatar) throw new NotFoundException(`形象${avatarId}不存在`);
    return avatar;
  }

  private async safeRuntimeState(): Promise<AvatarRuntimeState> {
    try {
      return await this.runtime.getState();
    } catch {
      throw new ServiceUnavailableException('无法确认数字人运行状态，已禁止删除以保护数据');
    }
  }
}
