import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingService } from './embedding.service';
import { MilvusConfig } from '../../../config/milvus.config';

/**
 * RAG 检索服务 — RAG Service
 * Milvus 暂时不可用 — 所有方法返回空，等部署 Milvus 后启用
 */

export interface RagSearchOptions {
  collection: string;
  filter?: Record<string, any>;
  topK: number;
}

export interface RagDocument {
  text: string;
  score: number;
  metadata: Record<string, any>;
}

@Injectable()
export class RagService implements OnModuleInit {
  private readonly logger = new Logger(RagService.name);
  private readonly milvusConfig: MilvusConfig;

  constructor(
    private configService: ConfigService,
    private embeddingService: EmbeddingService,
  ) {
    this.milvusConfig = new MilvusConfig(configService);
  }

  async onModuleInit() {
    this.logger.warn('RAG disabled — Milvus not deployed, all searches return empty');
  }

  async search(
    query: string,
    options: RagSearchOptions,
  ): Promise<RagDocument[]> {
    return [];
  }

  async indexDocument(
    collection: string,
    doc: { id: string; text: string; metadata?: Record<string, any> },
  ): Promise<void> {
    this.logger.debug(`RAG index skipped (Milvus not deployed): ${doc.id}`);
  }
}
