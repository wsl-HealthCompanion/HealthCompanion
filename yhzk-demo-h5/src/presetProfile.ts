// ============================================================
// 预置虚拟身份 — 让数字人"懂你"，演示档案感知能力
// profileData 随每次 /chat 请求作为 profile 注入后端
// 结构对齐后端 profileToSummary 期望的 step1/step2a/step2c...
// ============================================================

export interface PresetProfile {
  name: string;
  gender: 'male' | 'female';
  age: number;
  diseases: string[];
  medications: string[];
  allergies: string[];
  profileData: Record<string, any>;
}

export const PRESET_PROFILE: PresetProfile = {
  name: '张伯',
  gender: 'male',
  age: 68,
  diseases: ['高血压', '2型糖尿病'],
  medications: ['硝苯地平', '二甲双胍'],
  allergies: [],
  profileData: {
    step1: { name: '张伯', gender: 'male', birthDate: '1957-05-20', height: 170, weight: 72 },
    step2a: { diseases: [{ name: '高血压' }, { name: '2型糖尿病' }] },
    step2c: { medications: [{ name: '硝苯地平' }, { name: '二甲双胍' }] },
    step3b: { exerciseFreq: '每天散步30分钟' },
    step3c: { sleepHours: '睡眠一般，易醒' },
  },
};

// 数字人开场问候 — 根据档案个性化
export function getGreeting(profile?: PresetProfile): string {
  const name = profile?.name || '';
  const hello = name ? `${name}，您好` : '您好';
  if (!profile?.diseases?.length) return `${hello}，有什么可以帮您？`;
  const d = profile.diseases.slice(0, 3).join('、');
  return `${hello}，我看到您有${d}的情况，可以直接问我。`;
}

// 基础引导问题 — 没有档案时显示
const BASE_QUESTIONS = [
  '你能帮我做什么？',
  '高血压平时要注意什么？',
  '糖尿病能吃水果吗？',
  '最近睡不好怎么办？',
];

// 根据用户档案生成引导问题
export function getPresetQuestions(profile?: PresetProfile): string[] {
  if (!profile?.diseases?.length) return BASE_QUESTIONS;

  const qs: string[] = [];
  const d = profile.diseases;

  if (d.some(x => x.includes('血压') || x.includes('高血压'))) {
    qs.push('我血压高了怎么办？');
    qs.push('血压多少算正常？');
  }
  if (d.some(x => x.includes('糖尿') || x.includes('血糖'))) {
    qs.push('糖尿病能吃什么水果？');
    qs.push('血糖控制在多少合适？');
  }
  if (d.some(x => x.includes('血脂') || x.includes('脂'))) {
    qs.push('高血脂饮食要注意什么？');
  }

  // 用药相关
  const meds = profile.medications || [];
  if (meds.length > 0) {
    qs.push(`我吃的${meds[0]}有什么副作用？`);
  }

  // 运动/睡眠
  const pd: any = profile.profileData || {};
  if (pd.step3c?.sleepIssues?.length || pd.step3c?.sleepQuality === '较差' || pd.step3c?.sleepQuality === '很差') {
    qs.push('怎么改善睡眠质量？');
  }

  // 补充通用问题
  qs.push('查看我的健康档案');
  qs.push('帮我做个饮食建议');

  return qs.slice(0, 5);
}
