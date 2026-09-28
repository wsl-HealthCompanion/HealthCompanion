/**
 * SSE 事件类型定义
 * 参考 MVP-SPEC §3.5 Chat SSE 流式响应
 */

export type SSEEventType =
  | 'thinking'
  | 'intent'
  | 'token'
  | 'speech_chunk'
  | 'audio'
  | 'visemes'
  | 'citation'
  | 'tool_call'
  | 'tool_result'
  | 'quick_replies'
  | 'done'
  | 'error';

export interface SSEEvent {
  type: SSEEventType;
  timestamp: number;
}

export interface SSEThinkingEvent extends SSEEvent {
  type: 'thinking';
  content: string;
}

export interface SSEIntentEvent extends SSEEvent {
  type: 'intent';
  primary: string;
  confidence: number;
}

export interface SSETokenEvent extends SSEEvent {
  type: 'token';
  content: string;
  index: number;
}

export interface SSESpeechChunkEvent extends SSEEvent {
  type: 'speech_chunk';
  text: string;
  index: number;
}

export interface SSEAudioEvent extends SSEEvent {
  type: 'audio';
  url: string;
  duration: number;
}

export interface SSEVisemesEvent extends SSEEvent {
  type: 'visemes';
  data: VisemePoint[];
}

export interface SSECitationEvent extends SSEEvent {
  type: 'citation';
  source: string;
  /** Task 4：可信来源扩展字段（均来自检索 metadata，向后兼容可选） */
  title?: string;
  url?: string;
  publisher?: string;
  text: string;
  chunk_id?: string;
}

/** Task 5：工具调用申请（NestJS 注册并执行，模型只能申请） */
export interface SSEToolCallEvent extends SSEEvent {
  type: 'tool_call';
  tool: string;
  arguments: Record<string, any>;
}

/** Task 5：工具执行结果（ok=false 表示失败，绝不伪装成功） */
export interface SSEToolResultEvent extends SSEEvent {
  type: 'tool_result';
  tool: string;
  ok: boolean;
  summary: string;
  data?: Record<string, any>;
  error?: string;
  /** 参数校验失败时的字段级错误 */
  validationErrors?: string[];
}

export interface SSEQuickRepliesEvent extends SSEEvent {
  type: 'quick_replies';
  replies: QuickReplyItem[];
}

export interface SSEDoneEvent extends SSEEvent {
  type: 'done';
  messageId: string;
  sessionId?: string;
  emotion?: string;
  intent?: string;
}

export interface SSEErrorEvent extends SSEEvent {
  type: 'error';
  code: number;
  message: string;
}

export interface VisemePoint {
  t: number;    // 时间(秒)
  v: string;    // 口型标识 (rest/aa/ee/ih/oh/uu/fv/sz/cl/th)
}

export interface QuickReplyItem {
  label: string;
  icon?: string;
  score: number;
}

export interface Citation {
  source: string;
  /** Task 4：扩展字段（可选，向后兼容旧数据） */
  title?: string;
  url?: string;
  publisher?: string;
  text: string;
  chunk_id?: string;
}
