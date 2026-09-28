import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * AI Agent 注册表配置
 * MVP 阶段仅启用 ①调度 和 ④知识库问答 两个智能体
 * Phase 2 通过翻转 enabled 标志扩展至 6 个智能体
 *
 * 参考: 智能体架构与搭建指南 §0.3 agentRegistry 配置模式
 */

export interface AgentConfig {
  enabled: boolean;
  model: string;
  timeout: number;         // 超时(ms)
  temperature?: number;
  maxTokens?: number;
}

export interface AgentRegistry {
  version: string;
  agents: Record<string, AgentConfig>;
}

@Injectable()
export class AgentsConfig {
  public readonly deepseekApiKey: string;
  public readonly dashscopeApiKey: string;
  public readonly deepseekBaseUrl: string;
  public readonly openaiBaseUrl: string; // 通用 OpenAI 兼容 endpoint

  constructor(private configService: ConfigService) {
    this.deepseekApiKey = this.configService.get<string>('DEEPSEEK_API_KEY', '');
    this.dashscopeApiKey = this.configService.get<string>('DASHSCOPE_API_KEY', '');
    this.deepseekBaseUrl = 'https://api.deepseek.com/v1';
    this.openaiBaseUrl = 'https://api.deepseek.com/v1';
  }

  /**
   * Agent 注册表
   * MVP: orchestrator + knowledge_qa
   * Phase 2: 全部 6 个 agent enabled
   */
  getRegistry(): AgentRegistry {
    return {
      version: 'mvp-1.0',
      agents: {
        orchestrator: {
          enabled: true,
          model: 'deepseek-chat',         // DeepSeek-V3
          timeout: 3000,                   // 意图识别 3s
          temperature: 0.3,
          maxTokens: 1024,
        },
        knowledge_qa: {
          enabled: true,
          model: 'deepseek-reasoner',      // DeepSeek-R1
          timeout: 5000,                   // RAG 问答 5s
          temperature: 0.3,
          maxTokens: 1024,
        },
        // Phase 2 扩展
        data_organizer: {
          enabled: false,
          model: 'qwen-turbo',
          timeout: 5000,
        },
        vitals_monitor: {
          enabled: false,
          model: 'rule-engine',
          timeout: 100,
        },
        rehab_fitness: {
          enabled: false,
          model: 'qwen-plus',
          timeout: 8000,
        },
        llm_analyzer: {
          enabled: false,
          model: 'deepseek-reasoner',
          timeout: 30000,                  // 异步分析最长 30s
        },
      },
    };
  }

  /**
   * 检查指定 agent 是否启用
   */
  isAgentEnabled(agentName: string): boolean {
    const registry = this.getRegistry();
    return registry.agents[agentName]?.enabled ?? false;
  }

  /**
   * 获取启用的 agent 列表
   */
  getEnabledAgents(): string[] {
    const registry = this.getRegistry();
    return Object.entries(registry.agents)
      .filter(([_, config]) => config.enabled)
      .map(([name]) => name);
  }
}
