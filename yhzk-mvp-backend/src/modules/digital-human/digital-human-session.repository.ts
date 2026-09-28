import { DigitalHumanSessionRecord } from './digital-human.types';

export interface DigitalHumanActivationResult {
  activated: boolean;
  previousSessionId: string | null;
}

export abstract class DigitalHumanSessionRepository {
  abstract acquireUserLock(userId: string, owner: string, ttlMs: number): Promise<boolean>;
  abstract extendUserLock(userId: string, owner: string, ttlMs: number): Promise<boolean>;
  abstract releaseUserLock(userId: string, owner: string): Promise<void>;
  abstract acquireCleanupLock(owner: string, ttlMs: number): Promise<boolean>;
  abstract releaseCleanupLock(owner: string): Promise<void>;
  abstract getActiveSessionId(userId: string): Promise<string | null>;
  abstract getSession(sessionId: string): Promise<DigitalHumanSessionRecord | null>;
  abstract getRevocationGeneration(userId: string): Promise<number>;
  abstract saveCreating(record: DigitalHumanSessionRecord, ttlSeconds: number): Promise<void>;
  abstract activate(
    record: DigitalHumanSessionRecord,
    ttlSeconds: number,
  ): Promise<DigitalHumanActivationResult>;
  abstract touchActive(
    userId: string,
    sessionId: string,
    now: string,
    ttlSeconds: number,
  ): Promise<DigitalHumanSessionRecord | null>;
  abstract listStale(heartbeatBeforeMs: number, limit: number): Promise<DigitalHumanSessionRecord[]>;
  abstract markClosing(sessionId: string, ttlSeconds: number): Promise<DigitalHumanSessionRecord | null>;
  abstract markClosingIfUnchanged(
    sessionId: string,
    expectedHeartbeat: string,
    ttlSeconds: number,
  ): Promise<DigitalHumanSessionRecord | null>;
  abstract revokeUser(userId: string, ttlSeconds: number): Promise<string[]>;
  abstract removeIfActive(userId: string, sessionId: string): Promise<boolean>;
  abstract remove(sessionId: string): Promise<void>;
}
