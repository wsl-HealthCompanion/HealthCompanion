/**
 * 工具规划服务（Task 5）
 *
 * 职责：
 * 1. decide(): 用 Qwen function calling 决定"是否调用工具、调哪个、参数是什么"
 *    —— 只有模型明确返回 tool_calls 才会执行；不返回工具调用时按普通回答处理
 * 2. verbalize(): 工具执行成功后，把结构化结果转成自然口语（流式）
 *    —— 工具失败时不走 LLM，直接输出诚实说明（绝不假装执行成功）
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

import { ToolsRegistry } from './tools.registry';
import {
  ToolDecision,
  ToolExecutionResult,
  ToolCallRequest,
} from './tool.types';

const PLANNER_SYSTEM = `你是"康伴智生"健康助手的行动规划器。
你可以调用工具来真正执行用户请求（生成饮食计划、创建提醒、读取健康档案、按档案个性化调整计划）。

规则：
1. 只有当用户明确要求"做一件事"时才调用工具（如：帮我制定/生成几天饮食计划、按我的档案调整计划、帮我设置一个提醒、看看我的健康档案）。
2. 健康知识问答（如"高血压吃什么好""盐吃多少合适"）不要调用工具，交由知识库回答。
3. 参数必须来自用户消息或已知上下文，禁止编造。创建提醒缺少明确时间时，不要调用工具，直接回复请用户提供时间。
4. 涉及日期时，必须基于系统提供的"当前时间"把相对时间（今天/明天/后天/下周/每天早上）换算成 ISO 8601 绝对时间（含时区 +08:00），禁止使用记忆中的其他年份日期。
5. 不要描述工具执行结果——执行由系统完成，你只负责决定调用。`;

/** 当前时间（Asia/Shanghai），供 LLM 正确换算"明天/后天"等相对时间 */
function currentTimeContext(): string {
  const now = new Date();
  const formatted = now.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const iso = now.toISOString();
  return `当前时间（Asia/Shanghai）：${formatted}（UTC ${iso}）。相对时间必须换算为绝对时间，如"明天早上八点"→次日 T08:00:00+08:00。`;
}

const VERBALIZER_SYSTEM = `你是"康伴智生"健康助手，正在用口语向中老年用户播报一次已完成的系统操作结果。
要求：
- 第一句以"好的！"开头，直接接正文，不要加逗号句号
- 150字以内，用短句口语，像朋友聊天
- 只依据【工具执行结果】描述，禁止添加任何未发生的内容，禁止声称做了结果中没有的操作
- 禁止括号、列表符号、英文单位，全部中文
- 涉及用药与治疗提醒咨询健康顾问`;

@Injectable()
export class ToolPlannerService {
  private readonly logger = new Logger(ToolPlannerService.name);
  private readonly client: OpenAI | null;
  private readonly model: string;

  constructor(
    config: ConfigService,
    private readonly registry: ToolsRegistry,
  ) {
    const apiKey = config.get<string>('DASHSCOPE_API_KEY', '');
    const baseURL = config.get<string>(
      'QWEN_BASE_URL',
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
    );
    this.model = config.get<string>('TOOL_LLM_MODEL', 'qwen-plus');
    this.client = apiKey ? new OpenAI({ apiKey, baseURL }) : null;
    if (!this.client) {
      this.logger.warn('DASHSCOPE_API_KEY missing — tool calling disabled');
    }
  }

  get available(): boolean {
    return this.client !== null;
  }

  /**
   * 决策：调用工具 / 直接回答 / 无输出
   * 只有模型返回 tool_calls 时才会执行工具（防止误触发）。
   */
  async decide(
    message: string,
    history: Array<{ role: string; content: string }>,
    profileSummary: string,
    _profile?: Record<string, any> | null,
  ): Promise<ToolDecision> {
    if (!this.client) {
      return { kind: 'none' };
    }
    const messages: any[] = [
      { role: 'system', content: PLANNER_SYSTEM },
      { role: 'system', content: currentTimeContext() },
      {
        role: 'system',
        content: `用户档案摘要：${profileSummary || '未建档'}`,
      },
      ...history.slice(-6).map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content || ''),
      })),
      { role: 'user', content: message },
    ];

    try {
      const resp = await this.client.chat.completions.create({
        model: this.model,
        messages,
        tools: this.registry.openAiTools(),
        tool_choice: 'auto',
        temperature: 0,
        max_tokens: 300,
      });
      const msg: any = resp.choices?.[0]?.message;
      const call = msg?.tool_calls?.[0];
      if (call?.function?.name) {
        let args: Record<string, any> = {};
        try {
          args = JSON.parse(call.function.arguments || '{}');
        } catch {
          args = {};
        }
        const req: ToolCallRequest = { tool: call.function.name, arguments: args };
        this.logger.log(`Tool decision: ${req.tool} ${JSON.stringify(args).slice(0, 200)}`);
        return { kind: 'tool', call: req };
      }
      const text = String(msg?.content || '').trim();
      return text ? { kind: 'answer', text } : { kind: 'none' };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Tool planning failed: ${msg}`);
      return { kind: 'none' };
    }
  }

  /**
   * 把工具执行结果转成口语回答（流式）。
   * - 失败：确定性诚实说明（不经过 LLM，绝不假装成功）
   * - 成功：LLM 口语化；LLM 不可用时退回工具 summary
   */
  async *verbalize(
    message: string,
    history: Array<{ role: string; content: string }>,
    result: ToolExecutionResult,
  ): AsyncGenerator<string, void, unknown> {
    if (!result.ok) {
      const honest = `抱歉，${result.summary}。你可以稍后再试，或者告诉我更具体的信息。`;
      yield* chunkedText(honest);
      return;
    }

    const fallback = result.summary;
    if (!this.client) {
      yield* chunkedText(fallback);
      return;
    }

    try {
      const dataJson = JSON.stringify(result.data || {}).slice(0, 1500);
      const messages: any[] = [
        { role: 'system', content: VERBALIZER_SYSTEM },
        ...history.slice(-4).map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: String(m.content || ''),
        })),
        { role: 'user', content: message },
        {
          role: 'user',
          content: `【工具执行结果】\n状态：成功\n摘要：${result.summary}\n结构化数据：${dataJson}`,
        },
      ];
      const stream = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0.3,
        max_tokens: 260,
        stream: true,
        messages,
      } as any);

      let got = false;
      for await (const chunk of stream as any) {
        const delta = chunk?.choices?.[0]?.delta?.content;
        if (delta) {
          got = true;
          yield delta;
        }
      }
      if (!got) {
        yield* chunkedText(fallback);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Tool verbalize failed: ${msg}`);
      yield* chunkedText(fallback);
    }
  }
}

/** 文本按小片段输出（无 LLM 时的确定性降级路径） */
function* chunkedText(text: string): Generator<string> {
  const size = 12;
  for (let i = 0; i < text.length; i += size) {
    yield text.slice(i, i + size);
  }
}
