/**
 * 饮食计划工具（Task 5）
 * - generate_weekly_diet_plan: 生成 7 天健康/低盐饮食计划
 * - personalize_diet_plan: 根据用户档案与忌口个性化调整计划
 *
 * 纯确定性生成（不依赖 LLM），保证"执行结果真实存在、可复核"。
 */
import { ToolDefinition, ToolContext, ToolExecOutcome } from './tool.types';

export type DietFocus = 'low_salt' | 'low_sugar' | 'balanced';

const FOCUS_LABEL: Record<DietFocus, string> = {
  low_salt: '低盐饮食',
  low_sugar: '低糖饮食',
  balanced: '均衡膳食',
};

/** 三餐轮换模板（低盐/低糖/均衡），全部为日常可执行的家常搭配 */
const MEALS: Record<DietFocus, Array<{ breakfast: string; lunch: string; dinner: string; snack: string }>> = {
  low_salt: [
    { breakfast: '燕麦粥、水煮蛋、凉拌黄瓜', lunch: '杂粮饭、清蒸鲈鱼、白灼西兰花', dinner: '小米粥、香菇鸡胸肉、蒜蓉菠菜', snack: '无糖酸奶、苹果' },
    { breakfast: '全麦馒头、低脂牛奶、番茄', lunch: '糙米饭、清炖鸡腿（去皮）、清炒时蔬', dinner: '山药粥、清蒸豆腐、凉拌木耳', snack: '原味坚果一小把' },
    { breakfast: '玉米、无糖豆浆、水煮蛋', lunch: '荞麦面、白灼虾、蒜蓉菜心', dinner: '红薯、清蒸鳕鱼、上汤娃娃菜', snack: '圣女果、梨' },
    { breakfast: '杂粮粥、鸡蛋羹、拌菠菜', lunch: '藜麦饭、清蒸鸡胸、清炒芦笋', dinner: '南瓜粥、清炖瘦肉、凉拌海带（少盐）', snack: '无糖酸奶' },
  ],
  low_sugar: [
    { breakfast: '燕麦粥、水煮蛋、黄瓜', lunch: '杂粮饭（小碗）、清蒸鱼、清炒西兰花', dinner: '荞麦面、豆腐、凉拌菠菜', snack: '原味坚果、青苹果' },
    { breakfast: '全麦面包、无糖豆浆、番茄', lunch: '糙米饭（小碗）、鸡胸肉、蒜蓉菜心', dinner: '玉米、清蒸虾、上汤时蔬', snack: '无糖酸奶' },
    { breakfast: '山药、鸡蛋、拌木耳', lunch: '荞麦饭（小碗）、清炖鱼、清炒芥蓝', dinner: '冬瓜汤、瘦肉、凉拌黄瓜', snack: '圣女果' },
    { breakfast: '杂粮馒头、低脂奶、水煮蛋', lunch: '藜麦饭（小碗）、清蒸鸡腿、清炒油麦菜', dinner: '魔芋面、清蒸豆腐、蒜蓉生菜', snack: '柚子两瓣' },
  ],
  balanced: [
    { breakfast: '牛奶、全麦面包、鸡蛋、苹果', lunch: '米饭、红烧鸡腿、清炒时蔬、紫菜汤', dinner: '杂粮粥、清蒸鱼、凉拌西兰花', snack: '酸奶、核桃' },
    { breakfast: '豆浆、菜肉包、水煮蛋', lunch: '米饭、番茄牛腩、蒜蓉油麦菜', dinner: '小米粥、虾仁蒸蛋、清炒芦笋', snack: '香蕉' },
    { breakfast: '燕麦牛奶、鸡蛋、橙子', lunch: '米饭、清蒸鲈鱼、香菇油菜', dinner: '红薯粥、鸡胸肉沙拉、上汤娃娃菜', snack: '无糖酸奶' },
    { breakfast: '玉米、鸡蛋、无糖豆浆', lunch: '杂粮饭、清炖排骨（去油）、清炒菜心', dinner: '荞麦面、豆腐、凉拌菠菜', snack: '梨' },
  ],
};

function asStringList(value: any): string[] {
  if (!value) return [];
  const arr = Array.isArray(value) ? value : [value];
  return arr
    .map((v) => (typeof v === 'string' ? v : v?.name || ''))
    .map((s: string) => String(s).trim())
    .filter(Boolean);
}

/** 从档案 profile_data 中提取疾病 / 过敏 / 用药 */
export function extractProfileFacts(profile: Record<string, any> | null | undefined): {
  name: string;
  diseases: string[];
  allergies: string[];
  medications: string[];
} {
  const pd = (profile || {}) as Record<string, any>;
  const step1 = pd.step1 || {};
  const step2a = pd.step2a || {};
  const step2b = pd.step2b || {};
  const step2c = pd.step2c || {};
  return {
    name: String(step1.name || '').trim(),
    diseases: asStringList(step2a.diseases),
    allergies: asStringList(step2b.allergies),
    medications: asStringList(step2c.medications),
  };
}

export interface WeeklyPlan {
  focus: DietFocus;
  focusLabel: string;
  days: number;
  plan: Array<{ day: number; breakfast: string; lunch: string; dinner: string; snack: string }>;
  notes: string[];
  restrictions: string[];
}

