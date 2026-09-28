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
  text: string;
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
  text: string;
}
