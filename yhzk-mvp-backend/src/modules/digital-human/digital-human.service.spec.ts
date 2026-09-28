import { ConfigService } from '@nestjs/config';
import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { DigitalHumanSessionRepository } from './digital-human-session.repository';
import { DigitalHumanSessionRecord, hashDigitalHumanSecret } from './digital-human.types';
import { DigitalHumanSessionService } from './digital-human.service';

class MemoryRepository extends DigitalHumanSessionRepository {
  records = new Map<string, DigitalHumanSessionRecord>();
  active = new Map<string, string>();
  revocations = new Map<string, number>();
  failReads = false;
  events: string[] = [];
  async acquireUserLock() { return true; }
  async extendUserLock() { return true; }
  async releaseUserLock() {}
  async acquireCleanupLock() { return true; }
  async releaseCleanupLock() {}
  async getActiveSessionId(userId: string) {
    if (this.failReads) throw new Error('redis down');
    return this.active.get(userId) ?? null;
  }
  async getSession(sessionId: string) {
    if (this.failReads) throw new Error('redis down');
    return this.records.get(sessionId) ?? null;
  }
  async getRevocationGeneration(userId: string) { return this.revocations.get(userId) ?? 0; }
  async saveCreating(record: DigitalHumanSessionRecord) { this.records.set(record.sessionId, record); }
  async activate(record: DigitalHumanSessionRecord) {
    if (record.revocationGeneration !== (this.revocations.get(record.userId) ?? 0)
      || !this.records.has(record.sessionId)) {
      return { activated: false, previousSessionId: null };
    }
    const old = this.active.get(record.userId) ?? null;
    this.events.push(`activate:${record.sessionId}`);
    this.records.set(record.sessionId, record);
    this.active.set(record.userId, record.sessionId);
    return { activated: true, previousSessionId: old };
  }
  async touchActive(userId: string, sessionId: string, now: string) {
    const value = this.records.get(sessionId);
    if (!value || value.userId !== userId || value.status !== 'ready'
      || this.active.get(userId) !== sessionId) return null;
    const touched = { ...value, lastHeartbeatAt: now };
    this.records.set(sessionId, touched);
    return touched;
  }
  async listStale() { return []; }
  async markClosing(sessionId: string) {
    const value = this.records.get(sessionId);
    if (!value) return null;
    const closing = { ...value, status: 'closing' as const };
    this.records.set(sessionId, closing);
    if (this.active.get(value.userId) === sessionId) this.active.delete(value.userId);
    return closing;
  }
  async markClosingIfUnchanged(sessionId: string, expectedHeartbeat: string) {
    const value = this.records.get(sessionId);
    if (!value || value.lastHeartbeatAt !== expectedHeartbeat) return null;
    return this.markClosing(sessionId);
  }
  async revokeUser(userId: string) {
    this.revocations.set(userId, (this.revocations.get(userId) ?? 0) + 1);
    const ids = [...this.records.values()]
      .filter((value) => value.userId === userId && value.status !== 'closing')
      .map((value) => value.sessionId);
    for (const id of ids) await this.markClosing(id);
    return ids;
  }
  async removeIfActive(userId: string, sessionId: string) {
    if (this.active.get(userId) !== sessionId) return false;
    this.active.delete(userId);
    return true;
  }
  async remove(sessionId: string) { this.records.delete(sessionId); }
}

const record = (sessionId: string, userId: string, token: string): DigitalHumanSessionRecord => ({
  sessionId,
  userId,
  avatarId: '1001',
  model: 'wav2lip',
  streamKey: `${sessionId}stream`.padEnd(32, 'x'),
  controlTokenHash: hashDigitalHumanSecret(token),
  clientInstanceHash: hashDigitalHumanSecret('client-instance-0001'),
  generation: 1,
  revocationGeneration: 0,
  status: 'ready',
  createdAt: new Date().toISOString(),
  lastHeartbeatAt: new Date().toISOString(),
});

