import { DigitalHumanCleanupService } from './digital-human-cleanup.service';
import { DigitalHumanSessionRecord } from './digital-human.types';

// 测试辅助函数：构造一个过期的数字人会话记录
const stale = (sessionId: string): DigitalHumanSessionRecord => ({
  sessionId,
  userId: 'user-a',
  avatarId: '1001',
  model: 'wav2lip',
  streamKey: `${sessionId}-stream`,
  controlTokenHash: 'hash',
  clientInstanceHash: 'client-hash',
  generation: 1,
  revocationGeneration: 0,
  status: 'ready',
  createdAt: '2026-08-13T00:00:00.000Z',
  lastHeartbeatAt: '2026-08-13T00:00:00.000Z',
});

describe('DigitalHumanCleanupService race safety', () => {
  // 测试：如果会话在扫描后被有心跳更新，清理服务不会停止它
  // 模拟场景：cleanup 扫描发现 stale 会话，但调用 markClosingIfUnchanged 时发现心跳已更新，返回 null → 跳过停止
  it('does not stop a session whose heartbeat advanced after the stale scan', async () => {
    const candidate = stale('session-a');
    const sessions = {
      acquireCleanupLock: jest.fn().mockResolvedValue(true),
      listStale: jest.fn().mockResolvedValue([candidate]),
      markClosingIfUnchanged: jest.fn().mockResolvedValue(null), // 心跳已更新，标记关闭失败
      releaseCleanupLock: jest.fn().mockResolvedValue(undefined),
    };
    const runtime = { stop: jest.fn() };
    const cleanup = new DigitalHumanCleanupService(sessions as never, runtime as never);

    await cleanup.cleanup();

    // 验证：markClosingIfUnchanged 被调用，且 stop 没有被调用（因为标记关闭返回 null）
    expect(sessions.markClosingIfUnchanged).toHaveBeenCalledWith(
      'session-a',
      candidate.lastHeartbeatAt,
      24 * 3600,
    );
    expect(runtime.stop).not.toHaveBeenCalled();
  });

  // 测试：如果 runtime.stop() 失败，保留 closing 记录并继续处理下一个会话
  // 模拟场景：session-a 的 stop 失败（保留记录），session-b 的 stop 成功（移除记录）
  it('retains a closing record when runtime stop fails and continues the batch', async () => {
    const first = stale('session-a');
    const second = stale('session-b');
    const sessions = {
      acquireCleanupLock: jest.fn().mockResolvedValue(true),
      listStale: jest.fn().mockResolvedValue([first, second]),
      markClosingIfUnchanged: jest.fn()
        .mockResolvedValueOnce({ ...first, status: 'closing' })   // 第一个成功标记
        .mockResolvedValueOnce({ ...second, status: 'closing' }), // 第二个成功标记
      remove: jest.fn().mockResolvedValue(undefined),
      releaseCleanupLock: jest.fn().mockResolvedValue(undefined),
    };
    const runtime = {
      stop: jest.fn()
        .mockRejectedValueOnce(new Error('runtime unavailable')) // 第一个停止失败
        .mockResolvedValueOnce(undefined),                        // 第二个停止成功
    };
    const cleanup = new DigitalHumanCleanupService(sessions as never, runtime as never);

    await cleanup.cleanup();

    // 验证：两个会话都尝试调用了 stop
    expect(runtime.stop).toHaveBeenCalledTimes(2);
    // session-a 的 stop 失败了，所以没有被 remove
    expect(sessions.remove).not.toHaveBeenCalledWith('session-a');
    // session-b 的 stop 成功了，所以被 remove
    expect(sessions.remove).toHaveBeenCalledWith('session-b');
  });
});
