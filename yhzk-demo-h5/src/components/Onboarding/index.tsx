/**
 * 建档向导 — 10步健康档案录入
 * Step1→2a→2b→2c→2d(可跳过)→3a→3b→3c→4→5(完成)
 */
import { useState, useMemo } from 'react';
import type { PresetProfile } from '../../presetProfile';

// ── 常量 ──
const DISEASES = ['高血压','糖尿病','高血脂','冠心病','脑卒中','脂肪肝','慢性肾病','痛风','心律失常','甲减','COPD','肿瘤'];
const ALLERGIES = ['青霉素','头孢类','阿司匹林','磺胺类','花粉','海鲜','花生','芒果','尘螨','乳胶'];
const DIET_PREFS = ['清淡少油','低盐','低糖','素食','无麸质','高蛋白','地中海饮食','无特殊要求'];
const EXERCISE_TYPES = ['散步','慢跑','游泳','骑车','太极','广场舞','健身','其他'];
const EXERCISE_FREQ = ['从不','每周1-2次','每周3-4次','每周5次以上'];
const SLEEP_QUALITY = ['很好','较好','一般','较差','很差'];
const SLEEP_ISSUES = ['入睡困难','易醒','早醒','多梦','打鼾','无'];
const SMOKE = ['不吸烟','已戒烟','偶尔','每天'];
const DRINK = ['不喝酒','已戒酒','偶尔','每天'];
const GOALS = ['控制血压','控制血糖','减重','增强体质','改善睡眠','戒烟戒酒','改善饮食','康复训练','预防慢病'];
const FAMILY = ['高血压','糖尿病','心脏病','脑卒中','肿瘤','遗传性疾病'];

interface OData {
  step1: { name:string; gender:'male'|'female'|''; birthDate:string; height:string; weight:string; };
  step2a: { diseases:string[]; noHistory:boolean; };
  step2b: { allergies:string[]; noAllergy:boolean; };
  step2c: { medications:{id:number;name:string;dosage:string;frequency:string;}[]; noMeds:boolean; };
  step2d: { familyDiseases:string[]; noFamily:boolean; };
  step3a: { dietPrefs:string[]; };
  step3b: { exerciseFreq:string; exerciseTypes:string[]; duration:string; };
  step3c: { bedTime:string; wakeTime:string; sleepQuality:string; sleepIssues:string[]; smokeStatus:string; drinkStatus:string; };
  step4: { goals:string[]; };
}

let _mid = 0;
const mkid = () => ++_mid;

const INIT: OData = {
  step1:  { name:'', gender:'', birthDate:'', height:'', weight:'' },
  step2a: { diseases:[], noHistory:false },
  step2b: { allergies:[], noAllergy:false },
  step2c: { medications:[{id:mkid(),name:'',dosage:'',frequency:'每日1次'}], noMeds:false },
  step2d: { familyDiseases:[], noFamily:false },
  step3a: { dietPrefs:[] },
  step3b: { exerciseFreq:'', exerciseTypes:[], duration:'' },
  step3c: { bedTime:'23:00', wakeTime:'07:00', sleepQuality:'一般', sleepIssues:[], smokeStatus:'不吸烟', drinkStatus:'不喝酒' },
  step4:  { goals:[] },
};

interface Props {
  onComplete: (p: PresetProfile) => void;
  initialProfile?: PresetProfile;
  onClose?: () => void;
  closeLabel?: string;
}