/** 生成 N 天计划（days ≤ 7；模板按天数循环） */
export function buildWeeklyDietPlan(
  focus: DietFocus,
  days: number,
  profile: Record<string, any> | null | undefined,
  restrictions: string[] = [],
): WeeklyPlan {
  // 未提供天数 → 默认 7；提供了但越界 → 夹紧到 [1,7]
  const safeDays = Number.isFinite(days)
    ? Math.min(Math.max(Math.trunc(days), 1), 7)
    : 7;
  const template = MEALS[focus] || MEALS.balanced;
  const facts = extractProfileFacts(profile);

  const plan = Array.from({ length: safeDays }, (_, i) => ({
    day: i + 1,
    ...template[i % template.length],
  }));

  const notes: string[] = [];
  if (focus === 'low_salt') {
    notes.push('全天食盐不超过 5 克（约一啤酒瓶盖），警惕酱油、咸菜、火腿等隐形盐');
  } else if (focus === 'low_sugar') {
    notes.push('主食定量、优先全谷物，避免含糖饮料与甜点；进餐顺序先菜后肉再主食');
  } else {
    notes.push('食物多样、荤素搭配，餐餐有蔬菜、天天有水果');
  }

  if (facts.diseases.some((d) => d.includes('高血压'))) {
    notes.push('档案提示有高血压：优先低盐做法，多选富钾蔬果（如菠菜、香蕉），并遵医嘱监测血压');
  }
  if (facts.diseases.some((d) => d.includes('糖尿病'))) {
    notes.push('档案提示有糖尿病：主食粗细搭配并控制总量，定时定量进餐，餐后适度活动');
  }
  if (facts.allergies.length) {
    notes.push(`已避开档案中的过敏食材：${facts.allergies.join('、')}`);
  }
  if (facts.medications.length) {
    notes.push('正在用药：计划不替代治疗，饮食调整请与医生或健康顾问确认');
  }
  notes.push('涉及用药与治疗请咨询健康顾问');

  return {
    focus,
    focusLabel: FOCUS_LABEL[focus] || FOCUS_LABEL.balanced,
    days: safeDays,
    plan,
    notes,
    restrictions: [...restrictions, ...facts.allergies],
  };
}

export function createDietPlanTools(): ToolDefinition[] {
  const generate: ToolDefinition = {
    name: 'generate_weekly_diet_plan',
    description:
      '生成 N 天（默认7天）的健康饮食计划。当用户要求制定/生成饮食计划、食谱、一周餐单时调用。',
    parameters: {
      type: 'object',
      properties: {
        focus: {
          type: 'string',
          enum: ['low_salt', 'low_sugar', 'balanced'],
          description: '计划重点：low_salt 低盐 / low_sugar 低糖 / balanced 均衡',
        },
        days: {
          type: 'integer',
          minimum: 1,
          maximum: 7,
          description: '计划天数，默认 7',
        },
      },
      required: ['focus'],
    },
    async execute(_ctx: ToolContext, args): Promise<ToolExecOutcome> {
      const focus = args.focus as DietFocus;
      const days = typeof args.days === 'number' ? args.days : 7;
      const plan = buildWeeklyDietPlan(focus, days, _ctx.profile ?? null);
      return {
        summary: `已生成 ${plan.days} 天${plan.focusLabel}计划（每餐具体搭配见结构化结果）。${plan.notes[0]}`,
        data: { tool: 'generate_weekly_diet_plan', ...plan } as any,
      };
    },
  };

  const personalize: ToolDefinition = {
    name: 'personalize_diet_plan',
    description:
      '根据用户健康档案（疾病/过敏/用药）与忌口，对饮食计划做个性化调整。当用户要求"按我的档案/病情/忌口调整计划"时调用。',
    parameters: {
      type: 'object',
      properties: {
        focus: {
          type: 'string',
          enum: ['low_salt', 'low_sugar', 'balanced'],
          description: '计划重点',
        },
        restrictions: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 10,
          description: '需要规避的食材/忌口（可选）',
        },
        days: { type: 'integer', minimum: 1, maximum: 7 },
      },
      required: ['focus'],
    },
    async execute(ctx: ToolContext, args): Promise<ToolExecOutcome> {
      const focus = args.focus as DietFocus;
      const days = typeof args.days === 'number' ? args.days : 7;
      const restrictions = Array.isArray(args.restrictions) ? args.restrictions.map(String) : [];
      const facts = extractProfileFacts(ctx.profile ?? null);
      if (!ctx.profile) {
        throw new Error('未找到你的健康档案，请先完成建档后再做个性化调整');
      }
      const plan = buildWeeklyDietPlan(focus, days, ctx.profile, restrictions);
      const factLine = [
        facts.diseases.length ? `疾病：${facts.diseases.join('、')}` : '',
        facts.allergies.length ? `过敏：${facts.allergies.join('、')}` : '',
      ].filter(Boolean).join('；');
      return {
        summary: `已按你的档案完成个性化调整（${plan.focusLabel}${factLine ? '；' + factLine : ''}）。${plan.notes.slice(-3).join('；')}`,
        data: { tool: 'personalize_diet_plan', ...plan } as any,
      };
    },
  };

  return [generate, personalize];
}
