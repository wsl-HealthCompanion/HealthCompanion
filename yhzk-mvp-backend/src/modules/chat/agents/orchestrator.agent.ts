import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AgentInput, AgentOutput, IAgent } from './agent.interface';
import { AgentsConfig } from '../../../config/agents.config';

/**
 * ①调度智能体 — Orchestrator Agent
 * 模型: DeepSeek-V3 (deepseek-chat)
 * 职责: 意图识别 + 路由分发
 * MVP路由: health_question → knowledge_qa / general_chat → 直接回复 / emergency → 应急
 *
 * 参考: 智能体架构与搭建指南 §2, MVP-SPEC §8.2
 */
@Injectable()
export class OrchestratorAgent implements IAgent {
  readonly name = 'orchestrator';
  private readonly logger = new Logger(OrchestratorAgent.name);
  private client: OpenAI;

  constructor(
    private configService: ConfigService,
    private agentsConfig: AgentsConfig,
  ) {
    this.client = new OpenAI({
      baseURL: this.agentsConfig.deepseekBaseUrl,
      apiKey: this.agentsConfig.deepseekApiKey,
    });
  }

  async process(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();
    const agentConfig = this.agentsConfig.getRegistry().agents.orchestrator;

    try {
      const systemPrompt = this.buildSystemPrompt(input);

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...input.conversation_history.slice(-10).map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        { role: 'user', content: input.user_message },
      ];

      const response = await this.client.chat.completions.create({
        model: agentConfig.model,
        messages,
        temperature: agentConfig.temperature ?? 0.3,
        max_tokens: agentConfig.maxTokens ?? 1024,
        stream: false,
        response_format: { type: 'json_object' },
      }, {
        timeout: agentConfig.timeout,
      });

      const content = response.choices[0]?.message?.content || '{}';
      const result = JSON.parse(content);

      return {
        intent: result.intent || 'general_chat',
        confidence: result.confidence ?? 0.5,
        routing: result.routing || [],
        query_for_agents: result.query_for_agents || input.user_message,
        final_reply: result.final_reply || '',
        emotion_detected: result.emotion_detected || 'neutral',
        should_alert: result.should_alert || false,
        latency_ms: Date.now() - startTime,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      this.logger.error(`Orchestrator failed after ${latency}ms: ${error}`);

      // 降级: 本地关键词匹配
      return this.fallbackIntentRecognition(input);
    }
  }

  private buildSystemPrompt(input: AgentInput): string {
    return `你是炎华众康主动健康管理系统的AI调度员"小炎"。

## 用户上下文
- 用户档案摘要: ${input.user_context.profile_summary || '未建档'}
- 当前场景: ${input.scene_mode}
- 降级状态: ${input.downgrade_level || 'none'}

## 意图分类 (MVP — 2路由目标)
| 意图 | 触发条件 | 路由 |
|------|---------|------|
| health_question | 健康知识提问(怎么降血糖/吃什么/能不能运动/用药相关) | knowledge_qa |
| general_chat | 寒暄/模糊提问/其他 | none(直接回复) |
| emergency | "救命/120/急救/胸痛剧烈" | emergency(跳过LLM) |

## 输出JSON格式
{
  "intent": "health_question | general_chat | emergency",
  "confidence": 0.0-1.0,
  "routing": ["knowledge_qa"],
  "query_for_agents": "转发给知识库的查询文本",
  "final_reply": "直接回复的文字(general_chat时必填)",
  "emotion_detected": "neutral | happy | anxious | sad",
  "should_alert": false
}

## 规则
- confidence >= 0.8: 直接路由
- confidence < 0.8: routing=[], 追加确认问题
- 涉及用药/治疗: 追加"具体请咨询健康顾问"
- 检测紧急关键字: should_alert=true, routing=[], 返回紧急引导`;
  }

  /**
   * 本地关键词匹配降级
   * LLM超时(>3s)时使用, 覆盖 20+ 预设意图模式
   */
  private fallbackIntentRecognition(input: AgentInput): AgentOutput {
    const msg = input.user_message.toLowerCase();

    // 紧急关键词检测
    const emergencyKeywords = ['救命', '120', '急救', '胸痛剧烈', '呼吸困难', '严重外伤'];
    if (emergencyKeywords.some((kw) => msg.includes(kw))) {
      return {
        intent: 'emergency',
        confidence: 1.0,
        routing: [],
        final_reply: '检测到你可能有紧急情况,请立即拨打120或联系紧急联系人!',
        should_alert: true,
        latency_ms: 0,
      };
    }

    // 健康问题关键词
    const healthKeywords = [
      '血压', '血糖', '糖尿病', '高血压', '吃药', '用药', '饮食', '运动',
      '减肥', '胆固醇', '尿酸', '痛风', '冠心病', '头晕', '失眠',
    ];
    if (healthKeywords.some((kw) => msg.includes(kw))) {
      return {
        intent: 'health_question',
        confidence: 0.7,
        routing: ['knowledge_qa'],
        query_for_agents: input.user_message,
        final_reply: '',
        latency_ms: 0,
      };
    }

    // 默认: 通用对话
    return {
      intent: 'general_chat',
      confidence: 0.5,
      routing: [],
      final_reply: '有什么我可以帮你的吗?',
      latency_ms: 0,
    };
  }
}
