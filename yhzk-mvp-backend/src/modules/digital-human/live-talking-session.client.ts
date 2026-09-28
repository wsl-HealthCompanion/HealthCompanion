/**
 * LiveTalking 会话客户端
 * 负责后端与 LiveTalking 服务之间的内部 HTTP 通信
 * 所有请求都带内部鉴权令牌，不暴露给前端
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, isAxiosError } from 'axios';

@Injectable()
export class LiveTalkingSessionClient {
  // 内部 HTTP 客户端，带基础地址、超时和鉴权头
  private readonly http: AxiosInstance;

  constructor(config: ConfigService) {
    // 内部令牌 — 用于后端之间的身份验证，必填
    const token = config.get<string>('DIGITAL_HUMAN_INTERNAL_TOKEN') ?? '';
    if (!token) throw new Error('DIGITAL_HUMAN_INTERNAL_TOKEN is required');

    // 创建 axios 实例，所有请求自动带上鉴权头
    this.http = axios.create({
      baseURL: config.get<string>('LIVE_TALKING_INTERNAL_URL') ?? 'http://127.0.0.1:8010',
      timeout: 30_000,
      headers: { 'X-Digital-Human-Internal-Token': token },
    });
  }

  // 创建数字人会话 — 分配形象、生成推流密钥
  async create(input: { sessionId: string; avatarId: string; streamKey: string; model: string }) {
    return (await this.http.post(
      '/api/internal/digital-human/sessions',
      input,
      { timeout: 120_000 }, // 创建可能需要较长时间，给 2 分钟
    )).data;
  }

  // 让数字人说一段话 — 传入文本，LiveTalking 会驱动嘴型并推流
  async speak(sessionId: string, input: Record<string, unknown>) {
    return (await this.http.post(`/api/internal/digital-human/sessions/${sessionId}/speak`, input)).data;
  }

  // 中断当前发言 — 打断数字人说话
  async interrupt(sessionId: string) {
    return (await this.http.post(`/api/internal/digital-human/sessions/${sessionId}/interrupt`)).data;
  }

  // 获取字幕 — 传 after 参数获取该时间点之后的新字幕
  async subtitles(sessionId: string, after: number) {
    return (await this.http.get(`/api/internal/digital-human/sessions/${sessionId}/subtitles`, { params: { after } })).data;
  }

  // 查询会话状态 — 是否 ready、是否存在
  async status(sessionId: string) {
    return (await this.http.get(`/api/internal/digital-human/sessions/${sessionId}`)).data;
  }

  // 检查会话是否处于 ready 状态 — 内部封装，返回布尔值
  async isReady(sessionId: string): Promise<boolean> {
    try {
      const response = await this.status(sessionId);
      const data = response?.data ?? response;
      return data?.ready === true;
    } catch (error) {
      // 404 表示会话不存在，视为 not ready，不抛出异常
      if (isAxiosError(error) && error.response?.status === 404) return false;
      throw error; // 其他错误继续抛出
    }
  }

  // 停止并销毁数字人会话 — 删除 LiveTalking 侧的会话资源
  async stop(sessionId: string) {
    try {
      return (await this.http.delete(`/api/internal/digital-human/sessions/${sessionId}`)).data;
    } catch (error) {
      // 如果会话已经被删除了，视为成功，不抛出异常
      if (isAxiosError(error) && error.response?.status === 404) {
        return { data: { sessionId, stopped: true, alreadyAbsent: true } };
      }
      throw error;
    }
  }
}
