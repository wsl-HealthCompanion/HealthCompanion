import { ChatService } from './chat.service';

/**
 * ChatService — Tool Calling 集成（SSE 事件层）
 * 覆盖：正常 tool call / 工具失败诚实降级 / 非工具问题不误触发 / RAG+citation 共存 /
 * tool_request 但 Python 已给文本时不重复执行
 */
function makeService() {
  const sessionRepo = {
    findOne: jest.fn(async () => null),
    save: jest.fn(async (x: any) => x),
  };
  const messageRepo = {
    create: jest.fn((d: any) => d),
    save: jest.fn(async (d: any) => d),
  };
  const ttsService = {
    synthesize: jest.fn(async () => ({ audioUrl: 'http://tts/a.mp3', durationSec: 1, visemeTimeline: [] })),
  };
  const configService = {
    get: jest.fn((k: string, d?: any) => (k === 'AI_SERVICE_URL' ? 'http://localhost:8000' : d)),
  };
  const aiClient = { streamChat: jest.fn(), isHealthy: jest.fn(async () => true) };
  const toolsRegistry = {
    execute: jest.fn(),
    list: jest.fn(() => []),
    openAiTools: jest.fn(() => []),
    get: jest.fn(),
    has: jest.fn(() => true),
  };
  const toolPlanner = { available: true, decide: jest.fn(), verbalize: jest.fn() };
  const entityManager = { query: jest.fn(async () => []) };

  const service = new ChatService(
    sessionRepo as any,
    messageRepo as any,
    {} as any,
    {} as any,
    {} as any,
    ttsService as any,
    configService as any,
    aiClient as any,
    toolsRegistry as any,
    toolPlanner as any,
    entityManager as any,
  );
  (service as any).redis = {
    get: jest.fn(async () => null),
    setex: jest.fn(async () => 'OK'),
    del: jest.fn(async () => 1),
    incr: jest.fn(async () => 1),
    expire: jest.fn(async () => 1),
  };
  return { service, aiClient, toolsRegistry, toolPlanner, messageRepo, sessionRepo };
}

const SESSION = {
  session_id: 'sess_test',
  user_id: 'user_test',
  message_count: 1,
  last_active: new Date(),
  memory_summaries: [],
} as any;

const CONTEXT = { user_id: 'user_test', profile_summary: '张三；高血压', scene_mode: 'home' } as any;

function pythonStream(events: any[]) {
  return (async function* () {
    for (const e of events) yield e;
  })();
}

