import { useState, useEffect } from 'react';
import { getMyAdvisor, type AdvisorResult } from '../services/user';
import type { PresetProfile } from '../presetProfile';

interface Props {
  profile: PresetProfile;
  onBack: () => void;
}

export default function AdvisorCard({ profile, onBack }: Props) {
  const [advisor, setAdvisor] = useState<AdvisorResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyAdvisor().then(r => { setAdvisor(r); setLoading(false); });
  }, []);

  if (loading) return <div className="ac-loading">🔄 匹配顾问中…</div>;

  if (!advisor) return (
    <div className="ac-empty">
      <span>📋</span>
      <p>请先完成健康档案，系统将自动为你匹配专属顾问</p>
      <button className="ac-back-btn" onClick={onBack}>← 返回</button>
    </div>
  );

  const a = advisor.advisor;

  return (
    <div className="ac-page">
      <button className="ac-back-btn" onClick={onBack}>← 返回</button>

      <div className="ac-hero">
        <div className="ac-avatar">👨‍⚕️</div>
        <h2 className="ac-name">{a.name}</h2>
        <div className="ac-title">{a.title}</div>
        <div className="ac-score">
          匹配度 {advisor.matchScore}%
          <span className="ac-bar"><span className="ac-fill" style={{ width: `${advisor.matchScore}%` }} /></span>
        </div>
      </div>

      <div className="ac-body">
        <div className="ac-card">
          <h4>基本信息</h4>
          <div className="ac-row"><span>姓名</span><span>{a.name}</span></div>
          <div className="ac-row"><span>职称</span><span>{a.title}</span></div>
          <div className="ac-row"><span>从业年限</span><span>{a.yearsOfExperience} 年</span></div>
        </div>

        <div className="ac-card">
          <h4>专长领域</h4>
          <div className="ac-tags">
            {a.specialties.map((s, i) => <span key={i} className="ac-tag">{s}</span>)}
          </div>
          {profile.diseases.length > 0 && (
            <div className="ac-match-note">
              💡 你患有 <strong>{profile.diseases.join('、')}</strong>，该顾问专长与你匹配
            </div>
          )}
        </div>

        <div className="ac-card">
          <h4>欢迎语</h4>
          <p className="ac-greeting">{a.greeting}</p>
          <p className="ac-matched-at">匹配时间: {new Date(advisor.matchedAt).toLocaleString('zh-CN')}</p>
        </div>
      </div>
    </div>
  );
}