describe('DigitalHumanSessionService isolation', () => {
  let repository: MemoryRepository;
  let runtime: {
    create: jest.Mock;
    speak: jest.Mock;
    interrupt: jest.Mock;
    subtitles: jest.Mock;
    isReady: jest.Mock;
    stop: jest.Mock;
  };
  let service: DigitalHumanSessionService;

  beforeEach(() => {
    repository = new MemoryRepository();
    runtime = {
      create: jest.fn().mockResolvedValue({ data: { ready: true } }),
      speak: jest.fn().mockResolvedValue({}),
      interrupt: jest.fn().mockResolvedValue({}),
      subtitles: jest.fn().mockResolvedValue({ data: { events: [] } }),
      isReady: jest.fn().mockResolvedValue(true),
      stop: jest.fn().mockImplementation(async (sessionId) => {
        repository.events.push(`stop:${sessionId}`);
      }),
    };
    service = new DigitalHumanSessionService(
      repository,
      runtime as never,
      { resolveRunnableAvatar: jest.fn().mockResolvedValue({ avatarId: '1001', model: 'wav2lip' }) } as never,
      { issue: jest.fn().mockReturnValue('media-ticket'), verify: jest.fn() } as never,
      new ConfigService({ DIGITAL_HUMAN_RUNTIME_MODEL: 'wav2lip' }),
    );
  });

  it('keeps the old active session when LiveTalking create fails', async () => {
    repository.records.set('old', record('old', 'user-a', 'old-token'));
    repository.active.set('user-a', 'old');
    runtime.create.mockRejectedValueOnce(new Error('runtime failed'));

    await expect(service.createSession('user-a', 'client-instance-0001')).rejects.toThrow('runtime failed');

    expect(repository.active.get('user-a')).toBe('old');
    expect(runtime.stop).not.toHaveBeenCalledWith('old');
  });

  it('fails closed when LiveTalking does not confirm output readiness', async () => {
    runtime.create.mockResolvedValueOnce({ data: { ready: false } });

    await expect(service.createSession('user-a', 'client-instance-0001'))
      .rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(repository.active.has('user-a')).toBe(false);
    expect(runtime.stop).toHaveBeenCalledTimes(1);
  });

  it('activates the new session before stopping the old one', async () => {
    repository.records.set('old', record('old', 'user-a', 'old-token'));
    repository.active.set('user-a', 'old');

    const created = await service.createSession('user-a', 'client-instance-0001');

    expect(repository.events[0]).toBe(`activate:${created.sessionId}`);
    expect(repository.events[1]).toBe('stop:old');
  });

  it('rejects user A controlling user B session', async () => {
    repository.records.set('session-b', record('session-b', 'user-b', 'token-b'));
    repository.active.set('user-b', 'session-b');

    await expect(service.interrupt('user-a', 'session-b', 'token-b'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(runtime.interrupt).not.toHaveBeenCalled();
  });

  it('old delete stops only the old session and never the new active session', async () => {
    repository.records.set('old', record('old', 'user-a', 'old-token'));
    repository.records.set('new', record('new', 'user-a', 'new-token'));
    repository.active.set('user-a', 'new');

    await service.close('user-a', 'old', 'old-token');

    expect(repository.active.get('user-a')).toBe('new');
    expect(runtime.stop).toHaveBeenCalledWith('old');
    expect(runtime.stop).not.toHaveBeenCalledWith('new');
  });

  it('does not retry speak after an ambiguous network failure', async () => {
    repository.records.set('session-a', record('session-a', 'user-a', 'token-a'));
    repository.active.set('user-a', 'session-a');
    runtime.speak.mockRejectedValueOnce(new Error('socket closed'));

    await expect(service.speak('user-a', 'session-a', 'token-a', { text: 'hello' }))
      .rejects.toThrow('socket closed');
    expect(runtime.speak).toHaveBeenCalledTimes(1);
  });

  it('fails closed when Redis ownership lookup fails', async () => {
    repository.failReads = true;
    await expect(service.interrupt('user-a', 'session-a', 'token-a'))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(runtime.interrupt).not.toHaveBeenCalled();
  });

  it('cannot activate a slow create after logout or account revocation', async () => {
    let finishCreate!: (value: unknown) => void;
    runtime.create.mockReturnValueOnce(new Promise((resolve) => { finishCreate = resolve; }));

    const pending = service.createSession('user-a', 'client-instance-0001');
    while (![...repository.records.values()].some((value) => value.status === 'creating')) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    await service.revokeUserSessions('user-a');
    finishCreate({ data: { ready: true } });

    await expect(pending).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.active.has('user-a')).toBe(false);
  });

  it('keeps a closing tombstone when targeted runtime stop fails', async () => {
    repository.records.set('session-a', record('session-a', 'user-a', 'token-a'));
    repository.active.set('user-a', 'session-a');
    runtime.stop.mockRejectedValueOnce(new Error('runtime unavailable'));

    await service.close('user-a', 'session-a', 'token-a');

    expect(repository.records.get('session-a')?.status).toBe('closing');
    expect(repository.active.has('user-a')).toBe(false);
  });

  it('invalidates Redis ownership when LiveTalking no longer has the session', async () => {
    repository.records.set('session-a', record('session-a', 'user-a', 'token-a'));
    repository.active.set('user-a', 'session-a');
    runtime.isReady.mockResolvedValueOnce(false);

    await expect(service.heartbeat('user-a', 'session-a', 'token-a'))
      .rejects.toThrow('runtime session no longer exists');

    expect(repository.records.has('session-a')).toBe(false);
    expect(repository.active.has('user-a')).toBe(false);
  });
});
