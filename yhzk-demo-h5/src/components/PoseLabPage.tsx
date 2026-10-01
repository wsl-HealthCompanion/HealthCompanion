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
  CameraDeviceOption,
  CameraStatus,
  PoseFrame,
} from '../pose/types';
import { usePoseTrainingSession } from '../pose/usePoseTrainingSession';
import { usePoseAvatarFeedback } from '../pose/usePoseAvatarFeedback';
import { PoseAvatarFeedbackPanel } from './PoseAvatarFeedbackPanel';
import { PoseFeedbackWidget, type PoseFeedbackWidgetProps } from './PoseFeedbackWidget';

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
  cameraDevices?: CameraDeviceOption[];
  selectedCameraId?: string;
  cameraLabel?: string;
  videoDimensions?: string;
  videoAspectRatio?: number;
  training?: PoseFeedbackWidgetProps;
  avatarPanel?: ReactNode;
  onSelectCamera?: (deviceId: string) => void;
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

export class PoseLabRunGate {
  private generation = 0;

  begin(): number {
    this.generation += 1;
    return this.generation;
  }

  invalidate(): void {
    this.generation += 1;
  }

  isCurrent(token: number): boolean {
    return token === this.generation;
  }
}

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

function isVirtualCameraLabel(label: string): boolean {
  return /virtual|transcreen|obs|manycam|snap camera|droidcam|vcam/i.test(label);
}

function isCameraBusyError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'NotReadableError') {
    return true;
  }
  return /device in use|device busy/i.test(
    error instanceof Error ? error.message : String(error),
  );
}

function formatMetric(
  value: number | null,
  digits = 3,
): string {
  return value === null ? '—' : value.toFixed(digits);
}

