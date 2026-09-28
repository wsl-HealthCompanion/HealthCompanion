import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

/**
 * 向量化服务 — Embedding Service
 * 模型: 通义千问 text-embedding-v3 (1536维)
 * 用途: 将文本转为向量, 用于 Milvus 相似检索
 *
 * 参考: 智能体架构与搭建指南 §8.4, MVP-SPEC §8.4
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('DASHSCOPE_API_KEY', '');
    this.baseUrl = 'https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding';
    // v3 不支持 1536 维，默认 v4 + dimension=1536（与 Milvus schema 对齐）
    this.model = this.configService.get<string>('EMBEDDING_MODEL', 'text-embedding-v4');
  }

  private readonly model: string;

  /**
   * 将文本向量化
   * @param text 输入文本
   * @returns 1536维向量
   */
  async embed(text: string): Promise<number[]> {
    try {
      const response = await axios.post(
        this.baseUrl,
        {
          model: 'text-embedding-v3',
          input: { texts: [text] },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 5000,
        },
      );

      const embedding = response.data?.output?.embeddings?.[0]?.embedding;
      if (!embedding || !Array.isArray(embedding)) {
        throw new Error('Invalid embedding response');
      }

      return embedding;
    } catch (error) {
      this.logger.error(`Embedding failed: ${error}`);

      // Task 4 安全降级：绝不返回零向量。
      // 零向量与任何文本同分，会在 Milvus 中产生随机检索结果，
      // 导致不可信的医学内容进入 LLM。抛错让上层进入无 RAG 降级路径。
      throw new Error(`Embedding failed: ${(error as Error)?.message || String(error)}`);
    }
  }

  /**
   * 批量向量化
   * @param texts 输入文本数组
   * @returns 向量数组
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    try {
      const response = await axios.post(
        this.baseUrl,
        {
          model: 'text-embedding-v3',
          input: { texts },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );

      return response.data?.output?.embeddings?.map((e: any) => e.embedding) || [];
    } catch (error) {
      this.logger.error(`Batch embedding failed: ${error}`);

      // Task 4 安全降级：批量失败同样抛错（禁止零向量随机检索）
      throw new Error(`Batch embedding failed: ${(error as Error)?.message || String(error)}`);
    }
  }
}
