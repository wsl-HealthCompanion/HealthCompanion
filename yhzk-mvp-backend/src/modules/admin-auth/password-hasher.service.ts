import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const ENCODED_PART = /^[A-Za-z0-9_-]+$/;

@Injectable()
export class PasswordHasherService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
    return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;
  }

  async verify(password: string, encoded: string): Promise<boolean> {
    const [algorithm, saltPart, hashPart, extra] = encoded.split('$');
    if (
      algorithm !== 'scrypt' ||
      !saltPart ||
      !hashPart ||
      extra !== undefined ||
      !ENCODED_PART.test(saltPart) ||
      !ENCODED_PART.test(hashPart)
    ) {
      return false;
    }

    try {
      const salt = Buffer.from(saltPart, 'base64url');
      const expected = Buffer.from(hashPart, 'base64url');
      if (salt.length === 0 || expected.length !== KEY_LENGTH) {
        return false;
      }
      const actual = (await scrypt(password, salt, expected.length)) as Buffer;
      return timingSafeEqual(actual, expected);
    } catch {
      return false;
    }
  }
}
