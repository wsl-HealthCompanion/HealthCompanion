import { API_BASE, DEMO_TOKEN } from '../config';
import { getToken } from './auth';

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${getToken() || DEMO_TOKEN}`,
});

/** 从后端读取档案 */
export async function loadProfileFromBackend(): Promise<Record<string, any> | null> {
  try {
    const resp = await fetch(`${API_BASE}/onboarding/profile`, { headers: authHeaders() });
    const json = await resp.json();
    const data = json.data || json;
    // 只要档案中有真实数据就算（draft 也行）
    let pd = data.profileData;
    if (typeof pd === 'string') pd = JSON.parse(pd); // 后端返回的是 JSON 字符串
    if (pd && typeof pd === 'object' && !Array.isArray(pd)) {
      const hasData = Object.values(pd).some(
        (v: any) => v && typeof v === 'object' && Object.keys(v).length > 0
      );
      if (hasData) return pd;
    }
    return null;
  } catch { return null; }
}

/** 同步档案到后端 + 触发顾问匹配 */
export async function saveProfileToBackend(profileData: Record<string, any>) {
  try {
    const h = authHeaders();
    const steps = Object.entries(profileData || {});
    let saved = 0;
    for (const [stepKey, data] of steps) {
      const d: any = data || {};
      const resp = await fetch(`${API_BASE}/onboarding/profile/step/${stepKey}`, {
        method: 'PUT',
        headers: h,
        body: JSON.stringify({
          name: d.name, gender: d.gender, birthDate: d.birthDate,
          height: d.height ? Number(d.height) : undefined,
          weight: d.weight ? Number(d.weight) : undefined,
          diseases: d.diseases, allergies: d.allergies,
          medications: d.medications, extra: d,
        }),
      });
      if (resp.ok) saved++;
    }
    console.log(`[档案同步] 已保存 ${saved}/${steps.length} 步骤`);
    const submitResp = await fetch(`${API_BASE}/onboarding/profile/submit`, { method: 'POST', headers: h });
    console.log(`[档案同步] 提交结果: ${submitResp.ok ? '成功' : await submitResp.text()}`);
  } catch (e) { console.error('[档案同步] 失败:', e); }
}

/** 单独触发顾问匹配 */
export async function triggerAdvisorMatch() {
  try {
    await fetch(`${API_BASE}/onboarding/profile/submit`, { method: 'POST', headers: authHeaders() });
  } catch { /* ignore */ }
}

/** 获取匹配的顾问 */
export async function getMyAdvisor() {
  try {
    const resp = await fetch(`${API_BASE}/advisor/my`, { headers: authHeaders() });
    const json = await resp.json();
    if (json.code !== 0 && json.code !== undefined) return null;
    const result = (json.data || json) as AdvisorResult;
    if (!result?.advisor) return null;
    return result;
  } catch { return null; }
}

export interface AdvisorResult {
  advisor: { id: string; name: string; title: string; avatar: string; specialties: string[]; yearsOfExperience: number; greeting: string; qrCode: string; };
  matchedAt: string;
  matchScore: number;
}
