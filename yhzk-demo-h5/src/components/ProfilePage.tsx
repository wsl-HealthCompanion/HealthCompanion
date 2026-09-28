import { useState } from 'react';
import type { PresetProfile } from '../presetProfile';
import AdvisorCard from './AdvisorCard';
import { triggerAdvisorMatch, saveProfileToBackend, getMyAdvisor } from '../services/user';

interface Props {
  profile: PresetProfile;
  onEdit: () => void;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pp-card">
      <h4 className="pp-card-title">{title}</h4>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="pp-row">
      <span className="pp-k">{label}</span>
      <span className="pp-v">{value || '-'}</span>
    </div>
  );
}

export default function ProfilePage({ profile, onEdit }: Props) {
  const [showAdvisor, setShowAdvisor] = useState(false);
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState('');
  const handleViewAdvisor = async () => {
    setMatching(true); setError('');
    try {
      let advisor = await getMyAdvisor();
      if (!advisor) {
        // 只在档案完整（step1有姓名）时才同步+匹配，否则提示用户先建档
        const pd: any = profile.profileData || {};
        if (!pd?.step1?.name || pd.step1.name === '张伯') {
          setError('请先完善健康档案');
          setMatching(false);
          return;
        }
        await saveProfileToBackend(pd);
        await triggerAdvisorMatch();
        advisor = await getMyAdvisor();
      }
      if (advisor) setShowAdvisor(true);
      else setError('匹配失败，请重试');
    } catch {
      setError('服务不可用，请稍后重试');
    }
    setMatching(false);
  };

  if (showAdvisor) return <AdvisorCard profile={profile} onBack={() => setShowAdvisor(false)} />;
  const pd: any = profile.profileData || {};
  const s1: any = pd.step1 || {};
  const s2a: any = pd.step2a || {};
  const s2b: any = pd.step2b || {};
  const s2c: any = pd.step2c || {};
  const s2d: any = pd.step2d || {};
  const s3a: any = pd.step3a || {};
  const s3b: any = pd.step3b || {};
  const s3c: any = pd.step3c || {};
  const s4: any = pd.step4 || {};

  const names = (arr: any[] | undefined) =>
    arr?.map((x: any) => typeof x === 'string' ? x : x?.name || '').filter(Boolean).join('、') || '-';

  const age = s1.birthDate
    ? Math.floor((Date.now() - new Date(s1.birthDate).getTime()) / (365.25 * 24 * 3600 * 1000))
    : profile.age;

  const bmi = s1.height && s1.weight
    ? ((Number(s1.weight) / ((Number(s1.height) / 100) ** 2))).toFixed(1)
    : '';

  return (
    <div className="pp-page">
      <div className="pp-top">
        <div className="pp-avatar">👤</div>
        <div className="pp-top-info">
          <div className="pp-name">{profile.name || '用户'}</div>
          <div className="pp-meta">
            {s1.gender === 'male' ? '男' : '女'} · {age}岁
            {bmi && ` · BMI ${bmi}`}
          </div>
        </div>
        <button className="pp-edit-btn" onClick={onEdit}>✏️ 编辑档案</button>
{error && <div style={{padding:'8px 14px',background:'#FFF0F0',color:'#D32F2F',fontSize:'13px',borderRadius:'8px',marginTop:'8px'}}>{error}</div>}
        <button className="pp-advisor-btn" onClick={handleViewAdvisor} disabled={matching}>
          {matching ? '加载中…' : '👨‍⚕️ 查看顾问'}
        </button>
      </div>

      <div className="pp-body">
        <Card title="基本信息">
          <Row label="姓名"    value={s1.name || profile.name} />
          <Row label="性别"    value={s1.gender === 'male' ? '男' : s1.gender === 'female' ? '女' : '-'} />
          <Row label="出生日期" value={s1.birthDate ? `${s1.birthDate}（${age}岁）` : '-'} />
          <Row label="身高"    value={s1.height ? `${s1.height} cm` : '-'} />
          <Row label="体重"    value={s1.weight ? `${s1.weight} kg` : '-'} />
        </Card>

        <Card title="病史">
          <Row label="慢性病" value={s2a.noHistory ? '无' : names(s2a.diseases) || '无'} />
          <Row label="过敏史" value={s2b.noAllergy ? '无' : names(s2b.allergies) || '无'} />
          <Row label="用药"   value={s2c.noMeds ? '无' : names(s2c.medications) || '无'} />
          <Row label="家族病史" value={names(s2d.familyDiseases)} />
        </Card>

        <Card title="生活方式">
          <Row label="饮食偏好" value={names(s3a.dietPrefs)} />
          <Row label="运动频率" value={s3b.exerciseFreq || '-'} />
          <Row label="运动方式" value={names(s3b.exerciseTypes)} />
          <Row label="运动时长" value={s3b.duration ? `${s3b.duration} 分钟` : '-'} />
          <Row label="入睡时间" value={s3c.bedTime || '-'} />
          <Row label="起床时间" value={s3c.wakeTime || '-'} />
          <Row label="睡眠质量" value={s3c.sleepQuality || '-'} />
          <Row label="吸烟"     value={s3c.smokeStatus || '-'} />
          <Row label="饮酒"     value={s3c.drinkStatus || '-'} />
        </Card>

        <Card title="健康目标">
          <Row label="目标" value={names(s4.goals)} />
        </Card>

        <Card title="健康监测">
          <div className="pp-monitor-row">
            <button className="pp-monitor-btn" disabled title="连接外源血压计（开发中）">🩺 血压监测</button>
            <button className="pp-monitor-btn" disabled title="连接外源血糖仪（开发中）">🩸 血糖监测</button>
          </div>
        </Card>
      </div>
    </div>
  );
}
