import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CameraSession } from '../pose/cameraSession';
import {
  REQUIRED_POSE_LANDMARKS,
} from '../pose/poseConfig';
import {
  PoseLandmarkerAdapter,
} from '../pose/poseLandmarkerAdapter';
import {
  derivePoseProbeDiagnostics,
  type PoseProbeDiagnostics,
} from '../pose/poseProbeDiagnostics';
import {
  PoseProbeLoop,
  type PoseProbeStats,
} from '../pose/poseProbeLoop';
import type {
  CameraStatus,
  PoseFrame,
} from '../pose/types';

export interface PoseLabViewState {
  cameraStatus: CameraStatus;
  modelStatus: 'idle' | 'loading' | 'ready' | 'error';
  frame: PoseFrame | null;
  stats: PoseProbeStats;
  diagnostics: PoseProbeDiagnostics;
  error: string;
}

export interface PoseLabViewProps {
  state: PoseLabViewState;
  onStartCamera: () => void;
  onStopCamera: () => void;
  videoElement: ReactNode;
}

const SKELETON_CONNECTIONS = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
] as const;

const EMPTY_STATS: PoseProbeStats = {
  effectiveFps: 0,
  skippedFrames: 0,
  lastInferenceMs: null,
};

const EMPTY_DIAGNOSTICS: PoseProbeDiagnostics = {
  shoulderWidth: null,
  torsoHeight: null,
  upperBodyBox: null,
};

export function mirroredOverlayX(x: number): number {
  return 1 - x;
}

function cameraStatusText(status: CameraStatus): string {
  switch (status) {
    case 'idle':
      return '摄像头未开启';
    case 'requesting':
      return '等待摄像头权限';
    case 'active':
      return '摄像头运行中';
    case 'denied':
      return '摄像头权限被拒绝';
    case 'error':
      return '摄像头异常';
  }
}

function modelStatusText(
  status: PoseLabViewState['modelStatus'],
): string {
  switch (status) {
    case 'idle':
      return '姿态模型未加载';
    case 'loading':
      return '正在加载姿态模型';
    case 'ready':
      return '姿态模型已就绪';
    case 'error':
      return '姿态模型异常';
  }
}

function formatMetric(
  value: number | null,
  digits = 3,
): string {
  return value === null ? '—' : value.toFixed(digits);
}

function PoseOverlay({ frame }: { frame: PoseFrame }) {
  return (
    <svg
      className="pose-lab__overlay"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      aria-label="上半身姿态关键点"
    >
      {SKELETON_CONNECTIONS.map(([fromIndex, toIndex]) => {
        const from = frame.landmarks[fromIndex];
        const to = frame.landmarks[toIndex];
        if (!from || !to) return null;

        return (
          <line
            key={`${fromIndex}-${toIndex}`}
            x1={mirroredOverlayX(from.x)}
            y1={from.y}
            x2={mirroredOverlayX(to.x)}
            y2={to.y}
          />
        );
      })}

      {REQUIRED_POSE_LANDMARKS.map(({ index, key }) => {
        const point = frame.landmarks[index];
        if (!point) return null;

        return (
          <circle
            key={key}
            data-landmark={key}
            cx={mirroredOverlayX(point.x)}
            cy={point.y}
            r="0.012"
          />
        );
      })}
    </svg>
  );
}

