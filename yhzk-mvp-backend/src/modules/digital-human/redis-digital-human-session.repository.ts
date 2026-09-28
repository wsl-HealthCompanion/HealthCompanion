import Redis from 'ioredis';
import { RedisKeys, RedisTTL } from '../../config/redis.config';
import {
  DigitalHumanActivationResult,
  DigitalHumanSessionRepository,
} from './digital-human-session.repository';
import { DigitalHumanSessionRecord } from './digital-human.types';

const COMPARE_DELETE = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0`;

const COMPARE_EXPIRE = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('pexpire', KEYS[1], ARGV[2])
end
return 0`;

export class RedisDigitalHumanSessionRepository extends DigitalHumanSessionRepository {
  constructor(private readonly redis: Redis) { super(); }

  async acquireUserLock(userId: string, owner: string, ttlMs: number): Promise<boolean> {
    return (await this.redis.set(RedisKeys.DH_USER_LOCK(userId), owner, 'PX', ttlMs, 'NX')) === 'OK';
  }

  async extendUserLock(userId: string, owner: string, ttlMs: number): Promise<boolean> {
    return Number(await this.redis.eval(
      COMPARE_EXPIRE, 1, RedisKeys.DH_USER_LOCK(userId), owner, String(ttlMs),
    )) === 1;
  }

  async releaseUserLock(userId: string, owner: string): Promise<void> {
    await this.redis.eval(COMPARE_DELETE, 1, RedisKeys.DH_USER_LOCK(userId), owner);
  }

  async acquireCleanupLock(owner: string, ttlMs: number): Promise<boolean> {
    return (await this.redis.set(RedisKeys.DH_CLEANUP_LOCK, owner, 'PX', ttlMs, 'NX')) === 'OK';
  }

  async releaseCleanupLock(owner: string): Promise<void> {
    await this.redis.eval(COMPARE_DELETE, 1, RedisKeys.DH_CLEANUP_LOCK, owner);
  }

  getActiveSessionId(userId: string): Promise<string | null> {
    return this.redis.get(RedisKeys.DH_ACTIVE_USER(userId));
  }

  async getSession(sessionId: string): Promise<DigitalHumanSessionRecord | null> {
    const raw = await this.redis.get(RedisKeys.DH_SESSION(sessionId));
    return raw ? JSON.parse(raw) as DigitalHumanSessionRecord : null;
  }

  async getRevocationGeneration(userId: string): Promise<number> {
    return Number(await this.redis.get(RedisKeys.DH_REVOCATION_GENERATION(userId)) ?? 0);
  }

  async saveCreating(record: DigitalHumanSessionRecord, ttlSeconds: number): Promise<void> {
    const recordTtlSeconds = Math.max(ttlSeconds, RedisTTL.DH_CLOSING);
    const script = `
redis.call('set', KEYS[1], ARGV[2], 'EX', ARGV[5])
redis.call('set', KEYS[2], ARGV[1], 'EX', ARGV[3])
redis.call('zadd', KEYS[3], ARGV[4], ARGV[1])
return 1`;
    await this.redis.eval(
      script,
      3,
      RedisKeys.DH_SESSION(record.sessionId),
      RedisKeys.DH_PENDING_USER(record.userId),
      RedisKeys.DH_HEARTBEATS,
      record.sessionId,
      JSON.stringify(record),
      String(ttlSeconds),
      String(Date.parse(record.lastHeartbeatAt)),
      String(recordTtlSeconds),
    );
  }

  async activate(
    record: DigitalHumanSessionRecord,
    ttlSeconds: number,
  ): Promise<DigitalHumanActivationResult> {
    const recordTtlSeconds = Math.max(ttlSeconds, RedisTTL.DH_CLOSING);
    const activeKey = RedisKeys.DH_ACTIVE_USER(record.userId);
    const script = `
local fence = tonumber(redis.call('get', KEYS[4]) or '0')
if fence ~= tonumber(ARGV[5]) or redis.call('get', KEYS[2]) ~= ARGV[1] then
  return {0, ''}
end
if not redis.call('get', KEYS[3]) then
  return {0, ''}
end
local previous = redis.call('get', KEYS[1]) or ''
redis.call('set', KEYS[1], ARGV[1], 'EX', ARGV[3])
redis.call('set', KEYS[3], ARGV[2], 'EX', ARGV[6])
redis.call('del', KEYS[2])
redis.call('zadd', KEYS[5], ARGV[4], ARGV[1])
return {1, previous}`;
    const result = await this.redis.eval(
      script,
      5,
      activeKey,
      RedisKeys.DH_PENDING_USER(record.userId),
      RedisKeys.DH_SESSION(record.sessionId),
      RedisKeys.DH_REVOCATION_GENERATION(record.userId),
      RedisKeys.DH_HEARTBEATS,
      record.sessionId,
      JSON.stringify(record),
      String(ttlSeconds),
      String(Date.parse(record.lastHeartbeatAt)),
      String(record.revocationGeneration),
      String(recordTtlSeconds),
    );
    const values = result as [number | string, string];
    return {
      activated: Number(values[0]) === 1,
      previousSessionId: values[1] || null,
    };
  }

