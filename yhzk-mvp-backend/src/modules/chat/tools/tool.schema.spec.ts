import { validateAgainstSchema } from './tool.schema';
import { JsonSchema } from './tool.types';

describe('tool.schema 参数校验器', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 5 },
      remind_at: { type: 'string', format: 'date-time' },
      repeat: { type: 'string', enum: ['none', 'daily'] },
      days: { type: 'integer', minimum: 1, maximum: 7 },
      list: { type: 'array', items: { type: 'string' }, maxItems: 2 },
    },
    required: ['title', 'remind_at'],
  };

  it('合法参数通过', () => {
    const r = validateAgainstSchema(schema, {
      title: '测血压',
      remind_at: '2026-09-30T08:00:00+08:00',
      repeat: 'daily',
      days: 7,
      list: ['a', 'b'],
    });
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('缺失必填参数 → 字段级错误', () => {
    const r = validateAgainstSchema(schema, { title: '测血压' });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('remind_at');
    expect(r.errors.join(' ')).toContain('缺失必填');
  });

  it('类型错误', () => {
    const r = validateAgainstSchema(schema, { title: 'x', remind_at: 123 });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('必须是字符串');
  });

  it('枚举非法', () => {
    const r = validateAgainstSchema(schema, { title: 'x', remind_at: '2026-09-30T08:00', repeat: 'hourly' });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('none / daily');
  });

  it('时间格式非法', () => {
    const r = validateAgainstSchema(schema, { title: 'x', remind_at: '明天早上八点' });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('ISO 8601');
  });

  it('整数范围（days=9 超上限）', () => {
    const r = validateAgainstSchema(schema, { title: 'x', remind_at: '2026-09-30T08:00:00Z', days: 9 });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('不能大于 7');
  });

  it('数组超限与元素类型', () => {
    const r = validateAgainstSchema(schema, { title: 'x', remind_at: '2026-09-30T08:00:00Z', list: ['a', 'b', 'c'] });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('最多 2 项');
  });

  it('空对象 schema（无参数工具）通过', () => {
    const r = validateAgainstSchema({ type: 'object', properties: {} }, {});
    expect(r.ok).toBe(true);
  });
});