/** 已有档案 → 向导数据（重新建档时预填） */
function profileToOData(p: PresetProfile): OData {
  const pd = p.profileData || {};
  const s1: any = pd.step1 || {};
  const s2a: any = pd.step2a || {};
  const s2b: any = pd.step2b || {};
  const s2c: any = pd.step2c || {};
  const s2d: any = pd.step2d || {};
  const s3a: any = pd.step3a || {};
  const s3b: any = pd.step3b || {};
  const s3c: any = pd.step3c || {};
  const s4: any = pd.step4 || {};
  const toStr = (v: any) => (v == null ? '' : String(v));
  const names = (arr: any[]) => arr?.map((x: any) => typeof x === 'string' ? x : x.name || '').filter(Boolean) ?? [];
  const meds = s2c.medications?.length
    ? s2c.medications.map((m: any) => ({
        id: mkid(),
        name: typeof m === 'string' ? m : m.name || '',
        dosage: m.dosage || '',
        frequency: m.frequency || '每日1次',
      }))
    : [{ id: mkid(), name: '', dosage: '', frequency: '每日1次' }];
  return {
    step1:  { name: s1.name || p.name || '', gender: (s1.gender || p.gender || 'male') as any, birthDate: s1.birthDate || '', height: toStr(s1.height || ''), weight: toStr(s1.weight || '') },
    step2a: { diseases: names(s2a.diseases), noHistory: s2a.noHistory || false },
    step2b: { allergies: names(s2b.allergies), noAllergy: s2b.noAllergy || false },
    step2c: { medications: meds, noMeds: s2c.noMeds || false },
    step2d: { familyDiseases: s2d.familyDiseases || [], noFamily: s2d.noFamily || false },
    step3a: { dietPrefs: s3a.dietPrefs || [] },
    step3b: { exerciseFreq: s3b.exerciseFreq || '', exerciseTypes: s3b.exerciseTypes || [], duration: toStr(s3b.duration || '') },
    step3c: { bedTime: s3c.bedTime || '23:00', wakeTime: s3c.wakeTime || '07:00', sleepQuality: s3c.sleepQuality || '一般', sleepIssues: s3c.sleepIssues || [], smokeStatus: s3c.smokeStatus || '不吸烟', drinkStatus: s3c.drinkStatus || '不喝酒' },
    step4:  { goals: s4.goals || [] },
  };
}

// ── 小工具 ──
const Tag = ({ label, sel, onClick, disabled }: { label:string; sel:boolean; onClick:()=>void; disabled?:boolean }) => (
  <button className={`ob-tag ${sel?'selected':''}`} onClick={onClick} disabled={disabled} type="button">
    {sel ? '✓ ' : ''}{label}
  </button>
);

function Progress({ cur }: { cur: number }) {
  const pct = Math.round((cur / 10) * 100);
  return (
    <div className="ob-progress-wrap">
      <div className="ob-progress">
        <div className="ob-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="ob-progress-text">{cur}/10 步 · {pct}%</span>
    </div>
  );
}

function StepHeader({ num, title, subtitle, onClose, closeLabel = '退出建档' }: {
  num: number;
  title: string;
  subtitle?: string;
  onClose?: () => void;
  closeLabel?: string;
}) {
  return (
    <div className="ob-header">
      {onClose && (
        <button className="ob-exit" onClick={onClose} type="button" title={closeLabel} aria-label={closeLabel}>✕</button>
      )}
      <div className="ob-header-row">
        <span className="ob-step-num">{num}</span>
        <span className="ob-step-info">第 {num}/10 步</span>
      </div>
      <h2 className="ob-title">{title}</h2>
      {subtitle && <p className="ob-subtitle">{subtitle}</p>}
      <Progress cur={num} />
    </div>
  );
}

// ── 底部按钮 ──
function Bottom({ onBack, onNext, nextLabel, backLabel }: {
  onBack?: ()=>void; onNext?: ()=>void; nextLabel?: string; backLabel?: string;
}) {
  return (
    <div className="ob-bottom">
      {onBack ? (
        <button className="ob-btn-back" onClick={onBack} type="button">{backLabel || '上一步'}</button>
      ) : <span />}
      {onNext && (
        <button className="ob-btn-next" onClick={onNext} type="button">{nextLabel || '下一步'}</button>
      )}
    </div>
  );
}

