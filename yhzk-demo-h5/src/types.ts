// ============================================================
// Demo 类型定义
// ============================================================

export type Emotion = 'neutral' | 'happy' | 'concerned' | 'anxious' | 'sad';

export type PlayerStatus = 'idle' | 'connecting' | 'live' | 'error';

export type DHState = 'loading' | 'ready' | 'thinking' | 'speaking';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface QuickReply {
  label: string;
  icon?: string;
  score?: number;
}

// 后端 SSE 事件（对齐 sse-event.dto.ts）
export interface SSEEvent {
  type: 'thinking' | 'intent' | 'token' | 'audio' | 'visemes' | 'citation' | 'quick_replies' | 'done' | 'error';
  timestamp?: number;
  content?: string;
  primary?: string;
  emotion?: string;
  intent?: string;
  replies?: QuickReply[];
  sessionId?: string;
  message?: string;
  code?: number;
}

// 对话回调
export interface ChatCallbacks {
  onToken: (char: string) => void;
  onEmotion?: (emotion: Emotion) => void;
  onQuickReplies?: (replies: QuickReply[]) => void;
  onDone: (sessionId?: string) => void;
  onError?: (msg: string) => void;
}