export function PoseLabView({
  state,
  onStartCamera,
  onStopCamera,
  videoElement,
}: PoseLabViewProps) {
  const frame = state.frame;

  return (
    <main className="pose-lab">
      <header className="pose-lab__header">
        <span className="pose-lab__badge">Milestone 2.1 · Camera + Pose Probe</span>
        <h1>Pose Lab</h1>
        <p>
          仅在浏览器本地读取摄像头画面并探测上半身关键点，
          当前阶段不判断动作是否正确。
        </p>
      </header>

      <section className="pose-lab__workspace">
        <div className="pose-lab__camera-column">
          <div className="pose-lab__stage">
            {videoElement}
            {frame && <PoseOverlay frame={frame} />}
          </div>

          <div className="pose-lab__controls">
            {state.cameraStatus === 'active' ? (
              <button type="button" onClick={onStopCamera}>
                关闭摄像头
              </button>
            ) : (
              <button
                type="button"
                onClick={onStartCamera}
                disabled={state.cameraStatus === 'requesting'}
              >
                开启摄像头
              </button>
            )}
          </div>
        </div>

        <aside className="pose-lab__diagnostics">
          <section className="pose-lab__panel">
            <h2>运行状态</h2>
            <p>{cameraStatusText(state.cameraStatus)}</p>
            <p>{modelStatusText(state.modelStatus)}</p>
            {state.error && (
              <p className="pose-lab__error" role="alert">
                {state.error}
              </p>
            )}
          </section>

          <section className="pose-lab__panel">
            <h2>探针性能</h2>
            <div className="pose-lab__metrics">
              <span>
                推理 {state.stats.lastInferenceMs === null
                  ? '—'
                  : state.stats.lastInferenceMs.toFixed(1)} ms
              </span>
              <span>{state.stats.effectiveFps} FPS</span>
              <span>跳帧 {state.stats.skippedFrames}</span>
            </div>
          </section>

          <section className="pose-lab__panel">
            <h2>校准测量</h2>
            <div className="pose-lab__metrics pose-lab__metrics--stack">
              <span>
                肩宽 {formatMetric(state.diagnostics.shoulderWidth)}
              </span>
              <span>
                躯干高度 {formatMetric(state.diagnostics.torsoHeight)}
              </span>
              <span>
                BBox {state.diagnostics.upperBodyBox
                  ? [
                      formatMetric(state.diagnostics.upperBodyBox.xMin),
                      formatMetric(state.diagnostics.upperBodyBox.yMin),
                      '→',
                      formatMetric(state.diagnostics.upperBodyBox.xMax),
                      formatMetric(state.diagnostics.upperBodyBox.yMax),
                    ].join(', ').replace(', →,', ' →')
                  : '—'}
              </span>
            </div>
          </section>

          <section className="pose-lab__panel">
            <h2>关键点可见度</h2>
            {!frame ? (
              <p>未检测到人体</p>
            ) : (
              <ul className="pose-lab__landmarks">
                {REQUIRED_POSE_LANDMARKS.map(({ index, key, label }) => {
                  const point = frame.landmarks[index];
                  const visibility = point
                    ? point.visibility.toFixed(2)
                    : '—';
                  return (
                    <li key={key}>{`${label} ${visibility}`}</li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>
      </section>
    </main>
  );
}

export function stopPoseLabRuntime(args: {
  camera: Pick<CameraSession, 'stop'>;
  loop: Pick<PoseProbeLoop, 'stop'>;
  video: { srcObject: MediaProvider | null } | null;
}): void {
  args.loop.stop();
  args.camera.stop();
  if (args.video) {
    args.video.srcObject = null;
  }
}

export function disposePoseLabRuntime(args: {
  camera: Pick<CameraSession, 'stop'>;
  loop: Pick<PoseProbeLoop, 'stop'>;
  adapter: Pick<PoseLandmarkerAdapter, 'close'> | null;
  video: { srcObject: MediaProvider | null } | null;
}): void {
  stopPoseLabRuntime(args);
  args.adapter?.close();
}

export default function PoseLabPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraRef = useRef(new CameraSession());
  const adapterRef = useRef<PoseLandmarkerAdapter | null>(null);
  const loopRef = useRef<PoseProbeLoop | null>(null);
  const mountedRef = useRef(true);

  const [state, setState] = useState<PoseLabViewState>({
    cameraStatus: 'idle',
    modelStatus: 'idle',
    frame: null,
    stats: EMPTY_STATS,
    diagnostics: EMPTY_DIAGNOSTICS,
    error: '',
  });

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      disposePoseLabRuntime({
        camera: cameraRef.current,
        loop: {
          stop: () => loopRef.current?.stop(),
        },
        adapter: adapterRef.current,
        video: videoRef.current,
      });
      adapterRef.current = null;
      loopRef.current = null;
    };
  }, []);

  const startCamera = async () => {
    const camera = cameraRef.current;
    if (
      camera.getStatus() === 'requesting'
      || camera.getStatus() === 'active'
    ) {
      return;
    }

    setState((current) => ({
      ...current,
      cameraStatus: 'requesting',
      error: '',
    }));

    try {
      const stream = await camera.start();
      if (!mountedRef.current) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        return;
      }

      const video = videoRef.current;
      if (!video) {
        camera.stop();
        return;
      }

      video.srcObject = stream;
      await video.play();

      if (!mountedRef.current) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        return;
      }

      setState((current) => ({
        ...current,
        cameraStatus: 'active',
        modelStatus: adapterRef.current ? 'ready' : 'loading',
        error: '',
      }));

      if (!adapterRef.current) {
        try {
          adapterRef.current = await PoseLandmarkerAdapter.create();
        } catch (error) {
          if (!mountedRef.current) return;
          setState((current) => ({
            ...current,
            modelStatus: 'error',
            error: error instanceof Error
              ? error.message
              : String(error),
          }));
          return;
        }
      }

      if (!mountedRef.current) {
        adapterRef.current?.close();
        adapterRef.current = null;
        return;
      }

      const adapter = adapterRef.current;
      if (!adapter) {
        return;
      }

      const loop = loopRef.current ?? new PoseProbeLoop(adapter);
      loopRef.current = loop;

      setState((current) => ({
        ...current,
        modelStatus: 'ready',
        error: '',
      }));

      loop.start(
        video,
        (sample) => {
          if (!mountedRef.current) return;
          setState((current) => ({
            ...current,
            frame: sample.frame,
            stats: sample.stats,
            diagnostics: derivePoseProbeDiagnostics(sample.frame),
          }));
        },
        (error) => {
          if (!mountedRef.current) return;
          setState((current) => ({
            ...current,
            modelStatus: 'error',
            error: error.message,
          }));
        },
      );
    } catch (error) {
      if (!mountedRef.current) return;
      setState((current) => ({
        ...current,
        cameraStatus: camera.getStatus(),
        error: camera.getError()
          || (error instanceof Error ? error.message : String(error)),
      }));
    }
  };

  const stopCamera = () => {
    stopPoseLabRuntime({
      camera: cameraRef.current,
      loop: {
        stop: () => loopRef.current?.stop(),
      },
      video: videoRef.current,
    });

    setState((current) => ({
      ...current,
      cameraStatus: 'idle',
      modelStatus: adapterRef.current ? 'ready' : 'idle',
      frame: null,
      stats: EMPTY_STATS,
      diagnostics: EMPTY_DIAGNOSTICS,
      error: '',
    }));
  };

  return (
    <PoseLabView
      state={state}
      onStartCamera={() => {
        void startCamera();
      }}
      onStopCamera={stopCamera}
      videoElement={(
        <video
          ref={videoRef}
          className="pose-lab__video"
          autoPlay
          muted
          playsInline
        />
      )}
    />
  );
}
