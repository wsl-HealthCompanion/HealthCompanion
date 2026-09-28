import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface AvatarRuntimeSession {
  sessionId: string;
  avatarId: string;
}

export interface AvatarRuntimeState {
  online: boolean;
  testAvatarId: string | null;
  activeSessions: AvatarRuntimeSession[];
}

@Injectable()
export class AvatarRuntimeClient {
  private readonly client: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    this.client = axios.create({
      baseURL: config.get<string>('AVATAR_RUNTIME_URL') ?? 'http://127.0.0.1:8010',
      timeout: 10_000,
    });
  }

  async getState(): Promise<AvatarRuntimeState> {
    const response = await this.client.get('/api/avatar/internal/status', {
      headers: this.internalHeaders(),
    });
    return response.data.data as AvatarRuntimeState;
  }

  async deleteAssets(avatarId: string): Promise<{ trashPath: string }> {
    const response = await this.client.delete(
      `/api/avatar/internal/avatar/${encodeURIComponent(avatarId)}`,
      { headers: this.internalHeaders() },
    );
    return response.data.data as { trashPath: string };
  }

  async testRun(avatarId: string, model: 'wav2lip' | 'musetalk'): Promise<{ message: string }> {
    const response = await this.client.post(
      '/api/avatar/internal/test-run',
      { avatar_id: avatarId, model },
      { headers: this.internalHeaders(), timeout: 15_000 },
    );
    return response.data.data as { message: string };
  }

  async getPreview(avatarId: string): Promise<{ bytes: Buffer; contentType: string }> {
    const response = await this.client.get(
      `/api/avatar/internal/preview/${encodeURIComponent(avatarId)}`,
      { headers: this.internalHeaders(), responseType: 'arraybuffer' },
    );
    return {
      bytes: Buffer.from(response.data),
      contentType: String(response.headers['content-type'] ?? 'image/jpeg'),
    };
  }

  private internalHeaders(): Record<string, string> {
    const token = this.config.get<string>('AVATAR_INTERNAL_TOKEN');
    if (!token) throw new Error('AVATAR_INTERNAL_TOKEN is required');
    return { 'X-Avatar-Internal-Token': token };
  }
}
