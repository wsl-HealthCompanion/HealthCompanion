import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildChatBody, streamChat, sendChatJson } from './chat';

// getToken 依赖浏览器 localStorage — 直接 mock 掉 auth 模块
vi.mock('./auth', () => ({ getToken: () => 'demo_test_token' }));

afterEach(() => {
  vi.restoreAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).fetch;
});

describe('聊天请求体 — images 契约', () => {
  it('buildChatBody: 带图时包含 images 字段', () => {
    const body = JSON.parse(buildChatBody({ message: '这是什么', sessionId: 's1', profile: {}, images: ['data:image/jpeg;base64,AA'] }));
    expect(body.images).toEqual(['data:image/jpeg;base64,AA']);
    expect(body.message).toBe('这是什么');
  });

  it('buildChatBody: 不带图时不携带 images 字段(向后兼容)', () => {
    const body = JSON.parse(buildChatBody({ message: '你好', sessionId: '', profile: {} }));
    expect(body).not.toHaveProperty('images');
  });

  it('streamChat: 请求体透传 images', async () => {
    const post = vi.fn(async () => ({ ok: true, body: null }));
    (globalThis as any).fetch = post;
    await streamChat(
      { message: '看看', sessionId: 's1', profile: {}, images: ['data:image/jpeg;base64,AA'] },
      { onToken: vi.fn() },
    );
    const [, init] = post.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.images).toEqual(['data:image/jpeg;base64,AA']);
  });

  it('sendChatJson: 请求体透传 images', async () => {
    const post = vi.fn(async () => ({
      json: async () => ({ data: { answer: 'ok', emotion: 'neutral', sessionId: 's1' } }),
    }));
    (globalThis as any).fetch = post;
    await sendChatJson({ message: '看看', sessionId: 's1', profile: {}, images: ['data:image/jpeg;base64,AA'] });
    const [, init] = post.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.images).toHaveLength(1);
  });
});
