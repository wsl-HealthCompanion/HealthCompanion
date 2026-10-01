import { DEFAULT_SHOULDER_RAISE_RULE_CONFIG } from '../pose/shoulderRaiseRules';
import type { PoseAssessment, PoseFraming, PoseIssue } from '../pose/shoulderRaiseTypes';
import type { PoseSessionSnapshot, PoseSessionStatus } from '../pose/poseSessionTypes';

export interface PoseFeedbackWidgetProps {
  snapshot: PoseSessionSnapshot;
  assessment: PoseAssessment | null;
  hasFreshSample: boolean;
  isReady: boolean;
  unavailableMessage?: string;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

const STATUS_TEXT: Record<PoseSessionStatus, string> = {
  idle: '准备训练', acquiring: '确认姿势中', coaching: '请调整姿势',
  holding: '保持中', completed: '训练完成', paused: '已暂停',
};

const ISSUE_TEXT: Record<PoseIssue, string> = {
  body_not_visible: '请让双肩、双肘和髋部完整进入画面。',
  too_far: '请靠近镜头一点，让上半身更清楚。',
  too_close: '请后退一点，为双臂留出空间。',
  torso_lean: '请让身体保持直立。',
  left_arm_too_low: '左臂再抬高一点。',
  left_arm_too_high: '左臂稍微放低一点。',
  right_arm_too_low: '右臂再抬高一点。',
  right_arm_too_high: '右臂稍微放低一点。',
};

const FRAMING_TEXT: Record<PoseFraming, string> = {
  unknown: '待标定', ok: '合适', too_far: '偏远', too_close: '偏近',
};

function angleText(angle: number | null | undefined): string {
  return angle !== null && angle !== undefined && Number.isFinite(angle)
    ? `${angle.toFixed(1)}°` : '—';
}

function guidance(props: PoseFeedbackWidgetProps): string {
  const { snapshot, assessment, hasFreshSample, isReady, unavailableMessage } = props;
  if (!isReady) return unavailableMessage || '请先开启摄像头，等待姿态识别就绪。';
  if (snapshot.status === 'completed') return '这一组完成了！可以放下双臂，或点击“再做一次”。';
  if (snapshot.status === 'paused') return '训练已暂停，保持计时已清零。点击“继续训练”重新开始保持。';
  if (snapshot.status === 'idle') return '将双臂抬至肩部高度，准备好后点击“开始训练”。';
  if (!hasFreshSample || !assessment) return '正在等待新的姿态画面，保持计时已清零。';
  if (snapshot.status === 'holding') return '姿势正确，保持双臂和身体稳定。';
  if (assessment.correct) return '姿势已到位，正在确认稳定，请保持。';
  return ISSUE_TEXT[assessment.issues[0]] || '请根据下方提示调整姿势。';
}

export function PoseFeedbackWidget(props: PoseFeedbackWidgetProps) {
  const { snapshot, hasFreshSample, isReady, onStart, onPause, onResume, onStop } = props;
  const assessment = hasFreshSample ? props.assessment : null;
  const measurement = assessment?.measurement;
  const active = ['acquiring', 'coaching', 'holding'].includes(snapshot.status);
  const canStart = isReady;
  const progress = Math.max(0, Math.min(snapshot.holdMs, snapshot.holdTargetMs));
  const elapsed = (Math.floor(progress / 100) / 10).toFixed(1);
  const target = (snapshot.holdTargetMs / 1000).toFixed(1);
  const { minArmAngleDeg, maxArmAngleDeg, maxTorsoLeanDeg } = DEFAULT_SHOULDER_RAISE_RULE_CONFIG;
  const showIssues = snapshot.status !== 'completed' && assessment && !assessment.correct;

  return (
    <section className="pose-lab__panel pose-feedback" aria-labelledby="pose-feedback-title">
      <div className="pose-feedback__heading">
        <h2 id="pose-feedback-title">双臂抬至肩部高度</h2>
        <span className={`pose-feedback__status pose-feedback__status--${snapshot.status}`}>
          {STATUS_TEXT[snapshot.status]}
        </span>
      </div>
      <p>双臂目标 {minArmAngleDeg}°–{maxArmAngleDeg}°，稳定后保持 {target} 秒。</p>
      <p className="pose-feedback__guidance" role="status" aria-live="polite" aria-atomic="true">
        {guidance(props)}
      </p>

      <div className="pose-feedback__controls">
        {(snapshot.status === 'idle' || snapshot.status === 'completed') && (
          <button type="button" onClick={onStart} disabled={!canStart}>
            {snapshot.status === 'completed' ? '再做一次' : '开始训练'}
          </button>
        )}
        {active && <button type="button" onClick={onPause}>暂停训练</button>}
        {snapshot.status === 'paused' && (
          <button type="button" onClick={onResume} disabled={!canStart}>继续训练</button>
        )}
        {snapshot.status !== 'idle' && (
          <button type="button" className="pose-feedback__secondary" onClick={onStop}>结束训练</button>
        )}
      </div>

      <div className="pose-feedback__angles">
        {(['left', 'right'] as const).map((side) => {
          const arm = measurement?.[side];
          const available = arm?.visible === true && arm.angleDeg !== null && Number.isFinite(arm.angleDeg);
          const needsAdjustment = assessment?.issues.some((issue) => issue.startsWith(`${side}_arm_`));
          const armState = snapshot.status === 'completed' ? 'finished'
            : !available || !measurement?.bodyVisible ? 'unknown'
            : needsAdjustment ? 'adjust' : 'ok';
          return (
            <div className={`pose-feedback__angle pose-feedback__angle--${armState}`} key={side}>
              <span>{side === 'left' ? '左臂角度' : '右臂角度'}</span>
              <strong>{available ? angleText(arm?.angleDeg) : '—'}</strong>
              <small>{armState === 'finished' ? '实时测量' : armState === 'ok' ? '已到目标范围' : armState === 'adjust' ? '需要调整' : '等待有效关键点'}</small>
            </div>
          );
        })}
      </div>

      <div className="pose-feedback__hold">
        <div><span>本次保持</span><strong>{elapsed} / {target} 秒</strong></div>
        <progress value={progress} max={snapshot.holdTargetMs} aria-label="本次保持进度" />
      </div>

      <div className="pose-feedback__details">
        <span>躯干倾斜 {angleText(measurement?.torsoLeanDeg)}（上限 {maxTorsoLeanDeg}°）</span>
        <span>画面范围：{FRAMING_TEXT[measurement?.framing ?? 'unknown']}</span>
      </div>
      {showIssues && (
        <ul className="pose-feedback__issues" aria-label="当前姿势提示">
          {assessment.issues.map((issue) => <li key={issue}>{ISSUE_TEXT[issue]}</li>)}
        </ul>
      )}
      {assessment?.correct && snapshot.status === 'idle' && <p>当前姿势已在目标范围内。</p>}

      <p className="pose-feedback__note">左右以你本人为准。结束训练后保留摄像头预览。</p>
    </section>
  );
}
