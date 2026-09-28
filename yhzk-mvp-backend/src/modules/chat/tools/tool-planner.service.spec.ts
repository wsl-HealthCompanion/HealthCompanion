import { ToolPlannerService } from './tool-planner.service';
import { ToolsRegistry } from './tools.registry';

/**
 * ToolPlannerService 测试
 * - decide(): 模型返回 tool_calls → tool；返回文本 → answer；异常 → none
 * - verbalize(): 失败结果绝不经过 LLM（确定性诚实说明，无法伪造成功）
 * - 非工具问题（模型不返回 tool_calls）不会产生 tool 决策
 */
function makePlanner() {
  const registry = new ToolsRegistry({ query: jest.fn(async () => []) } as any);
  const config = {
    get: jest.fn((k: string, d?: any) => {
      if (k === 'DASHSCOPE_API_KEY') return 'sk-test';
      if (k === 'TOOL_LLM_MODEL') return 'qwen-plus';
      return d;
    }),
  } as any;
  const planner = new ToolPlannerService(config, registry);
  const create = jest.fn();
  (planner as any).client = { chat: { completions: { create } } };
  return { planner, create };
}

async function collect(gen: AsyncGenerator<string>): Promise<string> {
  let out = '';
  for await (const d of gen) out += d;
  return out;
}

describe('ToolPlannerService', () => {
  it('decide: 模型返回 tool_calls → kind=tool（含解析后的参数）', async () => {
    const { planner, create } = makePlanner();
    create.mockResolvedValueOnce({
      choices: [
        {
          message: {
            tool_calls: [
              {
                function: {
                  name: 'create_reminder',
                  arguments: JSON.stringify({ title: '测血压', remind_at: '2030-01-02T08:00:00+08:00' }),
                },
              },
            ],
          },
        },
      ],
    });
    const d = await planner.decide('提醒我明天测血压', [], '未建档');
    expect(d.kind).toBe('tool');
    if (d.kind === 'tool') {
      expect(d.call.tool).toBe('create_reminder');
      expect(d.call.arguments.title).toBe('测血压');
    }
  });

  it('decide: 模型不返回 tool_calls 而返回文本 → kind=answer（非工具问题不误触发）', async () => {
    const { planner, create } = makePlanner();
    create.mockResolvedValueOnce({ choices: [{ message: { content: '请问你想什么时候提醒？' } }] });
    const d = await planner.decide('帮我定个提醒', [], '未建档');
    expect(d.kind).toBe('answer');
    if (d.kind === 'answer') expect(d.text).toContain('什么时候');
  });

  it('decide: 空消息/空输出 → kind=none', async () => {
    const { planner, create } = makePlanner();
    create.mockResolvedValueOnce({ choices: [{ message: { content: '' } }] });
    const d = await planner.decide('嗯', [], '未建档');
    expect(d.kind).toBe('none');
  });

  it('decide: LLM 异常 → kind=none（不抛错，交给上层诚实降级）', async () => {
    const { planner, create } = makePlanner();
    create.mockRejectedValueOnce(new Error('network down'));
    const d = await planner.decide('生成7天计划', [], '未建档');
    expect(d.kind).toBe('none');
  });

  it('decide: 无 API key → client 为空时 kind=none（工具层安全关闭）', async () => {
    const registry = new ToolsRegistry({ query: jest.fn() } as any);
    const config = { get: jest.fn((_k: string, d?: any) => (d === undefined ? '' : d)) } as any;
    const planner = new ToolPlannerService(config, registry);
    expect(planner.available).toBe(false);
    const d = await planner.decide('生成计划', [], '未建档');
    expect(d.kind).toBe('none');
  });

  it('verbalize: 执行失败 → 确定性诚实说明，且不调用 LLM（无法假装成功）', async () => {
    const { planner, create } = makePlanner();
    const text = await collect(
      planner.verbalize('帮我设提醒', [], {
        tool: 'create_reminder',
        arguments: {},
        ok: false,
        summary: '参数不完整或格式不正确：remind_at: 缺失必填参数',
      }),
    );
    expect(text).toContain('抱歉');
    expect(text).toContain('remind_at');
    expect(text).not.toContain('已创建');
    expect(create).not.toHaveBeenCalled();
  });

  it('verbalize: 成功 + 流式 LLM → 输出 delta 文本', async () => {
    const { planner, create } = makePlanner();
    create.mockResolvedValueOnce(
      (async function* () {
        yield { choices: [{ delta: { content: '好的！' } }] };
        yield { choices: [{ delta: { content: '已创建提醒。' } }] };
      })(),
    );
    const text = await collect(
      planner.verbalize('帮我设提醒', [], {
        tool: 'create_reminder',
        arguments: {},
        ok: true,
        summary: '已创建提醒「测血压」',
        data: { title: '测血压' },
      }),
    );
    expect(text).toBe('好的！已创建提醒。');
  });

  it('verbalize: 成功但 LLM 失败 → 退回 tool summary（结果仍真实）', async () => {
    const { planner, create } = makePlanner();
    create.mockRejectedValueOnce(new Error('timeout'));
    const text = await collect(
      planner.verbalize('帮我设提醒', [], {
        tool: 'create_reminder',
        arguments: {},
        ok: true,
        summary: '已创建提醒「测血压」，时间 2030/01/02 08:00',
      }),
    );
    expect(text).toContain('已创建提醒');
  });
});
