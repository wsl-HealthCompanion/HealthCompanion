import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

interface MediaTicketPayload {
  sessionId: string;
  streamKey: string;
  generation: number;
  exp: number;
}

@Injectable()
export class DigitalHumanMediaTicketService {
  private readonly secret: string;

  constructor(config: ConfigService) {
    this.secret = config.get<string>('DIGITAL_HUMAN_MEDIA_SECRET') ?? '';
    if (this.secret.length < 32) throw new Error('DIGITAL_HUMAN_MEDIA_SECRET must be at least 32 characters');
  }

  issue(input: Omit<MediaTicketPayload, 'exp'>, ttlSeconds: number): string {
    const payload: MediaTicketPayload = {
      ...input,
      exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encoded}.${this.sign(encoded)}`;
  }

  verify(ticket: string): MediaTicketPayload {
    const [encoded, signature, extra] = String(ticket).split('.');
    if (!encoded || !signature || extra) throw new Error('malformed media ticket');
    const expected = Buffer.from(this.sign(encoded), 'base64url');
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new Error('invalid media ticket signature');
    }
    let payload: MediaTicketPayload;
    try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); }
    catch { throw new Error('malformed media ticket payload'); }
    if (!payload || typeof payload.sessionId !== 'string' || typeof payload.streamKey !== 'string'
      || !Number.isInteger(payload.generation) || !Number.isInteger(payload.exp)) {
      throw new Error('invalid media ticket payload');
    }
    if (payload.exp <= Math.floor(Date.now() / 1000)) throw new Error('media ticket expired');
    return payload;
  }

  private sign(encoded: string): string {
    return createHmac('sha256', this.secret).update(encoded).digest('base64url');
  }
}
