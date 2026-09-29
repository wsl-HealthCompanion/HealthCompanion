import { useEffect, useState, type ReactNode } from 'react';
import {
  fetchXmovActions,
  type XmovAction,
} from '../avatar/xmovActions';
import { xmovAvatar } from '../services/xmovAvatar';
import XmovAvatarPlayer from './XmovAvatarPlayer';

export type ActionLabState =
  | { status: 'loading'; actions: []; error: '' }
  | { status: 'ready'; actions: XmovAction[]; error: '' }
  | { status: 'error'; actions: []; error: string };

export interface ActionPlaybackState {
  semantic: string;
  status: 'running' | 'success' | 'error';
  message: string;
}

interface XmovActionLabViewProps {
  state: ActionLabState;
  playback: ActionPlaybackState | null;
  onExecuteAction: (semantic: string) => void;
  avatarStage?: ReactNode;
}

export function XmovActionLabView({
  state,
  playback,
  onExecuteAction,
  avatarStage,
}: XmovActionLabViewProps) {
  const anyActionRunning = playback?.status === 'running';

  return (
    <main className="xmov-action-lab">
      <header className="xmov-action-lab__header">
        <span className="xmov-action-lab__badge">Milestone 1 · Action Lab</span>
        <h1>Xmov Action Lab</h1>
        <p>读取当前账号真实 KA 能力，用于确认后续健康陪伴场景可以依赖的动作。</p>
      </header>

      {avatarStage && (
        <section className="xmov-action-lab__avatar-stage">
          <div className="xmov-action-lab__section-label">当前数字人</div>
          {avatarStage}
        </section>
      )}

      {state.status === 'loading' && (
        <section className="xmov-action-lab__panel" aria-live="polite">
          <strong>正在读取真实 KA 动作</strong>
          <p>正在通过后端查询当前 Xmov 账号的动作列表。</p>
        </section>
      )}

      {state.status === 'error' && (
        <section className="xmov-action-lab__panel xmov-action-lab__panel--error" role="alert">
          <strong>动作列表加载失败</strong>
          <p>{state.error}</p>
        </section>
      )}

      {state.status === 'ready' && (
        <section className="xmov-action-lab__results">
          <div className="xmov-action-lab__summary">
            <strong>共 {state.actions.length} 个动作</strong>
            <span>数据来自当前账号真实 KA 列表</span>
          </div>

          {state.actions.length === 0 ? (
            <div className="xmov-action-lab__panel">
              <strong>暂无可用 KA 动作</strong>
              <p>当前接口返回了合法空列表，没有注入示例或 fallback 动作。</p>
            </div>
          ) : (
            <div className="xmov-action-lab__list">
              {state.actions.map((action, index) => {
                const actionPlayback = playback?.semantic === action.semantic
                  ? playback
                  : null;

                return (
                  <article
                    className="xmov-action-lab__item"
                    key={`${action.rawName ?? action.semantic}-${index}`}
                  >
                    <div className="xmov-action-lab__semantic">{action.semantic}</div>

                    <div className="xmov-action-lab__preview">
                      {action.imageUrl && (
                        <img
                          src={action.imageUrl}
                          alt={`${action.cnName || action.name} KA 预览`}
                          loading="lazy"
                        />
                      )}
                      {action.movieUrl && (
                        <video
                          src={action.movieUrl}
                          controls
                          preload="metadata"
                        />
                      )}
                      {!action.imageUrl && !action.movieUrl && (
                        <span className="xmov-action-lab__preview-empty">
                          暂无预览资源
                        </span>
                      )}
                    </div>

                    <dl>
                      <div>
                        <dt>英文名</dt>
                        <dd>{action.name}</dd>
                      </div>
                      <div>
                        <dt>中文名</dt>
                        <dd>{action.cnName || '—'}</dd>
                      </div>
                      <div>
                        <dt>类型</dt>
                        <dd>{action.type}</dd>
                      </div>
                    </dl>

                    <div className="xmov-action-lab__controls">
                      <button
                        type="button"
                        disabled={anyActionRunning}
                        onClick={() => onExecuteAction(action.semantic)}
                      >
                        {actionPlayback?.status === 'running' ? '执行中' : '执行动作'}
                      </button>
                      {actionPlayback && (
                        <span className={`xmov-action-lab__playback xmov-action-lab__playback--${actionPlayback.status}`}>
                          {actionPlayback.message}
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

export default function XmovActionLabPage() {
  const [state, setState] = useState<ActionLabState>({
    status: 'loading',
    actions: [],
    error: '',
  });
  const [playback, setPlayback] = useState<ActionPlaybackState | null>(null);

  useEffect(() => {
    let mounted = true;

    fetchXmovActions()
      .then((actions) => {
        if (!mounted) return;
        setState({
          status: 'ready',
          actions,
          error: '',
        });
      })
      .catch((error) => {
        if (!mounted) return;
        setState({
          status: 'error',
          actions: [],
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      mounted = false;
    };
  }, []);

  const executeAction = async (semantic: string) => {
    if (playback?.status === 'running') return;

    setPlayback({
      semantic,
      status: 'running',
      message: '执行中',
    });

    try {
      await xmovAvatar.playAction(semantic);
      setPlayback({
        semantic,
        status: 'success',
        message: '已提交给 Xmov SDK，请观察数字人实际动作',
      });
    } catch (error) {
      setPlayback({
        semantic,
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <XmovActionLabView
      state={state}
      playback={playback}
      onExecuteAction={(semantic) => {
        void executeAction(semantic);
      }}
      avatarStage={<XmovAvatarPlayer showDevControls={false} />}
    />
  );
}