function waitForVideoFrame(video: HTMLVideoElement): Promise<void> {
  const hasFrame = () => video.readyState >= 2
    && video.videoWidth > 0
    && video.videoHeight > 0
    && video.currentTime > 0;

  if (hasFrame()) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    let timeout = 0;

    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener('loadeddata', checkFrame);
      video.removeEventListener('resize', checkFrame);
      video.removeEventListener('error', onError);
    };

    const finish = (error?: Error) => {
      cleanup();
      if (error) reject(error);
      else resolve();
    };

    const checkFrame = () => {
      if (hasFrame()) finish();
    };

    const onError = () => finish(new Error(
      video.error?.message || '浏览器无法读取摄像头画面。',
    ));

    video.addEventListener('loadeddata', checkFrame);
    video.addEventListener('resize', checkFrame);
    video.addEventListener('error', onError);
    timeout = window.setTimeout(() => {
      finish(new Error(
        '浏览器已连接摄像头，但没有收到视频帧。请在下方切换摄像头来源后重试。',
      ));
    }, 5000);
    checkFrame();
  });
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
  cameraDevices = [],
  selectedCameraId = '',
  cameraLabel = '',
  videoDimensions = '',
  videoAspectRatio,
  training,
  avatarPanel,
  onSelectCamera,
  videoElement,
}: PoseLabViewProps) {
  const observationFresh = !training || training.hasFreshSample;
  const frame = observationFresh ? state.frame : null;
  const diagnostics = observationFresh ? state.diagnostics : EMPTY_DIAGNOSTICS;

  return (
    <main className="pose-lab">
      <header className="pose-lab__header">
        <span className="pose-lab__badge">{training ? 'Pose Lab · 实时姿态练习' : 'Milestone 2.1 · Camera + Pose Probe'}</span>
        <h1>{training ? '肩部动作练习' : 'Pose Lab'}</h1>
        <p>
          {training
            ? '开启摄像头，让上半身完整进入画面。开始训练后，将双臂抬至肩部高度并保持三秒。'
            : '仅在浏览器本地读取摄像头画面并探测上半身关键点，当前阶段不判断动作是否正确。'}
        </p>
      </header>

      <section className="pose-lab__workspace">
        <div className="pose-lab__practice-row">
          <div className="pose-lab__camera-column">
            <div className="pose-lab__stage" style={videoAspectRatio ? { aspectRatio: videoAspectRatio } : undefined}>
              {videoElement}
              {state.cameraStatus !== 'active' && (
                <div className="pose-lab__camera-placeholder" role="status">
                  {state.cameraStatus === 'error'
                    ? state.error || '没有收到摄像头画面'
                    : state.cameraStatus === 'requesting'
                      ? '正在连接摄像头…'
                      : '点击“开启摄像头”查看实时画面'}
                </div>
              )}
              {frame && (!training || training.hasFreshSample) && <PoseOverlay frame={frame} />}
              {training && state.cameraStatus === 'active' && state.modelStatus === 'ready'
                && !training.hasFreshSample && (
                  <div className="pose-lab__observation-notice">正在等待新的姿态画面</div>
                )}
            </div>

            <div className="pose-lab__controls">
              {state.cameraStatus === 'requesting' ? (
                <button type="button" onClick={onStopCamera}>取消连接</button>
              ) : state.cameraStatus === 'active' ? (
                <button type="button" onClick={onStopCamera}>
                  关闭摄像头
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onStartCamera}
                >
                  开启摄像头
                </button>
              )}
              {cameraDevices.length > 0 && onSelectCamera && (
                <label className="pose-lab__camera-select">
                  摄像头来源
                  <select
                    value={selectedCameraId}
                    onChange={(event) => onSelectCamera(event.currentTarget.value)}
                    disabled={state.cameraStatus === 'requesting'}
                  >
                    {cameraDevices.map((device, index) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `摄像头 ${index + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>

          {avatarPanel && (
            <div className="pose-lab__avatar-column">{avatarPanel}</div>
          )}
        </div>

        <aside className="pose-lab__diagnostics">
          {training && <PoseFeedbackWidget {...training} />}
          <section className="pose-lab__panel">
            <h2>运行状态</h2>
            <p>{cameraStatusText(state.cameraStatus)}</p>
            <p>{modelStatusText(state.modelStatus)}</p>
            {cameraLabel && <p>设备：{cameraLabel}</p>}
            {videoDimensions && <p>画面尺寸：{videoDimensions}</p>}
            {state.error && (
              <p className="pose-lab__error" role="alert">
                {state.error}
              </p>
            )}
          </section>

          <details className="pose-lab__probe-details">
            <summary>识别详情</summary>
            <div className="pose-lab__probe-panels">
          <section className="pose-lab__panel">
            <h2>探针性能</h2>
            <div className="pose-lab__metrics">
              <span>
                推理 {state.stats.lastInferenceMs === null
                  ? '—'
                  : state.stats.lastInferenceMs.toFixed(1)} ms
              </span>
              <span>{observationFresh ? state.stats.effectiveFps : 0} FPS</span>
              <span>跳帧 {state.stats.skippedFrames}</span>
            </div>
          </section>

          <section className="pose-lab__panel">
            <h2>校准测量</h2>
            <div className="pose-lab__metrics pose-lab__metrics--stack">
              <span>
                肩宽 {formatMetric(diagnostics.shoulderWidth)}
              </span>
              <span>
                躯干高度 {formatMetric(diagnostics.torsoHeight)}
              </span>
              <span>
                BBox {diagnostics.upperBodyBox
                  ? [
                      formatMetric(diagnostics.upperBodyBox.xMin),
                      formatMetric(diagnostics.upperBodyBox.yMin),
                      '→',
                      formatMetric(diagnostics.upperBodyBox.xMax),
                      formatMetric(diagnostics.upperBodyBox.yMax),
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
            </div>
          </details>
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
  const runGateRef = useRef(new PoseLabRunGate());
  const mountedRef = useRef(true);
  const detachTrackEndedRef = useRef<(() => void) | null>(null);
  const restartInferenceRef = useRef<(() => boolean) | null>(null);

  const [state, setState] = useState<PoseLabViewState>({
    cameraStatus: 'idle',
    modelStatus: 'idle',
    frame: null,
    stats: EMPTY_STATS,
    diagnostics: EMPTY_DIAGNOSTICS,
    error: '',
  });
  const [cameraDevices, setCameraDevices] = useState<CameraDeviceOption[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [cameraLabel, setCameraLabel] = useState('');
  const [videoDimensions, setVideoDimensions] = useState('');
  const [videoAspectRatio, setVideoAspectRatio] = useState<number | undefined>();
  const trainingReady = state.cameraStatus === 'active' && state.modelStatus === 'ready';
  const avatarFeedback = usePoseAvatarFeedback();
  const training = usePoseTrainingSession(trainingReady, avatarFeedback.observer);

  const refreshCameraDevices = async (): Promise<CameraDeviceOption[]> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const seen = new Set<string>();
      const cameraInputs = devices
        .filter((device) => device.kind === 'videoinput')
        .filter((device) => {
          if (!device.deviceId || seen.has(device.deviceId)) return false;
          seen.add(device.deviceId);
          return true;
        })
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `摄像头 ${index + 1}`,
        }));
      if (mountedRef.current) setCameraDevices(cameraInputs);
      return cameraInputs;
    } catch {
      // Camera input selection is optional; keep the original browser error visible.
      return [];
    }
  };

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      runGateRef.current.invalidate();
      detachTrackEndedRef.current?.();
      detachTrackEndedRef.current = null;
      restartInferenceRef.current = null;
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

  const startCamera = async (
    deviceId = selectedCameraId,
    allowHardwareFallback = !deviceId,
  ) => {
    const camera = cameraRef.current;
    if (
      camera.getStatus() === 'requesting'
      || camera.getStatus() === 'active'
    ) {
      return;
    }

    const runToken = runGateRef.current.begin();
    training.clearObservation();
    restartInferenceRef.current = null;
    detachTrackEndedRef.current?.();
    detachTrackEndedRef.current = null;
    setVideoDimensions('');
    setVideoAspectRatio(undefined);

    setState((current) => ({
      ...current,
      cameraStatus: 'requesting',
      error: '',
    }));

    try {
      const stream = await camera.start(deviceId || undefined);
      if (
        !mountedRef.current
        || !runGateRef.current.isCurrent(runToken)
      ) {
        // Release this startup's stream, not a newer camera selected while awaiting.
        for (const track of stream.getTracks()) track.stop();
        return;
      }

      const video = videoRef.current;
      if (!video) {
        camera.stop();
        return;
      }

      const videoTrack = stream.getVideoTracks()[0];
      const actualDeviceId = videoTrack?.getSettings().deviceId || deviceId;
      const devices = await refreshCameraDevices();
      if (
        !mountedRef.current
        || !runGateRef.current.isCurrent(runToken)
      ) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      const hardwareCamera = devices.find((item) => !isVirtualCameraLabel(item.label));
      if (
        allowHardwareFallback
        && isVirtualCameraLabel(videoTrack?.label || '')
        && hardwareCamera
      ) {
        camera.stop();
        setSelectedCameraId(hardwareCamera.deviceId);
        void startCamera(hardwareCamera.deviceId, false);
        return;
      }
      if (actualDeviceId) setSelectedCameraId(actualDeviceId);
      setCameraLabel(videoTrack?.label || '摄像头名称不可用');

      video.srcObject = stream;
      await Promise.all([
        video.play(),
        waitForVideoFrame(video),
      ]);

      if (
        !mountedRef.current
        || !runGateRef.current.isCurrent(runToken)
        || camera.getStatus() !== 'active'
      ) {
        return;
      }

      setVideoDimensions(`${video.videoWidth} × ${video.videoHeight}`);
      setVideoAspectRatio(video.videoWidth / video.videoHeight);
      if (videoTrack) {
        if (videoTrack.readyState === 'ended') throw new Error('摄像头连接已中断，请重新开启摄像头。');
        const onTrackEnded = () => {
          if (!mountedRef.current || !runGateRef.current.isCurrent(runToken)) return;
          stopCamera();
          setState((current) => ({
            ...current,
            cameraStatus: 'error',
            error: '摄像头连接已中断，请重新开启摄像头。',
          }));
        };
        videoTrack.addEventListener('ended', onTrackEnded);
        detachTrackEndedRef.current = () => videoTrack.removeEventListener('ended', onTrackEnded);
      }

      setState((current) => ({
        ...current,
        cameraStatus: 'active',
        modelStatus: adapterRef.current ? 'ready' : 'loading',
        error: '',
      }));

      let adapter = adapterRef.current;
      if (!adapter) {
        try {
          const createdAdapter = await PoseLandmarkerAdapter.create();
          if (
            !mountedRef.current
            || !runGateRef.current.isCurrent(runToken)
            || camera.getStatus() !== 'active'
          ) {
            createdAdapter.close();
            return;
          }
          adapterRef.current = createdAdapter;
          adapter = createdAdapter;
        } catch (error) {
          if (
            !mountedRef.current
            || !runGateRef.current.isCurrent(runToken)
          ) {
            return;
          }
          training.suspendObservation();
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

      if (
        !mountedRef.current
        || !runGateRef.current.isCurrent(runToken)
        || camera.getStatus() !== 'active'
      ) {
        return;
      }

      const loop = loopRef.current ?? new PoseProbeLoop(adapter);
      loopRef.current = loop;

      setState((current) => ({
        ...current,
        modelStatus: 'ready',
        error: '',
      }));

      const startInference = () => {
        if (!mountedRef.current || !runGateRef.current.isCurrent(runToken)
          || camera.getStatus() !== 'active' || adapterRef.current !== adapter) return false;
        loop.start(
        video,
        (sample) => {
          if (
            !mountedRef.current
            || !runGateRef.current.isCurrent(runToken)
          ) return;
          training.ingest(sample.frame);
          setState((current) => ({
            ...current,
            frame: sample.frame,
            stats: sample.stats,
            diagnostics: derivePoseProbeDiagnostics(sample.frame),
          }));
        },
        (error) => {
          if (
            !mountedRef.current
            || !runGateRef.current.isCurrent(runToken)
          ) return;
          training.suspendObservation();
          loop.stop();
          loopRef.current = null;
          restartInferenceRef.current = null;
          const failedAdapter = adapterRef.current;
          adapterRef.current = null;
          try {
            failedAdapter?.close();
          } catch {
            // Keep the inference failure visible even if the failed runtime cannot close cleanly.
          }
          setState((current) => ({
            ...current,
            modelStatus: 'error',
            frame: null,
            stats: EMPTY_STATS,
            diagnostics: EMPTY_DIAGNOSTICS,
            error: error.message,
          }));
        },
        );
        return true;
      };
      restartInferenceRef.current = startInference;
      startInference();
    } catch (error) {
      if (
        !mountedRef.current
        || !runGateRef.current.isCurrent(runToken)
      ) return;
      const devices = await refreshCameraDevices();
      if (
        !mountedRef.current
        || !runGateRef.current.isCurrent(runToken)
      ) return;
      if (
        allowHardwareFallback
        && isCameraBusyError(error)
      ) {
        const hardwareCamera = devices.find((item) => !isVirtualCameraLabel(item.label));
        if (hardwareCamera) {
          camera.stop();
          setSelectedCameraId(hardwareCamera.deviceId);
          void startCamera(hardwareCamera.deviceId, false);
          return;
        }
      }
      const streamWasActive = camera.getStatus() === 'active';
      training.clearObservation();
      restartInferenceRef.current = null;
      detachTrackEndedRef.current?.();
      detachTrackEndedRef.current = null;
      if (streamWasActive) {
        stopPoseLabRuntime({
          camera,
          loop: {
            stop: () => loopRef.current?.stop(),
          },
          video: videoRef.current,
        });
      }
      setState((current) => ({
        ...current,
        cameraStatus: streamWasActive ? 'error' : camera.getStatus(),
        frame: null,
        stats: EMPTY_STATS,
        diagnostics: EMPTY_DIAGNOSTICS,
        error: camera.getError()
          || (error instanceof Error ? error.message : String(error)),
      }));
    }
  };

  const stopCamera = () => {
    runGateRef.current.invalidate();
    training.clearObservation();
    restartInferenceRef.current = null;
    detachTrackEndedRef.current?.();
    detachTrackEndedRef.current = null;
    stopPoseLabRuntime({
      camera: cameraRef.current,
      loop: {
        stop: () => loopRef.current?.stop(),
      },
      video: videoRef.current,
    });
    setVideoDimensions('');
    setVideoAspectRatio(undefined);

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

  const selectCamera = (deviceId: string) => {
    setSelectedCameraId(deviceId);
    if (cameraRef.current.getStatus() === 'requesting') return;
    if (cameraRef.current.getStatus() === 'active') {
      stopCamera();
    }
    void startCamera(deviceId);
  };

  const startTraining = () => {
    if (!trainingReady || document.hidden || !restartInferenceRef.current?.()) return;
    training.start();
  };

  const stopTraining = () => {
    loopRef.current?.stop();
    training.stopTraining();
    setState((current) => ({
      ...current, frame: null, stats: EMPTY_STATS, diagnostics: EMPTY_DIAGNOSTICS,
    }));
  };

  return (
    <PoseLabView
      state={state}
      onStartCamera={() => {
        void startCamera();
      }}
      onStopCamera={stopCamera}
      cameraDevices={cameraDevices}
      selectedCameraId={selectedCameraId}
      cameraLabel={cameraLabel}
      videoDimensions={videoDimensions}
      videoAspectRatio={videoAspectRatio}
      avatarPanel={<PoseAvatarFeedbackPanel
        feedback={avatarFeedback.state}
        onAvailabilityChange={avatarFeedback.onAvailabilityChange}
      />}
      training={{
        ...training.view,
        isReady: trainingReady,
        unavailableMessage: state.cameraStatus !== 'active'
          ? '请先开启摄像头，让上半身完整进入画面。'
          : state.modelStatus === 'error'
            ? '姿态识别已暂停，请关闭后重新开启摄像头。'
            : '正在准备姿态识别，请稍候。',
        onStart: startTraining,
        onPause: training.pause,
        onResume: training.resume,
        onStop: stopTraining,
      }}
      onSelectCamera={selectCamera}
      videoElement={(
        <video
          ref={videoRef}
          className="pose-lab__video"
          autoPlay
          muted
          playsInline
          onResize={(event) => {
            const video = event.currentTarget;
            if (cameraRef.current.getStatus() === 'active'
              && video.srcObject === cameraRef.current.getStream()
              && video.videoWidth > 0 && video.videoHeight > 0) {
              setVideoDimensions(`${video.videoWidth} × ${video.videoHeight}`);
              setVideoAspectRatio(video.videoWidth / video.videoHeight);
            }
          }}
        />
      )}
    />
  );
}
