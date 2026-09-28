import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Milvus 向量数据库配置
 * 用于 RAG 知识库检索 (user_knowledge / medical_knowledge 两个集合)
 *
 * SDK: @zilliz/milvus2-sdk-node
 * 版本: v2.3.4
 * 向量维度: 1536 (通义千问 text-embedding-v3)
 */
@Injectable()
export class MilvusConfig {
  public readonly host: string;
  public readonly port: number;
  public readonly address: string;

  constructor(private configService: ConfigService) {
    this.host = this.configService.get<string>('MILVUS_HOST', 'localhost');
    this.port = this.configService.get<number>('MILVUS_PORT', 19530);
    this.address = `${this.host}:${this.port}`;
  }

  /**
   * Milvus 集合定义
   */
  readonly collections = {
    USER_KNOWLEDGE: 'user_knowledge',       // L3 用户专属知识库
    MEDICAL_KNOWLEDGE: 'medical_knowledge', // L1 通用医学知识
  } as const;

  /**
   * 检索参数
   */
  readonly searchParams = {
    vectorDim: 1536,           // 向量维度
    indexType: 'IVF_FLAT',     // 索引类型
    metricType: 'L2',          // 距离度量
    nlist: 1024,               // IVF 聚类数
    defaultTopK: 5,            // 默认返回top-K
    searchRadius: 0.8,         // L2 搜索半径
  } as const;
}
