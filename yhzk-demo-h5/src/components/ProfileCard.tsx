import { useState } from 'react';
import type { PresetProfile } from '../presetProfile';

interface Props {
  open: boolean;
  profile: PresetProfile;
  onClose: () => void;
  onSave: (p: PresetProfile) => void;
  onReonboard?: () => void; // 重新打开完整10步建档
}

/** 把 PresetProfile 的字段转成 profileData（后端期望格式） */
function buildProfileData(p: PresetProfile): Record<string, any> {
  // 根据年龄估算生日
  const birthYear = new Date().getFullYear() - p.age;
  const birthDate = `${birthYear}-01-01`;
  return {
    step1: { name: p.name, gender: p.gender, birthDate, height: 170, weight: 65 },
    step2a: { diseases: p.diseases.map(d => ({ name: d })) },
    step2c: { medications: p.medications.map(m => ({ name: m })) },
    step2b: { allergies: p.allergies.map(a => ({ name: a })) },
    step3b: { exerciseFreq: '适量运动' },
    step3c: { sleepHours: '睡眠一般' },
  };
}

export default function ProfileCard({ open, profile, onClose, onSave, onReonboard }: Props) {
  const [editing, setEditing] = useState(false);

  // 编辑用的临时 state
  const [form, setForm] = useState({
    name: profile.name,
    age: String(profile.age),
    gender: profile.gender as 'male' | 'female',
    diseases: profile.diseases.join('、'),
    medications: profile.medications.join('、'),
    allergies: profile.allergies.join('、'),
  });

  if (!open) return null;

  const handleEdit = () => {
    setForm({
      name: profile.name,
      age: String(profile.age),
      gender: profile.gender,
      diseases: profile.diseases.join('、'),
      medications: profile.medications.join('、'),
      allergies: profile.allergies.join('、'),
    });
    setEditing(true);
  };

  const handleSave = () => {
    const splitItems = (s: string) =>
      s.split(/[，,、；;\/]+/).map(x => x.trim()).filter(Boolean);

    const updated: PresetProfile = {
      name: form.name.trim() || '用户',
      age: Math.max(1, Math.min(120, Number(form.age) || 30)),
      gender: form.gender,
      diseases: splitItems(form.diseases),
      medications: splitItems(form.medications),
      allergies: splitItems(form.allergies),
      profileData: {},
    };
    updated.profileData = buildProfileData(updated);
    onSave(updated);
    setEditing(false);
  };

  const handleCancel = () => setEditing(false);

  const p = profile;

  return (
    <>
      <div className="profile-mask" onClick={editing ? undefined : onClose} />
      <div className="profile-card">
        {/* ── 查看模式 ── */}
        {!editing && (
          <>
            <div className="profile-head">
              <div className="profile-avatar">👤</div>
              <div>
                <div className="profile-name">{p.name}</div>
                <div className="profile-meta">
                  {p.age}岁 · {p.gender === 'male' ? '男' : '女'}
                </div>
              </div>
            </div>
            <div className="profile-divider" />
            <div className="profile-row">
              <span className="k">慢性病</span>
              <span className="v">{p.diseases.length ? p.diseases.join('、') : '无'}</span>
            </div>
            <div className="profile-row">
              <span className="k">在服药</span>
              <span className="v">{p.medications.length ? p.medications.join('、') : '无'}</span>
            </div>
            {p.allergies.length > 0 && (
              <div className="profile-row">
                <span className="k">过敏</span>
                <span className="v">{p.allergies.join('、')}</span>
              </div>
            )}
            <div className="profile-divider" />
            <div className="profile-note">数字人的回答会结合这份档案</div>
            <div className="profile-actions">
              <button className="profile-edit-btn" onClick={handleEdit}>✏️ 快速修改</button>
              {onReonboard && (
                <button className="profile-reonboard-btn" onClick={onReonboard}>📋 完整建档</button>
              )}
              <button className="profile-close" onClick={onClose}>关闭</button>
            </div>
          </>
        )}

        {/* ── 编辑模式 ── */}
        {editing && (
          <>
            <div className="profile-edit-title">修改健康档案</div>
            <div className="profile-divider" />

            <div className="profile-field">
              <label>姓名</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="请输入姓名"
              />
            </div>

            <div className="profile-field profile-field-row">
              <div className="profile-field-half">
                <label>年龄</label>
                <input
                  type="number"
                  min={1} max={120}
                  value={form.age}
                  onChange={e => setForm(f => ({ ...f, age: e.target.value }))}
                />
              </div>
              <div className="profile-field-half">
                <label>性别</label>
                <div className="profile-gender">
                  <button
                    className={form.gender === 'male' ? 'active' : ''}
                    onClick={() => setForm(f => ({ ...f, gender: 'male' }))}
                  >男</button>
                  <button
                    className={form.gender === 'female' ? 'active' : ''}
                    onClick={() => setForm(f => ({ ...f, gender: 'female' }))}
                  >女</button>
                </div>
              </div>
            </div>

            <div className="profile-field">
              <label>慢性病 <span className="hint">（多个用逗号隔开）</span></label>
              <input
                value={form.diseases}
                onChange={e => setForm(f => ({ ...f, diseases: e.target.value }))}
                placeholder="如：高血压、2型糖尿病"
              />
            </div>

            <div className="profile-field">
              <label>在服药 <span className="hint">（多个用逗号隔开）</span></label>
              <input
                value={form.medications}
                onChange={e => setForm(f => ({ ...f, medications: e.target.value }))}
                placeholder="如：硝苯地平、二甲双胍"
              />
            </div>

            <div className="profile-field">
              <label>过敏史 <span className="hint">（无则留空）</span></label>
              <input
                value={form.allergies}
                onChange={e => setForm(f => ({ ...f, allergies: e.target.value }))}
                placeholder="如：青霉素"
              />
            </div>

            <div className="profile-divider" />
            <div className="profile-actions">
              <button className="profile-save-btn" onClick={handleSave}>✅ 保存</button>
              <button className="profile-close" onClick={handleCancel}>取消</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
