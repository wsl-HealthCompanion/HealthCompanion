import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { RedisTTL } from '../../config/redis.config';
import { UserAvatarAssignmentService } from '../avatar-admin/user-avatar-assignment.service';
import { DigitalHumanMediaTicketService } from './digital-human-media-ticket.service';
import { DigitalHumanSessionRepository } from './digital-human-session.repository';
import {
  DigitalHumanSessionRecord,
  hashDigitalHumanSecret,
  matchesDigitalHumanSecret,
} from './digital-human.types';
import { LiveTalkingSessionClient } from './live-talking-session.client';

export interface CreatedDigitalHumanSession {
  sessionId: string;
  controlToken: string;
  streamUrl: string;
  expiresAt: string;
  mediaTicket: string;
}

@Injectable()
export class DigitalHumanSessionService {
  private readonly runtimeModel: string;

  constructor(
    private readonly sessions: DigitalHumanSessionRepository,
    private readonly runtime: LiveTalkingSessionClient,
    private readonly avatars: UserAvatarAssignmentService,
    private readonly tickets: DigitalHumanMediaTicketService,
    config: ConfigService,
  ) {
    this.runtimeModel = config.get<string>('DIGITAL_HUMAN_RUNTIME_MODEL') ?? 'wav2lip';
  }

  async createSession(userId: string, clientInstanceId: string): Promise<CreatedDigitalHumanSession> {
    const lockOwner = this.randomId();
    if (!await this.safe(() => this.sessions.acquireUserLock(userId, lockOwner, 35_000))) {
      throw new ServiceUnavailableException('数字人会话正在创建，请稍后重试');
    }
    let newSessionId: string | null = null;
    let activated = false;
    let lockLost = false;
    const renewTimer = setInterval(() => {
      void this.sessions.extendUserLock(userId, lockOwner, 35_000)
        .then((renewed) => { if (!renewed) lockLost = true; })
        .catch(() => { lockLost = true; });
    }, 10_000);
    renewTimer.unref();
    try {
      const revocationGeneration = await this.safe(
        () => this.sessions.getRevocationGeneration(userId),
      );
      const avatar = await this.avatars.resolveRunnableAvatar(userId, this.runtimeModel);
      newSessionId = this.randomId();
      const streamKey = this.randomId();
      const controlToken = this.randomId();
      const now = new Date().toISOString();
      const activeId = await this.safe(() => this.sessions.getActiveSessionId(userId));
      const active = activeId
        ? await this.safe(() => this.sessions.getSession(activeId))
        : null;
      const generation = (active?.generation ?? 0) + 1;
      const creating: DigitalHumanSessionRecord = {
        sessionId: newSessionId,
        userId,
        avatarId: avatar.avatarId,
        model: avatar.model,
        streamKey,
        controlTokenHash: hashDigitalHumanSecret(controlToken),
        clientInstanceHash: hashDigitalHumanSecret(clientInstanceId),
        generation,
        revocationGeneration,
        status: 'creating',
        createdAt: now,
        lastHeartbeatAt: now,
      };
      await this.safe(() => this.sessions.saveCreating(creating, RedisTTL.DH_SESSION));
      const runtimeResult = await this.runtime.create({
        sessionId: newSessionId,
        avatarId: avatar.avatarId,
        streamKey,
        model: avatar.model,
      });
      const runtimeInfo = runtimeResult?.data ?? runtimeResult;
      if (runtimeInfo?.ready !== true) {
        throw new ServiceUnavailableException(
          'Digital-human runtime did not confirm output readiness',
        );
      }
      if (lockLost) {
        throw new ServiceUnavailableException('数字人会话创建锁已失效，请重试');
      }
      const ready = { ...creating, status: 'ready' as const, lastHeartbeatAt: new Date().toISOString() };
      const activation = await this.safe(
        () => this.sessions.activate(ready, RedisTTL.DH_SESSION),
      );
      if (!activation.activated) {
        throw new ForbiddenException('Digital-human session creation was revoked');
      }
      activated = true;
      if (activation.previousSessionId && activation.previousSessionId !== newSessionId) {
        await this.stopAndRemove(activation.previousSessionId);
      }
      const mediaTicket = this.tickets.issue(
        { sessionId: newSessionId, streamKey, generation },
        RedisTTL.DH_SESSION,
      );
      return {
        sessionId: newSessionId,
        controlToken,
        streamUrl: `/live/dh_${streamKey}.flv`,
        expiresAt: new Date(Date.now() + RedisTTL.DH_SESSION * 1000).toISOString(),
        mediaTicket,
      };
    } catch (error) {
      if (newSessionId && !activated) {
        await this.stopAndRemove(newSessionId).catch(() => undefined);
      }
      throw error;
    } finally {
      clearInterval(renewTimer);
      await this.sessions.releaseUserLock(userId, lockOwner).catch(() => undefined);
    }
  }

