import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraSession } from '../pose/cameraSession';

type CamState = 'idle' | 'requesting' | 'active' | 'denied' | 'error';

/** 训练部位。当前仅"肩部训练"已在训练页实现。 */
const TRAINING_PARTS = ['肩部训练'];

interface Props {
  /** 把内部的 start() 暴露给父级，供底部功能栏「开启摄像头」按钮调用 */
  onReady?: (start: () => void) => void;
}

/**
 * 左侧摄像头训练卡：真实调用 getUserMedia 做本地预览，
 * "准备训练" 跳转到姿态训练页（pose-lab）。
 */
export default function CameraPanel({ onReady }: Props) {
  const sessionRef = useRef<CameraSession | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [state, setState] = useState<CamState>('idle');
  const [error, setError] = useState('');
  const [part, setPart] = useState(TRAINING_PARTS[0]);
  const [menuOpen, setMenuOpen] = useState(false);

  const getSession = useCallback(() => {
    if (!sessionRef.current) sessionRef.current = new CameraSession();
    return sessionRef.current;
  }, []);

  // 组件卸载时释放摄像头
  useEffect(() => () => {
    sessionRef.current?.stop();
    sessionRef.current = null;
  }, []);

  const start = useCallback(async () => {
    const session = getSession();
    setState('requesting');
    setError('');
    try {
      const stream = await session.start();
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => { /* 自动播放被拦截时忽略 */ });
      }
      setState('active');
    } catch (err: unknown) {
      const name = (err as DOMException)?.name;
      setState(name === 'NotAllowedError' ? 'denied' : 'error');
      setError(
        name === 'NotAllowedError'
          ? '摄像头权限被拒绝，请在地址栏左侧允许摄像头后重试。'
          : (err as Error)?.message || '无法打开摄像头，请检查设备是否被占用。',
      );
    }
  }, [getSession]);

  // 把 start 暴露给父级（只注册一次即可）
  useEffect(() => {
    onReady?.(() => { void start(); });
  }, [onReady, start]);

  const stop = useCallback(() => {
    sessionRef.current?.stop();
    if (videoRef.current) videoRef.current.srcObject = null;
    setError('');
    setState('idle');
  }, []);

  const goTraining = useCallback(() => {
    window.open('/pose-lab.html', '_blank');
  }, []);

  const busy = state === 'requesting';

  return (
    <div className="kb-cam">
      <div className="kb-cam-card">
        <div className="kb-cam-head">
          <span className="kb-cam-title">姿态训练</span>
          {/* 开关做成一个圆形图标按钮，不再占一行文字宽度 */}
          <button
            className={`kb-cam-toggle ${state === 'active' ? 'on' : ''}`}
            onClick={state === 'active' ? stop : () => { void start(); }}
            disabled={busy}
            title={state === 'active' ? '关闭摄像头' : busy ? '开启中…' : '开启摄像头'}
            aria-label={state === 'active' ? '关闭摄像头' : '开启摄像头'}
          >
            {state === 'active' ? '⏹' : busy ? '⋯' : '▶'}
          </button>
        </div>

        <div className="kb-cam-view">
          <video
            ref={videoRef}
            className="kb-cam-video"
            playsInline
            muted
            style={{ display: state === 'active' ? 'block' : 'none' }}
          />
          {state !== 'active' && (
            <span className="kb-cam-empty">
              {busy ? '正在开启…' : state === 'denied' ? '摄像头被拒绝' : '摄像头未开启'}
            </span>
          )}
        </div>
        {error && <div className="kb-cam-err">{error}</div>}
      </div>

      {/* 训练部位 + 进入训练页：仅保留可点击的操作，不再有说明性文字 */}
      <div className="kb-cam-foot">
        <div className="kb-select">
          <button className="kb-pill" onClick={() => setMenuOpen((v) => !v)}>
            {part}
            <span className="caret">▾</span>
          </button>
          {menuOpen && (
            <>
              <div className="kb-select-mask" onClick={() => setMenuOpen(false)} />
              <div className="kb-select-menu">
                {TRAINING_PARTS.map((m) => (
                  <button
                    key={m}
                    className={`kb-select-item ${m === part ? 'active' : ''}`}
                    onClick={() => { setPart(m); setMenuOpen(false); }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <button className="kb-pill kb-pill-go" onClick={goTraining}>
          准备训练 →
        </button>
      </div>
    </div>
  );
}
