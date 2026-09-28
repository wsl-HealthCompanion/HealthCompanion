import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

export type AvatarModel = 'wav2lip' | 'musetalk';

export interface UploadTicketInput {
  taskId: string;
  avatarId: string;
  model: AvatarModel;
}

export interface UploadTicketPayload {
  scope: 'avatar:upload';
  task_id: string;
  avatar_id: string;
  model: AvatarModel;
  exp: number;
}

@Injectable()
export class UploadTicketService {
  constructor(private readonly config: ConfigService) {}

  issue(input: UploadTicketInput, now = new Date()): string {
    const payload: UploadTicketPayload = {
      scope: 'avatar:upload',
      task_id: input.taskId,
      avatar_id: input.avatarId,
      model: input.model,
      exp: Math.floor(now.getTime() / 1000) + 5 * 60,
    };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${encoded}.${this.sign(encoded)}`;
  }

  verify(token: string, now = new Date()): UploadTicketPayload {
    const parts = token.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error('invalid upload ticket');
    }
    const expected = Buffer.from(this.sign(parts[0]), 'base64url');
    const received = Buffer.from(parts[1], 'base64url');
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw new Error('invalid upload ticket signature');
    }

    let payload: Partial<UploadTicketPayload>;
    try {
      payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as Partial<UploadTicketPayload>;
    } catch {
      throw new Error('invalid upload ticket payload');
    }
    if (
      payload.scope !== 'avatar:upload' ||
      typeof payload.task_id !== 'string' ||
      typeof payload.avatar_id !== 'string' ||
      (payload.model !== 'wav2lip' && payload.model !== 'musetalk') ||
      typeof payload.exp !== 'number' ||
      !Number.isInteger(payload.exp)
    ) {
      throw new Error('invalid upload ticket payload');
    }
    if (payload.exp <= Math.floor(now.getTime() / 1000)) {
      throw new Error('upload ticket expired');
    }
    return payload as UploadTicketPayload;
  }

  private sign(encodedPayload: string): string {
    const secret = this.config.get<string>('AVATAR_UPLOAD_TICKET_SECRET');
    if (!secret) throw new Error('AVATAR_UPLOAD_TICKET_SECRET is required');
    return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  }
}
