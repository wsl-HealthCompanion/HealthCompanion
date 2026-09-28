// ============================================================
// 聊天服务 — SSE 流式（浏览器 fetch + ReadableStream）+ JSON 回退
// 浏览器里 SSE 走 HTTP 即可，无微信"必须 HTTPS"限制
// ============================================================
import { API_BASE, DEMO_TOKEN } from '../config';
import { getToken } from './auth';
import type { Citation, Emotion } from '../types';

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${getToken() || DEMO_TOKEN}`,
});

export interface ChatParams {
  message: string;
  sessionId: string;
  profile: Record<string, any>;
}

export interface StreamCallbacks {
  onToken: (char: string) => void;
  onThinking?: (content?: string) => void;
  onIntent?: (intent: string, emotion?: Emotion) => void;
  onSpeechChunk?: (text: string, index: number) => void;
  onEmotion?: (e: Emotion) => void;
  /** Task 4：可信引用来源（SSE citation 事件，绝不进入 speech_chunk） */
  onCitation?: (citation: Citation) => void;
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
          if (evt.type === 'token') cb.onToken(evt.content || '');
          else if (evt.type === 'thinking') cb.onThinking?.(evt.content || '');
          else if (evt.type === 'speech_chunk') cb.onSpeechChunk?.(evt.text || '', evt.index ?? 0);
          else if (evt.type === 'intent') {
            const emotion = evt.emotion as Emotion | undefined;
            cb.onIntent?.(evt.primary || evt.intent || 'unknown', emotion);
            if (emotion) cb.onEmotion?.(emotion);
          }
          else if (evt.type === 'citation') {
            // Task 4：引用来自检索 metadata，仅透传展示字段
            cb.onCitation?.({
              source: evt.source || '',
              title: evt.title || '',
              url: evt.url || '',
              publisher: evt.publisher || '',
              text: evt.text || '',
              chunk_id: evt.chunk_id || '',
            });
          }
          else if (evt.type === 'done') {
            if (evt.emotion) cb.onEmotion?.(evt.emotion);
            cb.onDone?.(evt.sessionId);
          }
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
  citations?: Citation[];
}

/** JSON 一次性回退 */
export async function sendChatJson(params: ChatParams, signal?: AbortSignal): Promise<JsonResult> {
  const body = JSON.stringify({
    message: params.message,
    sessionId: params.sessionId || '',
    type: 'text',
    profile: params.profile,
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
      citations: Array.isArray(data?.citations) ? (data.citations as Citation[]) : [],
    };
  } catch (e) {
    if (signal?.aborted) throw e;
    console.warn('[chat] JSON 后端不可用:', e);
    return { answer: '', emotion: 'neutral', sessionId: '' };
  }
}
