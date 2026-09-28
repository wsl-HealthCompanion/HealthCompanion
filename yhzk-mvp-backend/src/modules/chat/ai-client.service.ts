import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosResponse } from 'axios';
import { Readable } from 'stream';

/**
 * AI 客户端服务
 * 负责调用 Python AI 服务 (ai-service)
 */
@Injectable()
export class AiClientService {
  private readonly logger = new Logger(AiClientService.name);
  private readonly baseUrl: string;
  private readonly backend: 'python' | 'legacy';

  constructor(private config: ConfigService) {
    this.baseUrl = this.config.get<string>('AI_SERVICE_URL', 'http://localhost:8000');
    this.backend = this.config.get<string>('AI_BACKEND', 'legacy') as 'python' | 'legacy';

    this.logger.log(`AI Backend: ${this.backend}`);
    this.logger.log(`AI Service URL: ${this.baseUrl}`);
  }

  /**
   * 检查 Python AI 服务是否健康
   */
  async isHealthy(): Promise<boolean> {
    if (this.backend !== 'python') {
      return false;
    }

    try {
      const response = await axios.get(`${this.baseUrl}/healthz`, {
        timeout: 2000
      });
      return response.data.status === 'ok';
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Python AI service unhealthy: ${errorMessage}`);
      return false;
    }
  }

  /**
   * 流式聊天 (SSE)
   * 调用 Python AI 服务的 /v1/chat/stream
   */
  async *streamChat(input: {
    user_message: string;
    user_context: any;
    conversation_history: any[];
    scene_mode: string;
    message_type?: string;
    downgrade_level?: string;
    recent_intents?: string[];
    recent_memories?: string[];
  }): AsyncGenerator<any, void, unknown> {
    try {
      const response: AxiosResponse<Readable> = await axios.post(
        `${this.baseUrl}/v1/chat/stream`,
        {
          user_message: input.user_message,
          user_context: input.user_context,
          conversation_history: input.conversation_history,
          scene_mode: input.scene_mode,
          message_type: input.message_type || 'text',
          downgrade_level: input.downgrade_level || 'none',
          recent_intents: input.recent_intents || [],
          recent_memories: input.recent_memories || [],
        },
        {
          responseType: 'stream',
          headers: {
            'Accept': 'text/event-stream',
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30s timeout
        }
      );


      let buffer = '';

      // 解析 SSE 流 (SSE 用 \n\n 分隔事件, 但 HTTP 可能用 \r\n)
      for await (const chunk of response.data) {
        const text = chunk.toString();
        // 统一换行符
        buffer += text.replace(/\r\n/g, '\n');
        const events = buffer.split('\n\n');
        buffer = events.pop() || ''; // 保留最后一个不完整的事件

        for (const event of events) {
          if (!event.trim()) continue;
          const subLines = event.split('\n');
          for (const subLine of subLines) {
            const trimmed = subLine.trim();
            if (!trimmed.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(trimmed.slice(6));
              this.logger.debug(`SSE event: ${data.type}`);
              yield data;
            } catch (e) {
              this.logger.warn(`Failed to parse SSE data: ${trimmed.substring(0, 200)}`);
            }
          }
        }
      }
      this.logger.log(`SSE stream ended, final buffer: "${buffer.substring(0, 100)}"`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Python AI stream failed: ${errorMessage}`);
      throw new Error(`AI service unavailable: ${errorMessage}`);
    }
  }

  /**
   * 非流式聊天 (用于测试/调试)
   */
  async chat(input: {
    user_message: string;
    user_context: any;
    conversation_history: any[];
    scene_mode: string;
  }): Promise<any> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/v1/chat`,
        input,
        { timeout: 10000 }
      );
      return response.data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Python AI chat failed: ${errorMessage}`);
      throw new Error(`AI service unavailable: ${errorMessage}`);
    }
  }
}