// ===== 主组件 =====
export default function Onboarding({ onComplete, initialProfile, onClose, closeLabel }: Props) {
  const [step, setStep] = useState(initialProfile ? 1 : 0); // 首次建档从欢迎页开始
  const [data, setData] = useState<OData>(() =>
    initialProfile ? profileToOData(initialProfile) : INIT
  );

  const upd = <K extends keyof OData>(key: K, val: Partial<OData[K]>) => {
    setData(prev => ({ ...prev, [key]: { ...prev[key], ...val } }));
  };

  const next = () => setStep(s => Math.min(10, s + 1));
  const back = () => setStep(s => Math.max(1, s - 1));

  const bmi = useMemo(() => {
    const h = Number(data.step1.height) / 100;
    const w = Number(data.step1.weight);
    if (h > 0 && w > 0) return (w / (h * h)).toFixed(1);
    return null;
  }, [data.step1.height, data.step1.weight]);

  const age = useMemo(() => {
    if (!data.step1.birthDate) return null;
    return Math.floor((Date.now() - new Date(data.step1.birthDate).getTime()) / (365.25*24*3600*1000));
  }, [data.step1.birthDate]);

  const toProfile = (): PresetProfile => ({
    name: data.step1.name || '用户',
    gender: (data.step1.gender || 'male') as 'male'|'female',
    age: age || 30,
    diseases: data.step2a.noHistory ? [] : data.step2a.diseases,
    medications: data.step2c.noMeds ? [] : data.step2c.medications.filter(m=>m.name).map(m=>m.name),
    allergies: data.step2b.noAllergy ? [] : data.step2b.allergies,
    profileData: {
      step1: { ...data.step1, height: Number(data.step1.height), weight: Number(data.step1.weight) },
      step2a: { diseases: data.step2a.diseases.map(d=>({name:d})), noHistory: data.step2a.noHistory },
      step2b: { allergies: data.step2b.allergies.map(a=>({name:a})), noAllergy: data.step2b.noAllergy },
      step2c: { medications: data.step2c.medications.filter(m=>m.name), noMeds: data.step2c.noMeds },
      step2d: data.step2d,
      step3a: data.step3a,
      step3b: { ...data.step3b },
      step3c: { ...data.step3c },
      step4: data.step4,
    },
  });

  // ===== Step 0: 欢迎引导 =====
  if (step === 0) return (
    <div className="ob-page" style={{ justifyContent: 'center' }}>
      <div className="ob-welcome">
        <div className="ob-welcome-icon">🏥</div>
        <h2 className="ob-welcome-title">为了让数字人更懂你</h2>
        <p className="ob-welcome-desc">请花 3 分钟完善健康档案</p>
        <div className="ob-welcome-steps">
          <span>基本信息 → 病史 → 用药</span>
          <span>→ 生活习惯 → 健康目标</span>
        </div>
        <button className="ob-welcome-btn" onClick={() => setStep(1)}>开始建档</button>
        {onClose && (
          <button className="ob-welcome-skip" onClick={onClose}>{closeLabel || '跳过，以后再说'}</button>
        )}
      </div>
    </div>
  );

  // ===== Step 1: 基本信息 =====
  if (step === 1) return (
    <div className="ob-page">
      <StepHeader onClose={onClose} closeLabel={closeLabel} num={1} title="基本信息" subtitle="让我们先认识一下你" />
      <div className="ob-body">
        <div className="ob-field">
          <label>姓名 *</label>
          <input value={data.step1.name} onChange={e => upd('step1',{name:e.target.value})} placeholder="请输入真实姓名" />
        </div>
        <div className="ob-field">
          <label>性别 *</label>
          <div className="ob-row">
            <Tag label="🚹 男" sel={data.step1.gender==='male'} onClick={()=>upd('step1',{gender:'male'})} />
            <Tag label="🚺 女" sel={data.step1.gender==='female'} onClick={()=>upd('step1',{gender:'female'})} />
          </div>
        </div>
        <div className="ob-field">
          <label>出生日期 *</label>
          <input type="date" value={data.step1.birthDate} onChange={e=>upd('step1',{birthDate:e.target.value})} max={new Date().toISOString().slice(0,10)} />
          {age !== null && age > 0 && <span className="ob-hint">年龄: {age} 岁</span>}
        </div>
        <div className="ob-field">
          <label>身高 (cm) *</label>
          <input type="number" value={data.step1.height} onChange={e=>upd('step1',{height:e.target.value})} placeholder="如 170" min={50} max={300} />
        </div>
        <div className="ob-field">
          <label>体重 (kg) *</label>
          <input type="number" value={data.step1.weight} onChange={e=>upd('step1',{weight:e.target.value})} placeholder="如 68" min={10} max={500} />
        </div>
        {bmi && (
          <div className="ob-card">
            <span className="ob-bmi-label">BMI 指数</span>
            <span className="ob-bmi-val">{bmi}</span>
          </div>
        )}
      </div>
      <Bottom onBack={back} onNext={next} />
    </div>
  );

  // ===== Step 2a: 既往病史 =====
  if (step === 2) return (
    <div className="ob-page">
      <StepHeader onClose={onClose} closeLabel={closeLabel} num={2} title="既往病史" subtitle="请选择或搜索你的既往病史" />
      <div className="ob-body">
        <div className="ob-field">
          <input className="ob-search" placeholder="🔍 搜索疾病..." onChange={_=>{}} />
        </div>
        <div className="ob-tags">
          {DISEASES.map(d => (
            <Tag key={d} label={d} sel={data.step2a.diseases.includes(d)} onClick={() => {
              const arr = data.step2a.diseases;
              upd('step2a',{diseases:arr.includes(d)?arr.filter(x=>x!==d):[...arr,d]});
            }} disabled={data.step2a.noHistory} />
          ))}
        </div>
        <div className="ob-field" style={{marginTop:16}}>
          <label>
            <input type="checkbox" checked={data.step2a.noHistory} onChange={() => {
              upd('step2a',{noHistory:!data.step2a.noHistory, diseases: data.step2a.noHistory?data.step2a.diseases:[]});
            }} />
            {' '}我没有任何既往病史
          </label>
        </div>
      </div>
      <Bottom onBack={back} onNext={next} />
    </div>
  );

  // ===== Step 2b: 过敏史 =====
  if (step === 3) return (
    <div className="ob-page">
      <StepHeader onClose={onClose} closeLabel={closeLabel} num={3} title="过敏史" subtitle="你对什么药物或物质过敏？" />
      <div className="ob-body">
        <div className="ob-tags">
          {ALLERGIES.map(a => (
            <Tag key={a} label={a} sel={data.step2b.allergies.includes(a)} onClick={() => {
              const arr = data.step2b.allergies;
              upd('step2b',{allergies:arr.includes(a)?arr.filter(x=>x!==a):[...arr,a]});
            }} disabled={data.step2b.noAllergy} />
          ))}
        </div>
        <div className="ob-field" style={{marginTop:16}}>
          <label>
            <input type="checkbox" checked={data.step2b.noAllergy} onChange={() => {
              upd('step2b',{noAllergy:!data.step2b.noAllergy, allergies: data.step2b.noAllergy?data.step2b.allergies:[]});
            }} />
            {' '}我没有任何过敏史
          </label>
        </div>
      </div>
      <Bottom onBack={back} onNext={next} />
    </div>
  );

  // ===== Step 2c: 当前用药 =====
  if (step === 4) return (
    <div className="ob-page">
      <StepHeader onClose={onClose} closeLabel={closeLabel} num={4} title="当前用药" subtitle="请添加正在服用的药物" />
      <div className="ob-body" style={{opacity:data.step2c.noMeds?0.4:1}}>
        {data.step2c.medications.map((m,i) => (
          <div className="ob-card" key={m.id} style={{marginBottom:10}}>
            <div className="ob-row" style={{gap:8}}>
              <input style={{flex:2}} value={m.name} onChange={e => {
                const arr = [...data.step2c.medications];
                arr[i] = {...arr[i], name: e.target.value};
                upd('step2c',{medications:arr});
              }} placeholder="药物名称" disabled={data.step2c.noMeds} />
              <input style={{flex:1}} value={m.dosage} onChange={e => {
                const arr = [...data.step2c.medications];
                arr[i] = {...arr[i], dosage: e.target.value};
                upd('step2c',{medications:arr});
              }} placeholder="剂量" disabled={data.step2c.noMeds} />
              <select value={m.frequency} onChange={e => {
                const arr = [...data.step2c.medications];
                arr[i] = {...arr[i], frequency: e.target.value};
                upd('step2c',{medications:arr});
              }} disabled={data.step2c.noMeds}>
                <option>每日1次</option><option>每日2次</option><option>每日3次</option><option>按需</option>
              </select>
            </div>
            {data.step2c.medications.length > 1 && (
              <button className="ob-btn-del" onClick={() => {
                upd('step2c',{medications: data.step2c.medications.filter((_,j)=>j!==i)});
              }} type="button">删除</button>
            )}
          </div>
        ))}
        <button className="ob-btn-add" onClick={() => {
          upd('step2c',{medications: [...data.step2c.medications, {id:mkid(),name:'',dosage:'',frequency:'每日1次'}]});
        }} type="button" disabled={data.step2c.noMeds}>+ 添加用药</button>
        <div className="ob-field" style={{marginTop:12}}>
          <label>
            <input type="checkbox" checked={data.step2c.noMeds} onChange={() => {
              upd('step2c',{noMeds:!data.step2c.noMeds});
            }} />
            {' '}当前没有在服用的药物
          </label>
        </div>
      </div>
      <Bottom onBack={back} onNext={next} />
    </div>
  );

  // ===== Step 2d: 家族病史(可跳过) =====
  if (step === 5) return (
    <div className="ob-page">
      <StepHeader onClose={onClose} closeLabel={closeLabel} num={5} title="家族病史" subtitle="直系亲属有无疾病？(可跳过)" />
      <div className="ob-body">
        <div className="ob-tags">
          {FAMILY.map(d => (
            <Tag key={d} label={d} sel={data.step2d.familyDiseases.includes(d)} onClick={() => {
              const arr = data.step2d.familyDiseases;
              upd('step2d',{familyDiseases:arr.includes(d)?arr.filter(x=>x!==d):[...arr,d]});
            }} disabled={data.step2d.noFamily} />
          ))}
        </div>
        <div className="ob-field" style={{marginTop:16}}>
          <label>
            <input type="checkbox" checked={data.step2d.noFamily} onChange={() => {
              upd('step2d',{noFamily:!data.step2d.noFamily, familyDiseases: data.step2d.noFamily?data.step2d.familyDiseases:[]});
            }} />
            {' '}无已知家族病史
          </label>
        </div>
      </div>
      <Bottom onBack={back} onNext={next} nextLabel="跳过 →" />
    </div>
  );

  // ===== Step 3a: 饮食偏好 =====
  if (step === 6) return (
    <div className="ob-page">
      <StepHeader onClose={onClose} closeLabel={closeLabel} num={6} title="饮食偏好" subtitle="你的饮食习惯是什么？" />
      <div className="ob-body">
        <div className="ob-tags">
          {DIET_PREFS.map(d => (
            <Tag key={d} label={d} sel={data.step3a.dietPrefs.includes(d)} onClick={() => {
              const arr = data.step3a.dietPrefs;
              upd('step3a',{dietPrefs:arr.includes(d)?arr.filter(x=>x!==d):[...arr,d]});
            }} />
          ))}
        </div>
      </div>
      <Bottom onBack={back} onNext={next} />
    </div>
  );

  // ===== Step 3b: 运动习惯 =====
  if (step === 7) return (
    <div className="ob-page">
      <StepHeader onClose={onClose} closeLabel={closeLabel} num={7} title="运动习惯" subtitle="你的运动频率和方式？" />
      <div className="ob-body">
        <div className="ob-field">
          <label>运动频率</label>
          <div className="ob-tags">
            {EXERCISE_FREQ.map(f => (
              <Tag key={f} label={f} sel={data.step3b.exerciseFreq===f} onClick={() => upd('step3b',{exerciseFreq:f})} />
            ))}
          </div>
        </div>
        <div className="ob-field">
          <label>运动方式（多选）</label>
          <div className="ob-tags">
            {EXERCISE_TYPES.map(t => (
              <Tag key={t} label={t} sel={data.step3b.exerciseTypes.includes(t)} onClick={() => {
                const arr = data.step3b.exerciseTypes;
                upd('step3b',{exerciseTypes:arr.includes(t)?arr.filter(x=>x!==t):[...arr,t]});
              }} />
            ))}
          </div>
        </div>
        <div className="ob-field">
          <label>每次运动时长 (分钟)</label>
          <input type="number" value={data.step3b.duration} onChange={e=>upd('step3b',{duration:e.target.value})} placeholder="如 30" />
        </div>
      </div>
      <Bottom onBack={back} onNext={next} />
    </div>
  );

  // ===== Step 3c: 睡眠+烟酒 =====
  if (step === 8) return (
    <div className="ob-page">
      <StepHeader onClose={onClose} closeLabel={closeLabel} num={8} title="睡眠与生活习惯" subtitle="你的睡眠质量和生活习惯？" />
      <div className="ob-body">
        <div className="ob-row" style={{gap:12}}>
          <div className="ob-field" style={{flex:1}}>
            <label>入睡时间</label>
            <input type="time" value={data.step3c.bedTime} onChange={e=>upd('step3c',{bedTime:e.target.value})} />
          </div>
          <div className="ob-field" style={{flex:1}}>
            <label>起床时间</label>
            <input type="time" value={data.step3c.wakeTime} onChange={e=>upd('step3c',{wakeTime:e.target.value})} />
          </div>
        </div>
        <div className="ob-field">
          <label>睡眠质量</label>
          <div className="ob-tags">
            {SLEEP_QUALITY.map(q => (
              <Tag key={q} label={q} sel={data.step3c.sleepQuality===q} onClick={() => upd('step3c',{sleepQuality:q})} />
            ))}
          </div>
        </div>
        <div className="ob-field">
          <label>睡眠问题（多选）</label>
          <div className="ob-tags">
            {SLEEP_ISSUES.map(s => (
              <Tag key={s} label={s} sel={data.step3c.sleepIssues.includes(s)} onClick={() => {
                const arr = data.step3c.sleepIssues;
                upd('step3c',{sleepIssues:arr.includes(s)?arr.filter(x=>x!==s):[...arr,s]});
              }} />
            ))}
          </div>
        </div>
        <div className="ob-field">
          <label>吸烟状况</label>
          <div className="ob-tags">
            {SMOKE.map(s => (
              <Tag key={s} label={s} sel={data.step3c.smokeStatus===s} onClick={() => upd('step3c',{smokeStatus:s})} />
            ))}
          </div>
        </div>
        <div className="ob-field">
          <label>饮酒状况</label>
          <div className="ob-tags">
            {DRINK.map(d => (
              <Tag key={d} label={d} sel={data.step3c.drinkStatus===d} onClick={() => upd('step3c',{drinkStatus:d})} />
            ))}
          </div>
        </div>
      </div>
      <Bottom onBack={back} onNext={next} />
    </div>
  );

  // ===== Step 4: 健康目标 =====
  if (step === 9) return (
    <div className="ob-page">
      <StepHeader onClose={onClose} closeLabel={closeLabel} num={9} title="健康目标" subtitle="你想达成什么健康目标？" />
      <div className="ob-body">
        <div className="ob-tags">
          {GOALS.map(g => (
            <Tag key={g} label={g} sel={data.step4.goals.includes(g)} onClick={() => {
              const arr = data.step4.goals;
              upd('step4',{goals:arr.includes(g)?arr.filter(x=>x!==g):[...arr,g]});
            }} />
          ))}
        </div>
      </div>
      <Bottom onBack={back} onNext={next} />
    </div>
  );

  // ===== Step 5: 审查 + 完成 =====
  if (step === 10) return (
    <div className="ob-page">
      <StepHeader onClose={onClose} closeLabel={closeLabel} num={10} title="确认档案信息" subtitle="请检查以下信息，确认无误后点击完成" />
      <div className="ob-body">
        <div className="ob-card">
          <h4>基本信息</h4>
          <div className="ob-review-row"><span>姓名</span><span>{data.step1.name || '-'}</span></div>
          <div className="ob-review-row"><span>性别</span><span>{data.step1.gender==='male'?'男':data.step1.gender==='female'?'女':'-'}</span></div>
          <div className="ob-review-row"><span>出生日期</span><span>{data.step1.birthDate || '-'} {age!==null ? `(${age}岁)` : ''}</span></div>
          <div className="ob-review-row"><span>身高/体重</span><span>{data.step1.height || '-'}cm / {data.step1.weight || '-'}kg {bmi ? `(BMI:${bmi})` : ''}</span></div>
        </div>
        <div className="ob-card">
          <h4>病史</h4>
          <div className="ob-review-row"><span>慢性病</span><span>{data.step2a.noHistory ? '无' : data.step2a.diseases.join('、') || '无'}</span></div>
          <div className="ob-review-row"><span>过敏史</span><span>{data.step2b.noAllergy ? '无' : data.step2b.allergies.join('、') || '无'}</span></div>
          <div className="ob-review-row"><span>用药</span><span>{data.step2c.noMeds ? '无' : data.step2c.medications.filter(m=>m.name).map(m=>m.name+ (m.dosage?` ${m.dosage}`:'')).join('、') || '无'}</span></div>
          <div className="ob-review-row"><span>家族病史</span><span>{data.step2d.familyDiseases.join('、') || '无记录'}</span></div>
        </div>
        <div className="ob-card">
          <h4>生活方式</h4>
          <div className="ob-review-row"><span>饮食</span><span>{data.step3a.dietPrefs.join('、') || '-'}</span></div>
          <div className="ob-review-row"><span>运动</span><span>{data.step3b.exerciseFreq || '-'}{data.step3b.exerciseTypes.length?` (${data.step3b.exerciseTypes.join('、')})`:''}{data.step3b.duration?` ${data.step3b.duration}min`:''}</span></div>
          <div className="ob-review-row"><span>睡眠</span><span>{data.step3c.bedTime}→{data.step3c.wakeTime} | {data.step3c.sleepQuality}</span></div>
          <div className="ob-review-row"><span>烟酒</span><span>{data.step3c.smokeStatus} / {data.step3c.drinkStatus}</span></div>
        </div>
        <div className="ob-card">
          <h4>健康目标</h4>
          <div className="ob-review-row"><span>目标</span><span>{data.step4.goals.join('、') || '未选择'}</span></div>
        </div>
      </div>
      {/* 完成提示 + 提问建议 */}
      <div className="ob-done-box">
        <div className="ob-done-icon">🎉</div>
        <p className="ob-done-title">档案完成！数字人已了解你的健康状况</p>
        <p className="ob-done-hint">你可以试着问：</p>
        <div className="ob-done-qs">
          <span>我这种情况能吃什么？</span>
          <span>查看我的健康档案</span>
          <span>我的血压怎么控制？</span>
        </div>
      </div>
      <Bottom
        onBack={back}
        onNext={() => onComplete(toProfile())}
        nextLabel="🎉 开始对话"
        backLabel="返回修改"
      />
    </div>
  );

  return null;
}
