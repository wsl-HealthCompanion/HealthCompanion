import { buildWeeklyDietPlan, extractProfileFacts, createDietPlanTools } from './diet-plan.tool';
import { ToolContext } from './tool.types';

const PROFILE = {
  step1: { name: '张三' },
  step2a: { diseases: ['高血压', '糖尿病'] },
  step2b: { allergies: ['花生'] },
  step2c: { medications: ['硝苯地平'] },
};

describe('diet-plan 工具', () => {
  it('extractProfileFacts 兼容字符串与对象数组', () => {
    const facts = extractProfileFacts({
      step1: { name: '李四' },
      step2a: { diseases: [{ name: '高血压' }, '糖尿病'] },
      step2b: { allergies: ['海鲜'] },
      step2c: { medications: [{ name: '阿司匹林' }] },
    });
    expect(facts.name).toBe('李四');
    expect(facts.diseases).toEqual(['高血压', '糖尿病']);
    expect(facts.allergies).toEqual(['海鲜']);
    expect(facts.medications).toEqual(['阿司匹林']);
  });

  it('buildWeeklyDietPlan: 7 天低盐 + 档案个性化要点', () => {
    const plan = buildWeeklyDietPlan('low_salt', 7, PROFILE);
    expect(plan.days).toBe(7);
    expect(plan.plan).toHaveLength(7);
    expect(plan.plan[0].day).toBe(1);
    expect(plan.plan[0].breakfast).toBeTruthy();
    expect(plan.notes.join(' ')).toContain('5 克');
    expect(plan.notes.join(' ')).toContain('高血压');
    expect(plan.notes.join(' ')).toContain('糖尿病');
    expect(plan.notes.join(' ')).toContain('花生');
    //  аллер原进入 restrictions
    expect(plan.restrictions).toContain('花生');
  });

  it('buildWeeklyDietPlan: days 边界（0 → 1；9 → 7）', () => {
    expect(buildWeeklyDietPlan('balanced', 0, null).days).toBe(1);
    expect(buildWeeklyDietPlan('balanced', 9, null).days).toBe(7);
  });

  it('generate 工具: focus 缺省时使用 balanced（schema 层会拦截，工具本身不崩）', async () => {
    const [generate] = createDietPlanTools();
    const out = await generate.execute({ userId: 'u1' }, { focus: 'balanced', days: 3 });
    expect(out.summary).toContain('3 天');
    expect(out.data?.days).toBe(3);
  });

  it('personalize 工具: 无档案抛错（不伪造个性化）', async () => {
    const tools = createDietPlanTools();
    const personalize = tools.find((t) => t.name === 'personalize_diet_plan')!;
    await expect(personalize.execute({ userId: 'u1', profile: null } as ToolContext, { focus: 'low_salt' })).rejects.toThrow(
      /档案/,
    );
  });

  it('personalize 工具: 有档案时返回个性化调整摘要', async () => {
    const tools = createDietPlanTools();
    const personalize = tools.find((t) => t.name === 'personalize_diet_plan')!;
    const out = await personalize.execute(
      { userId: 'u1', profile: PROFILE } as ToolContext,
      { focus: 'low_salt', restrictions: ['腌制食品'] },
    );
    expect(out.summary).toContain('个性化');
    expect(out.data?.restrictions).toEqual(expect.arrayContaining(['腌制食品', '花生']));
  });
});
