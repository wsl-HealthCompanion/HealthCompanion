import { ToolsRegistry } from './tools.registry';

/**
 * ToolsRegistry 测试 — 正常调用 / 参数缺失非法 / 执行失败 / 未知工具 / schema 输出
 * 关键断言：参数非法或执行失败时，工具真实副作用（DB 写入）绝不能发生，且 ok=false。
 */
function makeRegistry() {
  const query = jest.fn(async (_sql: string, _params?: any[]) => []);
  const dataSource = { query } as any;
  const registry = new ToolsRegistry(dataSource);
  return { registry, query };
}

const FUTURE = '2030-01-02T08:00:00+08:00';

describe('ToolsRegistry', () => {
  it('注册了第一批 4 个工具', () => {
    const { registry } = makeRegistry();
    const names = registry.list().map((t) => t.name).sort();
    expect(names).toEqual(
      ['create_reminder', 'generate_weekly_diet_plan', 'personalize_diet_plan', 'read_health_profile'].sort(),
    );
  });

  it('openAiTools 输出 function calling 结构（含 JSON Schema）', () => {
    const { registry } = makeRegistry();
    const defs = registry.openAiTools();
    expect(defs).toHaveLength(4);
    for (const d of defs) {
      expect(d.type).toBe('function');
      expect(typeof d.function.name).toBe('string');
      expect(typeof d.function.description).toBe('string');
      expect(d.function.parameters).toHaveProperty('type', 'object');
    }
    const reminder = defs.find((d) => d.function.name === 'create_reminder')!;
    expect(reminder.function.parameters.required).toEqual(['title', 'remind_at']);
  });

  it('正常 tool call: create_reminder 真实写入并返回可复核结果', async () => {
    const { registry, query } = makeRegistry();
    const res = await registry.execute(
      'create_reminder',
      { title: '测血压', remind_at: FUTURE, repeat: 'daily' },
      { userId: 'u1' },
    );
    expect(res.ok).toBe(true);
    expect(res.summary).toContain('已创建提醒');
    expect(res.summary).toContain('测血压');
    expect(res.data?.id).toBeTruthy();
    const insert = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO reminders'));
    expect(insert).toBeTruthy();
    const params = insert![1] as any[];
    expect(params[1]).toBe('u1');
  });

  it('参数缺失: 校验失败且不执行（无 DB 写入）', async () => {
    const { registry, query } = makeRegistry();
    const res = await registry.execute('create_reminder', { title: '测血压' }, { userId: 'u1' });
    expect(res.ok).toBe(false);
    expect(res.validationErrors?.join(' ')).toContain('remind_at');
    expect(query).not.toHaveBeenCalled();
  });

  it('参数非法: 时间格式错误 → 校验失败且不执行', async () => {
    const { registry, query } = makeRegistry();
    const res = await registry.execute(
      'create_reminder',
      { title: '测血压', remind_at: '明天早上' },
      { userId: 'u1' },
    );
    expect(res.ok).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it('工具执行失败: 过去时间 → ok=false，错误如实返回', async () => {
    const { registry } = makeRegistry();
    const res = await registry.execute(
      'create_reminder',
      { title: '测血压', remind_at: '2020-01-01T08:00:00+08:00' },
      { userId: 'u1' },
    );
    expect(res.ok).toBe(false);
    expect(res.error).toContain('过去');
    expect(res.summary).toContain('操作未能完成');
  });

  it('执行异常被捕获为 ok=false（不抛出、不伪装成功）', async () => {
    const { registry } = makeRegistry();
    const spy = jest
      .spyOn(registry.get('read_health_profile')!, 'execute')
      .mockRejectedValueOnce(new Error('boom'));
    const res = await registry.execute('read_health_profile', {}, { userId: 'u1', profile: { step1: { name: 'x' } } });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('boom');
    spy.mockRestore();
  });

  it('未知工具 → ok=false', async () => {
    const { registry, query } = makeRegistry();
    const res = await registry.execute('do_magic', {}, { userId: 'u1' });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('未知工具');
    expect(query).not.toHaveBeenCalled();
  });

  it('read_health_profile: 有档案返回事实；无档案 ok=false', async () => {
    const { registry } = makeRegistry();
    const ok = await registry.execute(
      'read_health_profile',
      {},
      {
        userId: 'u1',
        profile: {
          step1: { name: '张三' },
          step2a: { diseases: ['高血压'] },
          step2b: { allergies: ['花生'] },
          step2c: { medications: ['硝苯地平'] },
        },
      },
    );
    expect(ok.ok).toBe(true);
    expect(ok.summary).toContain('张三');
    expect(ok.summary).toContain('高血压');

    const missing = await registry.execute('read_health_profile', {}, { userId: 'u2', profile: null });
    expect(missing.ok).toBe(false);
    expect(missing.error).toContain('档案');
  });

  it('generate_weekly_diet_plan: 正常生成 7 天低盐计划', async () => {
    const { registry } = makeRegistry();
    const res = await registry.execute(
      'generate_weekly_diet_plan',
      { focus: 'low_salt' },
      { userId: 'u1', profile: null },
    );
    expect(res.ok).toBe(true);
    expect(res.data?.days).toBe(7);
    expect((res.data?.plan as any[]).length).toBe(7);
    expect(res.summary).toContain('低盐');
  });

  it('personalize_diet_plan: 无档案 → 执行失败（不编造个性化结果）', async () => {
    const { registry } = makeRegistry();
    const res = await registry.execute('personalize_diet_plan', { focus: 'low_salt' }, { userId: 'u1', profile: null });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('档案');
  });
});