async function collect(gen: AsyncGenerator<any>): Promise<any[]> {
  const out: any[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

function typesOf(events: any[]): string[] {
  return events.map((e) => e.type);
}

describe('ChatService Tool Calling (SSE)', () => {
  it('正常 tool call: tool_call → tool_result(ok) → token → done，并持久化工具轨迹', async () => {
    const { service, aiClient, toolsRegistry, toolPlanner, messageRepo } = makeService();
    aiClient.streamChat.mockReturnValueOnce(
      pythonStream([
        { type: 'thinking', content: '正在分析...' },
        { type: 'intent', primary: 'tool_request', confidence: 0.95, emotion: 'neutral' },
        { type: 'done', intent: 'tool_request', emotion: 'neutral' },
      ]),
    );
    toolPlanner.decide.mockResolvedValueOnce({
      kind: 'tool',
      call: { tool: 'create_reminder', arguments: { title: '测血压', remind_at: '2030-01-02T08:00:00+08:00' } },
    });
    toolsRegistry.execute.mockResolvedValueOnce({
      tool: 'create_reminder',
      arguments: { title: '测血压' },
      ok: true,
      summary: '已创建提醒「测血压」',
      data: { id: 'abc', title: '测血压' },
    });
    toolPlanner.verbalize.mockReturnValueOnce(
      (async function* () {
        yield '好的！';
        yield '已创建测血压提醒。';
      })(),
    );

    const events = await collect(
      (service as any).processPythonAI('user_test', SESSION, '提醒我明天早上八点测血压', 'text', CONTEXT, [], undefined),
    );

    const types = typesOf(events);
    expect(types).toContain('tool_call');
    expect(types).toContain('tool_result');
    const iCall = types.indexOf('tool_call');
    const iResult = types.indexOf('tool_result');
    const iToken = types.indexOf('token');
    const iDone = types.indexOf('done');
    expect(iCall).toBeGreaterThan(-1);
    expect(iResult).toBeGreaterThan(iCall);
    expect(iToken).toBeGreaterThan(iResult);
    expect(iDone).toBeGreaterThan(iToken);

    const call = events[iCall];
    expect(call.tool).toBe('create_reminder');
    expect(call.arguments.title).toBe('测血压');
    expect(events[iResult].ok).toBe(true);

    const tokens = events.filter((e) => e.type === 'token').map((e) => e.content).join('');
    expect(tokens).toContain('已创建测血压提醒');
    expect(events.filter((e) => e.type === 'speech_chunk').length).toBeGreaterThan(0);

    // 工具真实执行 + 用户档案上下文透传（服务端数据源）
    expect(toolsRegistry.execute).toHaveBeenCalledWith(
      'create_reminder',
      expect.objectContaining({ title: '测血压' }),
      expect.objectContaining({ userId: 'user_test' }),
    );

    // 持久化：intent=tool_request + meta 工具轨迹
    const saved = messageRepo.save.mock.calls[0][0];
    expect(saved.intent).toBe('tool_request');
    expect(saved.content).toContain('已创建测血压提醒');
    expect(saved.meta.tool).toBe('create_reminder');
    expect(saved.meta.tool_ok).toBe(true);
  });

  it('工具失败: tool_result(ok=false) + 诚实文字说明，不出现成功措辞', async () => {
    const { service, aiClient, toolsRegistry, toolPlanner, messageRepo } = makeService();
    aiClient.streamChat.mockReturnValueOnce(
      pythonStream([
        { type: 'intent', primary: 'tool_request', confidence: 0.9, emotion: 'neutral' },
        { type: 'done', intent: 'tool_request', emotion: 'neutral' },
      ]),
    );
    toolPlanner.decide.mockResolvedValueOnce({
      kind: 'tool',
      call: { tool: 'create_reminder', arguments: {} },
    });
    toolsRegistry.execute.mockResolvedValueOnce({
      tool: 'create_reminder',
      arguments: {},
      ok: false,
      error: '参数校验失败',
      validationErrors: ['remind_at: 缺失必填参数'],
      summary: '参数不完整或格式不正确：remind_at: 缺失必填参数',
    });
    toolPlanner.verbalize.mockReturnValueOnce(
      (async function* () {
        yield '抱歉，参数不完整或格式不正确：remind_at: 缺失必填参数。你可以稍后再试。';
      })(),
    );

    const events = await collect(
      (service as any).processPythonAI('user_test', SESSION, '帮我设个提醒', 'text', CONTEXT, []),
    );

    const result = events.find((e) => e.type === 'tool_result');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('参数校验失败');
    expect(result.validationErrors.join(' ')).toContain('remind_at');

    const text = events.filter((e) => e.type === 'token').map((e) => e.content).join('');
    expect(text).toContain('抱歉');
    expect(text).not.toMatch(/已创建|已完成|成功设置/);

    const saved = messageRepo.save.mock.calls[0][0];
    expect(saved.meta.tool_ok).toBe(false);
  });

  it('非工具问题（health_question）不误触发工具，RAG citation 照常透传', async () => {
    const { service, aiClient, toolsRegistry, toolPlanner } = makeService();
    aiClient.streamChat.mockReturnValueOnce(
      pythonStream([
        { type: 'thinking', content: '正在分析...' },
        { type: 'intent', primary: 'health_question', confidence: 0.95, emotion: 'neutral' },
        { type: 'token', content: '高血压', index: 0 },
        { type: 'speech_chunk', text: '高血压', index: 0 },
        { type: 'citation', source: '世界卫生组织（WHO）', title: '高血压实况报道', url: 'https://www.who.int/zh/x', publisher: '世界卫生组织（WHO）', text: '限盐', chunk_id: 'who::1' },
        { type: 'done', intent: 'health_question', emotion: 'neutral' },
      ]),
    );

    const events = await collect(
      (service as any).processPythonAI('user_test', SESSION, '高血压每天吃多少盐合适？', 'text', CONTEXT, []),
    );

    const types = typesOf(events);
    expect(types).not.toContain('tool_call');
    expect(types).not.toContain('tool_result');
    expect(types).toContain('citation');
    expect(types).toContain('token');
    expect(toolsRegistry.execute).not.toHaveBeenCalled();
    expect(toolPlanner.decide).not.toHaveBeenCalled();
  });

  it('intent=tool_request 但 Python 已产出回答文本 → 不走工具（避免重复执行）', async () => {
    const { service, aiClient, toolsRegistry, toolPlanner } = makeService();
    aiClient.streamChat.mockReturnValueOnce(
      pythonStream([
        { type: 'intent', primary: 'tool_request', confidence: 0.9, emotion: 'neutral' },
        { type: 'token', content: '好的！', index: 0 },
        { type: 'done', intent: 'tool_request', emotion: 'neutral' },
      ]),
    );

    const events = await collect(
      (service as any).processPythonAI('user_test', SESSION, '你好', 'text', CONTEXT, []),
    );
    const types = typesOf(events);
    expect(types).not.toContain('tool_call');
    expect(toolsRegistry.execute).not.toHaveBeenCalled();
  });

  it('工具规划器选择直接回答（如提醒缺时间反问）→ 无 tool_call，仅正文流式', async () => {
    const { service, aiClient, toolsRegistry, toolPlanner } = makeService();
    aiClient.streamChat.mockReturnValueOnce(
      pythonStream([
        { type: 'intent', primary: 'tool_request', confidence: 0.9, emotion: 'neutral' },
        { type: 'done', intent: 'tool_request', emotion: 'neutral' },
      ]),
    );
    toolPlanner.decide.mockResolvedValueOnce({
      kind: 'answer',
      text: '好的！请问想让我提醒你做什么，大约什么时间呢？',
    });

    const events = await collect(
      (service as any).processPythonAI('user_test', SESSION, '帮我定个提醒', 'text', CONTEXT, []),
    );
    const types = typesOf(events);
    expect(types).not.toContain('tool_call');
    expect(types).not.toContain('tool_result');
    const text = events.filter((e) => e.type === 'token').map((e) => e.content).join('');
    expect(text).toContain('什么时间');
    expect(toolsRegistry.execute).not.toHaveBeenCalled();
  });

  it('规划器无决策(none) → 诚实说明，不执行任何工具', async () => {
    const { service, aiClient, toolsRegistry, toolPlanner } = makeService();
    aiClient.streamChat.mockReturnValueOnce(
      pythonStream([
        { type: 'intent', primary: 'tool_request', confidence: 0.6, emotion: 'neutral' },
        { type: 'done', intent: 'tool_request', emotion: 'neutral' },
      ]),
    );
    toolPlanner.decide.mockResolvedValueOnce({ kind: 'none' });

    const events = await collect(
      (service as any).processPythonAI('user_test', SESSION, '那个', 'text', CONTEXT, []),
    );
    const types = typesOf(events);
    expect(types).not.toContain('tool_call');
    const text = events.filter((e) => e.type === 'token').map((e) => e.content).join('');
    expect(text).toContain('没能理解');
    expect(toolsRegistry.execute).not.toHaveBeenCalled();
  });
});
