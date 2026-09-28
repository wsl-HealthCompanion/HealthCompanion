/**
 * Tool Calling 类型定义（Task 5）
 *
 * 设计原则：
 * - 工具由 NestJS 注册与执行；Python/LLM 只能提出调用请求，不能伪造执行结果
 * - 每个工具有明确 JSON Schema；参数先校验后执行
 * - 执行结果统一为 ToolExecutionResult（含 ok/summary/error），失败绝不伪装成功
 */

/** 工具执行上下文（服务端可信数据，不由 LLM 提供） */
export interface ToolContext {
  userId: string;
  /** 用户健康档案（已由服务端加载，工具可直接使用） */
  profile?: Record<string, any> | null;
}

/** JSON Schema（所需子集） */
export interface JsonSchema {
  type: 'object' | 'string' | 'integer' | 'number' | 'boolean' | 'array';
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: Array<string | number>;
  items?: JsonSchema;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  maxItems?: number;
  format?: string;
}

/** 工具定义 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JsonSchema;
  /** 执行工具。抛错表示执行失败（上层转为 ok=false） */
  execute: (ctx: ToolContext, args: Record<string, any>) => Promise<ToolExecOutcome>;
}

/** 工具执行成功时的返回内容 */
export interface ToolExecOutcome {
  /** 面向用户与 LLM 的结果摘要（中文，简洁） */
  summary: string;
  /** 结构化结果（可持久化 / 前端展示） */
  data?: Record<string, any>;
}

export interface ToolCallRequest {
  tool: string;
  arguments: Record<string, any>;
}

export interface ToolExecutionResult {
  tool: string;
  /** 参数（已通过校验的原始值） */
  arguments: Record<string, any>;
  ok: boolean;
  /** 成功摘要 或 失败原因（可直接展示给用户） */
  summary: string;
  data?: Record<string, any>;
  error?: string;
  /** 参数校验失败时给出字段级错误 */
  validationErrors?: string[];
}

/** LLM 工具决策结果 */
export type ToolDecision =
  | { kind: 'tool'; call: ToolCallRequest }
  | { kind: 'answer'; text: string }
  | { kind: 'none' };
