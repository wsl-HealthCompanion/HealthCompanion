import { RedisDigitalHumanSessionRepository } from './redis-digital-human-session.repository';

describe('RedisDigitalHumanSessionRepository atomic contracts', () => {
  it('touches only through one active-pointer-checked Lua operation', async () => {
    const redis = {
      eval: jest.fn().mockResolvedValue(null),
      get: jest.fn(),
      set: jest.fn(),
    };
    const repository = new RedisDigitalHumanSessionRepository(redis as never);

    await expect(repository.touchActive(
      'user-a',
      'session-a',
      '2026-08-13T00:00:30.000Z',
      180,
    )).resolves.toBeNull();

    const script = redis.eval.mock.calls[0][0] as string;
    expect(script).toContain("redis.call('get', KEYS[2]) ~= ARGV[1]");
    expect(script).toContain("record.status ~= 'ready'");
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('removes expired heartbeat ghosts inside the stale-list Lua scan', async () => {
    const redis = { eval: jest.fn().mockResolvedValue([]) };
    const repository = new RedisDigitalHumanSessionRepository(redis as never);

    await repository.listStale(Date.now(), 20);

    const script = redis.eval.mock.calls[0][0] as string;
    expect(script).toContain("redis.call('zrem', KEYS[1], id)");
    expect(script).toContain('tonumber(ARGV[2]) * 10');
  });

  it('increments the revocation fence and deactivates active and pending pointers atomically', async () => {
    const redis = { eval: jest.fn().mockResolvedValue(['active', 'pending']) };
    const repository = new RedisDigitalHumanSessionRepository(redis as never);

    await expect(repository.revokeUser('user-a', 86400))
      .resolves.toEqual(['active', 'pending']);

    const script = redis.eval.mock.calls[0][0] as string;
    expect(script).toContain("redis.call('incr', KEYS[1])");
    expect(script).toContain('for index = 2, 3 do');
    expect(script).toContain("record.status = 'closing'");
  });
});
