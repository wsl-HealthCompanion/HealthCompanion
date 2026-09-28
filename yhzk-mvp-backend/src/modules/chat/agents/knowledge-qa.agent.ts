import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { IAgent, AgentInput, AgentOutput, UserContext } from './agent.interface';
import { AgentsConfig } from '../../../config/agents.config';
import { RagService } from '../rag/rag.service';
import { Citation } from '../dto/sse-event.dto';

/**
 * ④知识库问答智能体 — Knowledge QA Agent
 * 模型: DeepSeek-R1 (deepseek-reasoner) + Milvus RAG
 * 职责: 基于用户专属知识库 + 通用医学知识，提供个性化健康问答
 *
 * 参考: 智能体架构与搭建指南 §5, MVP-SPEC §8.3
 */
@Injectable()
export class KnowledgeQAAgent implements IAgent {
  readonly name = 'knowledge_qa';
  private readonly logger = new Logger(KnowledgeQAAgent.name);
  private client: OpenAI;

  constructor(
    private configService: ConfigService,
    private agentsConfig: AgentsConfig,
    private ragService: RagService,
  ) {
    this.client = new OpenAI({
      baseURL: this.agentsConfig.deepseekBaseUrl,
      apiKey: this.agentsConfig.deepseekApiKey,
    });
  }

  async process(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();
    const result = await this.query(
      input.user_message,
      input.user_context,
    );

    return {
      routing: [],
      final_reply: result.answer,
      tts_text: result.ttsText || result.answer,
      quick_replies: result.quickReplies || [],
      latency_ms: Date.now() - startTime,
      answers: [{
        answer: result.answer,
        citations: result.citations,
      }],
    };
  }

  /**
   * 核心问答方法
   * 1. RAG检索 (并行查两个知识库)
   * 2. 拼接上下文
   * 3. 调用 DeepSeek-R1 生成回答
   */
  async query(
    question: string,
    userContext: UserContext,
  ): Promise<{
    answer: string;
    citations: Citation[];
    ttsText: string;
    quickReplies: string[];
  }> {
    const agentConfig = this.agentsConfig.getRegistry().agents.knowledge_qa;

    try {
      // 1. RAG检索 — 并行查用户知识库 + 通用医学知识库
      const [userDocs, generalDocs] = await Promise.all([
        this.ragService.search(question, {
          collection: 'user_knowledge',
          filter: { user_id: userContext.user_id },
          topK: 3,
        }).catch(() => []),
        this.ragService.search(question, {
          collection: 'medical_knowledge',
          topK: 2,
        }).catch(() => []),
      ]);

      // 2. 拼接上下文
      const contextParts: string[] = [];
      if (userDocs.length > 0) {
        contextParts.push('## 用户专属知识 (L3)\n' + userDocs.map((d) => d.text).join('\n'));
      }
      if (generalDocs.length > 0) {
        contextParts.push('## 通用医学知识 (L1)\n' + generalDocs.map((d) => d.text).join('\n'));
      }
      const context = contextParts.join('\n\n') || '暂无相关知识库内容';

      // 3. 调用 DeepSeek-R1
      const response = await this.client.chat.completions.create({
        model: agentConfig.model,
        messages: [
          {
            role: 'system',
            content: `你是炎华众康的健康知识助手。基于以下知识库回答用户问题。
回答要求:
- 温暖耐心,通俗易懂(目标用户40-80岁)
- 基于知识库内容,不要编造
- 80字以内
- 涉及用药/治疗:必须加"具体请咨询健康顾问"
- 输出JSON: {"answer":"...", "citations":[{"source":"...","text":"..."}], "ttsText":"...", "quickReplies":["..."]}
ttsText比answer更简短,适合语音播报。`,
          },
          { role: 'user', content: `知识库:\n${context}\n\n用户问题: ${question}` },
        ],
        temperature: agentConfig.temperature ?? 0.3,
        max_tokens: agentConfig.maxTokens ?? 1024,
      }, {
        timeout: agentConfig.timeout,
      });

      const content = response.choices[0]?.message?.content || '{}';
      // DeepSeek-R1 输出可能包含推理过程，提取 JSON 部分
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : content;
      const result = JSON.parse(jsonStr);

      return {
        answer: result.answer || '抱歉,我暂时无法回答这个问题。建议咨询你的健康顾问。',
        citations: result.citations || [],
        ttsText: result.ttsText || result.answer || '',
        quickReplies: result.quickReplies || [],
      };
    } catch (error) {
      this.logger.error(`Knowledge QA failed: ${error}`);

      // 降级: FAQ 关键词匹配
      return this.fallbackFAQ(question);
    }
  }

  /**
   * FAQ 降级: 20条本地关键词匹配
   */
  private fallbackFAQ(question: string): {
    answer: string;
    citations: Citation[];
    ttsText: string;
    quickReplies: string[];
  } {
    const faqList: Array<{ keywords: string[]; answer: string }> = [
      {
        keywords: ['血压'],
        answer: '血压管理建议:低盐饮食(每天<6g)、按时服药、定期监测。具体请咨询健康顾问。',
      },
      {
        keywords: ['血糖', '糖尿病'],
        answer: '血糖控制建议:控制主食摄入、规律运动、按时用药。具体请咨询健康顾问。',
      },
      {
        keywords: ['睡不着', '失眠'],
        answer: '改善睡眠建议:睡前避免看手机、保持卧室安静、尝试深呼吸放松。如果长期失眠建议就医。',
      },
      {
        keywords: ['运动', '锻炼'],
        answer: '建议每周进行150分钟中等强度运动,如快走、太极。运动前请做好热身,如有不适立即停止。',
      },
      {
        keywords: ['饮食', '吃什么'],
        answer: '建议低盐低脂饮食,多吃蔬菜水果,控制主食量,少吃加工食品。具体请咨询营养师或健康顾问。',
      },
    ];

    for (const faq of faqList) {
      if (faq.keywords.some((kw) => question.includes(kw))) {
        return {
          answer: faq.answer,
          citations: [],
          ttsText: faq.answer,
          quickReplies: ['了解更多', '联系顾问'],
        };
      }
    }

    return {
      answer: '我暂时无法处理这个问题。请稍后再试,或联系你的健康顾问获取帮助。',
      citations: [],
      ttsText: '请稍后再试,或联系你的健康顾问获取帮助。',
      quickReplies: ['联系顾问'],
    };
  }
}