  async touchActive(
    userId: string,
    sessionId: string,
    now: string,
    ttlSeconds: number,
  ): Promise<DigitalHumanSessionRecord | null> {
    const recordTtlSeconds = Math.max(ttlSeconds, RedisTTL.DH_CLOSING);
    const script = `
local raw = redis.call('get', KEYS[1])
if not raw or redis.call('get', KEYS[2]) ~= ARGV[1] then
  return nil
end
local record = cjson.decode(raw)
if record.userId ~= ARGV[2] or record.status ~= 'ready' then
  return nil
end
record.lastHeartbeatAt = ARGV[3]
local updated = cjson.encode(record)
redis.call('set', KEYS[1], updated, 'EX', ARGV[6])
redis.call('expire', KEYS[2], ARGV[4])
redis.call('zadd', KEYS[3], ARGV[5], ARGV[1])
return updated`;
    const raw = await this.redis.eval(
      script,
      3,
      RedisKeys.DH_SESSION(sessionId),
      RedisKeys.DH_ACTIVE_USER(userId),
      RedisKeys.DH_HEARTBEATS,
      sessionId,
      userId,
      now,
      String(ttlSeconds),
      String(Date.parse(now)),
      String(recordTtlSeconds),
    );
    return typeof raw === 'string' ? JSON.parse(raw) as DigitalHumanSessionRecord : null;
  }

  async listStale(heartbeatBeforeMs: number, limit: number): Promise<DigitalHumanSessionRecord[]> {
    const script = `
local result = {}
local ids = redis.call(
  'zrangebyscore', KEYS[1], '-inf', ARGV[1],
  'LIMIT', 0, tonumber(ARGV[2]) * 10
)
for _, id in ipairs(ids) do
  local raw = redis.call('get', ARGV[3] .. id)
  if raw then
    if #result < tonumber(ARGV[2]) then table.insert(result, raw) end
  else
    redis.call('zrem', KEYS[1], id)
  end
end
return result`;
    const values = await this.redis.eval(
      script,
      1,
      RedisKeys.DH_HEARTBEATS,
      String(heartbeatBeforeMs),
      String(limit),
      'dh:session:',
    );
    return (values as string[])
      .map((raw) => JSON.parse(raw) as DigitalHumanSessionRecord)
      .filter((record) => Date.parse(record.lastHeartbeatAt) <= heartbeatBeforeMs);
  }

  async markClosing(
    sessionId: string,
    ttlSeconds: number,
  ): Promise<DigitalHumanSessionRecord | null> {
    return this.markClosingWithScript(sessionId, null, ttlSeconds);
  }

  async markClosingIfUnchanged(
    sessionId: string,
    expectedHeartbeat: string,
    ttlSeconds: number,
  ): Promise<DigitalHumanSessionRecord | null> {
    return this.markClosingWithScript(sessionId, expectedHeartbeat, ttlSeconds);
  }

  private async markClosingWithScript(
    sessionId: string,
    expectedHeartbeat: string | null,
    ttlSeconds: number,
  ): Promise<DigitalHumanSessionRecord | null> {
    const script = `
local raw = redis.call('get', KEYS[1])
if not raw then
  redis.call('zrem', KEYS[2], ARGV[1])
  return nil
end
local record = cjson.decode(raw)
if ARGV[2] ~= '' and record.lastHeartbeatAt ~= ARGV[2] then
  return nil
end
record.status = 'closing'
local updated = cjson.encode(record)
local active = KEYS[3] .. record.userId
local pending = KEYS[4] .. record.userId
if redis.call('get', active) == ARGV[1] then redis.call('del', active) end
if redis.call('get', pending) == ARGV[1] then redis.call('del', pending) end
redis.call('set', KEYS[1], updated, 'EX', ARGV[3])
redis.call('zadd', KEYS[2], 0, ARGV[1])
return updated`;
    const raw = await this.redis.eval(
      script,
      4,
      RedisKeys.DH_SESSION(sessionId),
      RedisKeys.DH_HEARTBEATS,
      'dh:active:user:',
      'dh:pending:user:',
      sessionId,
      expectedHeartbeat ?? '',
      String(ttlSeconds),
    );
    return typeof raw === 'string' ? JSON.parse(raw) as DigitalHumanSessionRecord : null;
  }

  async revokeUser(userId: string, ttlSeconds: number): Promise<string[]> {
    const script = `
redis.call('incr', KEYS[1])
redis.call('expire', KEYS[1], ARGV[2])
local ids = {}
local seen = {}
for index = 2, 3 do
  local id = redis.call('get', KEYS[index])
  redis.call('del', KEYS[index])
  if id and not seen[id] then
    seen[id] = true
    table.insert(ids, id)
    local recordKey = ARGV[1] .. id
    local raw = redis.call('get', recordKey)
    if raw then
      local record = cjson.decode(raw)
      record.status = 'closing'
      redis.call('set', recordKey, cjson.encode(record), 'EX', ARGV[2])
      redis.call('zadd', KEYS[4], 0, id)
    end
  end
end
return ids`;
    const values = await this.redis.eval(
      script,
      4,
      RedisKeys.DH_REVOCATION_GENERATION(userId),
      RedisKeys.DH_ACTIVE_USER(userId),
      RedisKeys.DH_PENDING_USER(userId),
      RedisKeys.DH_HEARTBEATS,
      'dh:session:',
      String(ttlSeconds),
    );
    return (values as string[]).map(String);
  }

  async removeIfActive(userId: string, sessionId: string): Promise<boolean> {
    return Number(await this.redis.eval(
      COMPARE_DELETE, 1, RedisKeys.DH_ACTIVE_USER(userId), sessionId,
    )) === 1;
  }

  async remove(sessionId: string): Promise<void> {
    await this.redis.del(RedisKeys.DH_SESSION(sessionId));
    await this.redis.zrem(RedisKeys.DH_HEARTBEATS, sessionId);
  }
}
