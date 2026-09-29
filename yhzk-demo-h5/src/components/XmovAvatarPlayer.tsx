import { useEffect, useMemo, useRef, useState } from 'react';
import { XmovAvatarProvider } from '../avatar/XmovAvatarProvider';
import {
  XMOV_CONFIG,
  getXmovConfigProblem,
  hasXmovCredentials,
} from '../avatar/xmovConfig';
import type { ExpressionPlan } from '../avatar/expressionPlanner';
import type { XmovAvatarRuntimeState } from '../avatar/types';
import { xmovAvatar } from '../services/xmovAvatar';
import './XmovAvatarPlayer.scss';

const TASK1_SPEAK_TEXT = '你好，我是康伴智生，你的具身AI健康陪伴助手。';

const EXPRESSION_LABELS: Record<string, string> = {
  happy: '轻快',
  concerned: '关切',
  sad: '温和低缓',
};

function stateLabel(state: XmovAvatarRuntimeState): string {
  const labels: Record<XmovAvatarRuntimeState, string> = {
    unconfigured: '等待配置',
    'loading-sdk': '正在加载 SDK',
    initializing: '正在初始化数字人',
    idle: '待机',
    listening: '倾听',
    thinking: '思考',
    speaking: '说话',
    'interactive-idle': '互动待机',
    error: '连接异常',
    destroyed: '已销毁',
  };
  return labels[state];
}

interface Props {
  showDevControls?: boolean;
  subtitle?: string;
  subtitleRole?: 'user' | 'assistant';
}

export default function XmovAvatarPlayer({
  showDevControls = XMOV_CONFIG.showDevControls,
  subtitle,
  subtitleRole = 'assistant',
}: Props) {
  const containerId = useMemo(
    () => `xmov-avatar-${Math.random().toString(36).slice(2, 10)}`,
    [],
  );
  const providerRef = useRef<XmovAvatarProvider | null>(null);
  const [state, setState] = useState<XmovAvatarRuntimeState>('unconfigured');
  const [expression, setExpression] = useState<ExpressionPlan | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [busyAction, setBusyAction] = useState('');

  useEffect(() => {
    let mounted = true;
    const provider = new XmovAvatarProvider({
      onStateChange: (next) => {
        if (mounted) setState(next);
      },
      onDownloadProgress: (next) => {
        if (mounted) setProgress(Math.max(0, Math.min(100, Math.round(next))));
      },
      onError: (nextError) => {
        if (mounted) setError(nextError.message);
      },
      onExpressionChange: (plan) => {
        if (mounted) setExpression(plan);
      },
    });
    providerRef.current = provider;
    const detachBridge = xmovAvatar.attach(provider);

    if (hasXmovCredentials()) {
      provider.init(containerId).then(() => {
        if (!mounted) return;
        xmovAvatar.markReady(provider);
      }).catch((nextError) => {
        xmovAvatar.markUnavailable(provider);
        if (!mounted) return;
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      });
    } else {
      setState('unconfigured');
      setError(getXmovConfigProblem() ?? '');
    }

    return () => {
      mounted = false;
      providerRef.current = null;
      detachBridge();
      void provider.destroy();
    };
  }, [containerId]);

  const run = async (name: string, action: (provider: XmovAvatarProvider) => Promise<void>) => {
    const provider = providerRef.current;
    if (!provider || busyAction) return;
    setBusyAction(name);
    setError('');
    try {
      await action(provider);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusyAction('');
    }
  };

  return (
    <div className="xmov-player">
      <div id={containerId} className="xmov-stage" />

      <div className="xmov-status">
        <span className={`xmov-status-dot state-${state}`} />
        <span>{stateLabel(state)}</span>
        {expression && expression.facialEmotion !== 'neutral' && (
          <span className="xmov-expr" title={`emotion=${expression.emotion} intent=${expression.intent}`}>
            {EXPRESSION_LABELS[expression.facialEmotion] || expression.facialEmotion}
            {expression.action ? ` · ${expression.action}` : ''}
          </span>
        )}
        {(state === 'loading-sdk' || state === 'initializing') && progress > 0 && (
          <span className="xmov-progress">{progress}%</span>
        )}
      </div>

      {state === 'unconfigured' && (
        <div className="xmov-setup">
          <strong>XmovAvatar Task 1 已接入，等待本地凭据</strong>
          <span>在 yhzk-demo-h5/.env.local 配置 App ID / App Secret 后刷新页面。</span>
          <code>VITE_XMOV_APP_ID=...</code>
          <code>VITE_XMOV_APP_SECRET=...</code>
        </div>
      )}

      {subtitle && (
        <div className={`xmov-subtitle ${subtitleRole}`}>
          <span className="xmov-subtitle-role">{subtitleRole === 'user' ? '你' : '康伴智生'}</span>
          <span>{subtitle}</span>
        </div>
      )}

      {error && state !== 'unconfigured' && (
        <div className="xmov-error" role="alert">{error}</div>
      )}

      {showDevControls && state !== 'unconfigured' && (
        <div className="xmov-dev-controls">
          <button disabled={!!busyAction} onClick={() => run('idle', p => p.idle())}>待机</button>
          <button disabled={!!busyAction} onClick={() => run('listen', p => p.listen())}>倾听</button>
          <button disabled={!!busyAction} onClick={() => run('think', p => p.think())}>思考</button>
          <button disabled={!!busyAction} onClick={() => run('speak', p => p.speak(TASK1_SPEAK_TEXT))}>说话</button>
          <button disabled={!!busyAction} onClick={() => run('interrupt', p => p.interrupt())}>打断</button>
          <button disabled={!!busyAction} onClick={() => run('interactive', p => p.interactiveIdle())}>互动待机</button>
          <button disabled={!!busyAction} onClick={() => run('destroy', p => p.destroy())}>销毁</button>
          <button disabled={!!busyAction} onClick={() => run('reinit', p => p.init(containerId))}>重新初始化</button>
        </div>
      )}
    </div>
  );
}
