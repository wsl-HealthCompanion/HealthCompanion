// ============================================================
// 聊天服务 — SSE 流式（浏览器 fetch + ReadableStream）+ JSON 回退
// 浏览器里 SSE 走 HTTP 即可，无微信"必须 HTTPS"限制
// ============================================================
import { API_BASE, DEMO_MODE } from '../config';
import { getToken } from './auth';
import { getRequestToken } from './demoIdentity';
import { dispatchChatEvent } from './chatEvents';
import type { ChatCitation, Emotion } from '../types';

const authHeaders = () => {
  let storage: Storage | null = null;
  try { storage = globalThis.sessionStorage; } catch { /* use the in-memory Demo identity */ }
  const token = getRequestToken(DEMO_MODE ? 'demo' : 'production', storage, getToken());
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export interface ChatParams {
  message: string;
  sessionId: string;
  profile: Record<string, any>;
  skipTts?: boolean;
}

export interface StreamCallbacks {
  onToken: (char: string) => void;
  onThinking?: (content?: string) => void;
  onIntent?: (intent: string, emotion?: Emotion) => void;
  onSpeechChunk?: (text: string, index: number) => void;
  onEmotion?: (e: Emotion) => void;
  onCitation?: (citation: ChatCitation) => void;
  onDone?: (sessionId?: string) => void;
}

/**
 * SSE 流式 — 逐 token 回调。返回 {streamed} 标记是否成功走了流式；
 * 若失败（网络/非200/无 body），返回 streamed=false，由上层回退 JSON。
 */
export async function streamChat(
  params: ChatParams,
  cb: StreamCallbacks,
  signal?: AbortSignal,
): Promise<{ streamed: boolean }> {
  const body = JSON.stringify({
    message: params.message,
    sessionId: params.sessionId || '',
    type: 'text',
    profile: params.profile,
    skipTts: params.skipTts ?? false,
  });

  try {
    const resp = await fetch(`${API_BASE}/chat/message`, {
      method: 'POST',
      headers: { ...authHeaders(), Accept: 'text/event-stream' },
      body,
      signal,
    });
    if (!resp.ok || !resp.body) return { streamed: false };

    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let sawEvent = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';
      for (const part of parts) {
        const m = part.match(/^data:\s*(\{[\s\S]*\})/m);
        if (!m) continue;
        try {
          const evt = JSON.parse(m[1]);
          sawEvent = true;
          dispatchChatEvent(evt, cb);
        } catch {
          /* 忽略解析失败片段 */
        }
      }
    }
    return { streamed: sawEvent };
  } catch (e) {
    if (signal?.aborted) return { streamed: true };
    console.warn('[chat] SSE 不可用，回退 JSON:', e);
    return { streamed: false };
  }
}

export interface SessionItem {
  sessionId: string;
  lastMessage: string;
  lastActive: string;
  messageCount: number;
  contextLevel: string;
}
export interface SessionListResult { items: SessionItem[]; total: number; }

export interface MessageItem {
  id: string;
  role: string;
  content: string;
  intent?: string;
  citations?: ChatCitation[];
  createdAt: string;
}
export interface MessageListResult { items: MessageItem[]; }

/** 获取会话列表 */
export async function fetchSessions(): Promise<SessionItem[]> {
  try {
    const resp = await fetch(`${API_BASE}/chat/sessions`, { headers: authHeaders() });
    const json = await resp.json();
    return (json?.items || json?.data?.items || []) as SessionItem[];
  } catch { return []; }
}

/** 获取某会话的历史消息 */
export async function fetchMessages(sessionId: string): Promise<MessageItem[]> {
  try {
    const resp = await fetch(`${API_BASE}/chat/sessions/${sessionId}/messages`, { headers: authHeaders() });
    const json = await resp.json();
    return (json?.items || json?.data?.items || []) as MessageItem[];
  } catch { return []; }
}

export interface JsonResult {
  answer: string;
  emotion: Emotion;
  sessionId: string;
  citations: ChatCitation[];
}

/** JSON 一次性回退 */
export async function sendChatJson(params: ChatParams, signal?: AbortSignal): Promise<JsonResult> {
  const body = JSON.stringify({
    message: params.message,
    sessionId: params.sessionId || '',
    type: 'text',
    profile: params.profile,
    skipTts: params.skipTts ?? false,
  });
  try {
    const resp = await fetch(`${API_BASE}/chat/send`, {
      method: 'POST',
      headers: authHeaders(),
      body,
      signal,
    });
    const json = await resp.json();
    const data = json?.data || json;
    return {
      answer: data?.answer || '',
      emotion: (data?.emotion || 'neutral') as Emotion,
      sessionId: data?.sessionId || '',
      citations: Array.isArray(data?.citations) ? data.citations : [],
    };
  } catch (e) {
    if (signal?.aborted) throw e;
    console.warn('[chat] JSON 后端不可用:', e);
    return { answer: '', emotion: 'neutral', sessionId: '', citations: [] };
  }
}
