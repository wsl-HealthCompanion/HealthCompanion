/**
 * 工具注册表（Task 5）
 *
 * 职责：
 * 1. 注册所有工具（NestJS 侧唯一可信执行入口）
 * 2. 暴露 OpenAI function-calling 格式的定义给 LLM（模型只能"申请"调用）
 * 3. 执行前做 JSON Schema 参数校验；执行失败如实返回 ok=false（绝不伪造成功）
 */
import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

import {
  ToolContext,
  ToolDefinition,
  ToolExecutionResult,
} from './tool.types';
import { validateAgainstSchema } from './tool.schema';
import { createDietPlanTools } from './diet-plan.tool';
import { createReminderTool } from './reminder.tool';
import { createProfileTool } from './profile.tool';

export interface OpenAiToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

@Injectable()
export class ToolsRegistry {
  private readonly logger = new Logger(ToolsRegistry.name);
  private readonly tools = new Map<string, ToolDefinition>();

  constructor(private readonly dataSource: DataSource) {
    const all: ToolDefinition[] = [
      ...createDietPlanTools(),
      createReminderTool(dataSource),
      createProfileTool(),
    ];
    for (const tool of all) {
      this.tools.set(tool.name, tool);
    }
    this.logger.log(`Registered ${this.tools.size} tools: ${[...this.tools.keys()].join(', ')}`);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** OpenAI/Qwen function calling 格式 */
  openAiTools(): OpenAiToolDefinition[] {
    return this.list().map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters as unknown as Record<string, any>,
      },
    }));
  }

  /**
   * 校验参数并执行工具。
   * - 未知工具 / 参数非法 / 执行异常 → ok=false（附可展示的 summary）
   */
  async execute(
    name: string,
    rawArgs: unknown,
    ctx: ToolContext,
  ): Promise<ToolExecutionResult> {
    const args =
      rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)
        ? (rawArgs as Record<string, any>)
        : {};

    const tool = this.tools.get(name);
    if (!tool) {
      return {
        tool: name,
        arguments: args,
        ok: false,
        error: `未知工具: ${name}`,
        summary: `暂时不支持该操作（${name}）`,
      };
    }

    const validation = validateAgainstSchema(tool.parameters, args);
    if (!validation.ok) {
      this.logger.warn(`Tool ${name} argument validation failed: ${validation.errors.join('; ')}`);
      return {
        tool: name,
        arguments: args,
        ok: false,
        error: '参数校验失败',
        validationErrors: validation.errors,
        summary: `参数不完整或格式不正确：${validation.errors.join('；')}`,
      };
    }

    try {
      const outcome = await tool.execute(ctx, args);
      return {
        tool: name,
        arguments: args,
        ok: true,
        summary: outcome.summary,
        data: outcome.data,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Tool ${name} execution failed: ${msg}`);
      return {
        tool: name,
        arguments: args,
        ok: false,
        error: msg,
        summary: `操作未能完成：${msg}`,
      };
    }
  }
}