  async speak(userId: string, sessionId: string, token: string, input: Record<string, unknown>) {
    await this.requireOwnedActive(userId, sessionId, token);
    return this.runtime.speak(sessionId, input);
  }

  async interrupt(userId: string, sessionId: string, token: string) {
    await this.requireOwnedActive(userId, sessionId, token);
    return this.runtime.interrupt(sessionId);
  }

  async subtitles(userId: string, sessionId: string, token: string, after: number) {
    await this.requireOwnedActive(userId, sessionId, token);
    return this.runtime.subtitles(sessionId, after);
  }

  async heartbeat(userId: string, sessionId: string, token: string): Promise<string> {
    await this.requireOwnedActive(userId, sessionId, token);
    if (!await this.safe(() => this.runtime.isReady(sessionId))) {
      await this.stopAndRemove(sessionId);
      throw new NotFoundException('Digital-human runtime session no longer exists');
    }
    const touched = await this.safe(() => this.sessions.touchActive(
      userId,
      sessionId,
      new Date().toISOString(),
      RedisTTL.DH_SESSION,
    ));
    if (!touched) throw new ForbiddenException('Digital-human session was replaced');
    return this.tickets.issue({
      sessionId: touched.sessionId,
      streamKey: touched.streamKey,
      generation: touched.generation,
    }, RedisTTL.DH_SESSION);
  }

  async close(userId: string, sessionId: string, token: string): Promise<void> {
    await this.requireOwned(userId, sessionId, token, false);
    await this.stopAndRemove(sessionId);
  }

  async revokeUserSessions(userId: string): Promise<void> {
    const sessionIds = await this.safe(
      () => this.sessions.revokeUser(userId, RedisTTL.DH_CLOSING),
    );
    await Promise.all(sessionIds.map((id) => this.stopAndRemove(id)));
  }

  async authorizeMedia(ticket: string, originalUri: string): Promise<void> {
    let payload: ReturnType<DigitalHumanMediaTicketService['verify']>;
    try { payload = this.tickets.verify(ticket); }
    catch { throw new ForbiddenException('媒体凭证无效'); }
    if (originalUri.split('?', 1)[0] !== `/live/dh_${payload.streamKey}.flv`) {
      throw new ForbiddenException('媒体地址不匹配');
    }
    const record = await this.safe(() => this.sessions.getSession(payload.sessionId));
    const active = record
      ? await this.safe(() => this.sessions.getActiveSessionId(record.userId))
      : null;
    if (!record || record.status !== 'ready' || record.streamKey !== payload.streamKey
      || record.generation !== payload.generation || active !== record.sessionId) {
      throw new ForbiddenException('媒体会话已失效');
    }
  }

  private async requireOwnedActive(userId: string, sessionId: string, token: string) {
    return this.requireOwned(userId, sessionId, token, true);
  }

  private async requireOwned(userId: string, sessionId: string, token: string, requireActive: boolean) {
    const session = await this.safe(() => this.sessions.getSession(sessionId));
    if (!session) throw new NotFoundException('数字人会话不存在');
    if (session.userId !== userId || !matchesDigitalHumanSecret(token, session.controlTokenHash)) {
      throw new ForbiddenException('无权访问该数字人会话');
    }
    if (requireActive) {
      const active = await this.safe(() => this.sessions.getActiveSessionId(userId));
      if (active !== sessionId || session.status !== 'ready') {
        throw new ForbiddenException('数字人会话已被替换');
      }
    }
    return session;
  }

  private async stopAndRemove(sessionId: string): Promise<void> {
    const closing = await this.safe(
      () => this.sessions.markClosing(sessionId, RedisTTL.DH_CLOSING),
    );
    try {
      await this.runtime.stop(sessionId);
    } catch {
      // The closing record remains indexed so the cleanup worker can retry.
      return;
    }
    if (closing) {
      await this.safe(() => this.sessions.remove(sessionId));
    } else {
      await this.sessions.remove(sessionId).catch(() => undefined);
    }
  }

  private async safe<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch (error) {
      if (error instanceof ForbiddenException || error instanceof NotFoundException
        || error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('数字人会话状态暂不可用', { cause: error });
    }
  }

  private randomId(): string {
    return randomBytes(32).toString('base64url');
  }
}
