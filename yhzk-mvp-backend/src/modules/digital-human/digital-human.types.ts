import { createHash, timingSafeEqual } from 'crypto';

export interface DigitalHumanSessionRecord {
  sessionId: string;
  userId: string;
  avatarId: string;
  model: string;
  streamKey: string;
  controlTokenHash: string;
  clientInstanceHash: string;
  generation: number;
  revocationGeneration: number;
  status: 'creating' | 'ready' | 'closing';
  createdAt: string;
  lastHeartbeatAt: string;
}

export function hashDigitalHumanSecret(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function matchesDigitalHumanSecret(value: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashDigitalHumanSecret(value), 'hex');
  const expected = Buffer.from(String(expectedHash), 'hex');
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
