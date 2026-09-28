import { useEffect, useRef, useState } from 'react';
import flvjs from 'flv.js';
import type { Emotion } from '../types';
import { controlLiveEdge } from './liveEdgeChase';
import { createPlaybackWatchdog } from './streamRecovery';
import {
  buildFlvMediaDataSource,
  dynamicPlayerKey,
  shouldCreateDynamicPlayer,
} from './dynamicPlayerPolicy';

type DhStatus = 'idle' | 'thinking' | 'speaking';
const cleanMd = (s: string) => s.replace(/(\*{1,3}|#{1,4}\s?|`{1,3}|~~)/g, '').trim();

interface Props {
  status: DhStatus;
  emotion: Emotion;
  audioEnabled: boolean;
  onUnlockAudio: () => void;
  subtitle?: string;
  subtitleRole?: 'user' | 'assistant';
  onBufferDepthChange?: (seconds: number) => void;
  streamUrl: string | null;
}

export default function DigitalHumanPlayer({ status, emotion, audioEnabled, onUnlockAudio, subtitle, subtitleRole, streamUrl, onBufferDepthChange = () => {} }: Props) {
  const isSpeaking = status === 'speaking';
  const hlsUrl = streamUrl?.replace(/\.flv(?=\?|$)/, '.m3u8') ?? '';
  const useHls = Boolean(hlsUrl) && !flvjs.isSupported();

  return (
    <div className={`dh-player ${isSpeaking ? 'is-speaking' : ''}`}>
      {useHls
        ? <HlsPlayer key={dynamicPlayerKey(hlsUrl)} streamUrl={hlsUrl} audioEnabled={audioEnabled} status={status} emotion={emotion} onBufferDepthChange={onBufferDepthChange} />
        : <FlvPlayer key={dynamicPlayerKey(streamUrl)} streamUrl={streamUrl} audioEnabled={audioEnabled} status={status} emotion={emotion} onBufferDepthChange={onBufferDepthChange} />
      }
      {!audioEnabled && (
        <div className="dh-audio-unlock" onClick={onUnlockAudio}>🔊 点按开启声音</div>
      )}
      {/* 字幕在数字人框内底部 */}
      {subtitle && <div className={`dh-inner-sub ${subtitleRole || 'assistant'}`}><span>{cleanMd(subtitle)}</span></div>}
      {!subtitle && status === 'thinking' && <div className="dh-inner-sub thinking"><span className="dh-sub-dots"><i /><i /><i /></span> 思考中…</div>}
    </div>
  );
}

function readBufferedSeconds(video: HTMLVideoElement | null): number {
  if (!video || video.buffered.length === 0) return 0;
  return Math.max(0, video.buffered.end(video.buffered.length - 1) - video.currentTime);
}

function FlvPlayer({ streamUrl, audioEnabled, status, emotion, onBufferDepthChange }: { streamUrl: string | null; audioEnabled: boolean; status: DhStatus; emotion: Emotion; onBufferDepthChange: (seconds: number) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<flvjs.Player | null>(null);
  const [playerStatus, setPlayerStatus] = useState<'connecting' | 'live' | 'error'>('connecting');
  const [showRetry, setShowRetry] = useState(false);
  const [reconnectKey, setReconnectKey] = useState(0);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryBtnRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusRef = useRef<DhStatus>(status);
  const previousStatusRef = useRef<DhStatus>(status);
  const hardChasedThisRoundRef = useRef(false);
  const isSpeaking = status === 'speaking';
  statusRef.current = status;

  useEffect(() => {
    if (!shouldCreateDynamicPlayer(streamUrl) || !flvjs.isSupported()) {
      setPlayerStatus('error');
      return;
    }
    let destroyed = false;
    let onPlaying: (() => void) | null = null;
    let watchdogTimer: ReturnType<typeof setInterval> | null = null;
    let waitingTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectScheduled = false;
    let hasPlayed = false;
    let attempt = 0;
    const recoveryEvents: Array<keyof HTMLMediaElementEventMap> = ['stalled', 'ended', 'error'];
    const teardown = () => {
      if (onPlaying && videoRef.current) { videoRef.current.removeEventListener('playing', onPlaying); onPlaying = null; }
      controlLiveEdge(videoRef.current, 'other', false);
      if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null; }
      if (waitingTimer) { clearTimeout(waitingTimer); waitingTimer = null; }
      if (playerRef.current) { try { playerRef.current.destroy(); } catch { /* noop */ } playerRef.current = null; }
      const video = videoRef.current;
      if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
    };
    const scheduleRetry = () => {
      if (destroyed || reconnectScheduled) return;
      reconnectScheduled = true;
      setPlayerStatus('connecting');
      teardown();
      retryRef.current = setTimeout(() => {
        reconnectScheduled = false;
        setup();
      }, 1500);
    };
    const onRecoveryEvent = () => scheduleRetry();
    const onWaiting = () => {
      if (waitingTimer) clearTimeout(waitingTimer);
      waitingTimer = setTimeout(scheduleRetry, 4000);
    };
    function setup() {
      if (destroyed || !videoRef.current) return;
      teardown();
      try {
        attempt += 1;
        hasPlayed = false;
        const watchdog = createPlaybackWatchdog();
        const player = flvjs.createPlayer(
          buildFlvMediaDataSource(streamUrl!, attempt),
          { enableStashBuffer: false, stashInitialSize: 128, autoCleanupSourceBuffer: true, lazyLoad: false, lazyLoadMaxDuration: 0 } as any,
        );
        player.attachMediaElement(videoRef.current);
        player.load();
        player.on(flvjs.Events.ERROR, () => { if (!destroyed) { setPlayerStatus('connecting'); scheduleRetry(); } });
        player.on(flvjs.Events.STATISTICS_INFO, () => {
          if (!destroyed && statusRef.current === 'speaking') {
            controlLiveEdge(videoRef.current, 'speaking', false);
          }
        });
        onPlaying = () => {
          if (!destroyed) {
            hasPlayed = true;
            if (waitingTimer) { clearTimeout(waitingTimer); waitingTimer = null; }
            setPlayerStatus('live');
          }
        };
        videoRef.current.addEventListener('playing', onPlaying);
        player.on(flvjs.Events.MEDIA_INFO, () => { void Promise.resolve(player.play()).catch(() => {}); });
        playerRef.current = player;
        watchdogTimer = setInterval(() => {
          const video = videoRef.current;
          if (!video || destroyed) return;
          if (watchdog.observe({
            nowMs: Date.now(),
            currentTime: video.currentTime,
            readyState: video.readyState,
            hasPlayed,
          })) scheduleRetry();
        }, 1000);
      } catch { scheduleRetry(); }
    }
    setShowRetry(false);
    setPlayerStatus('connecting');
    if (retryBtnRef.current) clearTimeout(retryBtnRef.current);
    retryBtnRef.current = setTimeout(() => { if (!destroyed) setShowRetry(true); }, 8000);
    recoveryEvents.forEach((eventName) => videoRef.current?.addEventListener(eventName, onRecoveryEvent));
    videoRef.current?.addEventListener('waiting', onWaiting);
    setup();
    return () => {
      destroyed = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      if (retryBtnRef.current) clearTimeout(retryBtnRef.current);
      if (watchdogTimer) clearInterval(watchdogTimer);
      if (waitingTimer) clearTimeout(waitingTimer);
      recoveryEvents.forEach((eventName) => videoRef.current?.removeEventListener(eventName, onRecoveryEvent));
      videoRef.current?.removeEventListener('waiting', onWaiting);
      teardown();
    };
  }, [reconnectKey, streamUrl]);

  useEffect(() => { if (playerStatus === 'live') { setShowRetry(false); if (retryBtnRef.current) clearTimeout(retryBtnRef.current); } }, [playerStatus]);
  useEffect(() => { if (videoRef.current) videoRef.current.muted = !audioEnabled; }, [audioEnabled]);
  useEffect(() => {
    const previousStatus = previousStatusRef.current;

    if (status === 'thinking' && previousStatus !== 'thinking') {
      hardChasedThisRoundRef.current = false;
      hardChasedThisRoundRef.current = controlLiveEdge(videoRef.current, 'pre-speech', true);
    } else if (status === 'speaking' && previousStatus !== 'speaking' && !hardChasedThisRoundRef.current) {
      hardChasedThisRoundRef.current = controlLiveEdge(videoRef.current, 'pre-speech', true);
    } else if (status !== 'speaking') {
      controlLiveEdge(videoRef.current, 'other', false);
    }

    previousStatusRef.current = status;
  }, [status]);
  useEffect(() => {
    const timer = setInterval(() => onBufferDepthChange(readBufferedSeconds(videoRef.current)), 100);
    return () => clearInterval(timer);
  }, [onBufferDepthChange]);

  return (
    <>
      {playerStatus !== 'error' ? (
        <video ref={videoRef} className="dh-video" autoPlay playsInline muted={!audioEnabled} />
      ) : (
        <FallbackAvatar isSpeaking={isSpeaking} emotion={emotion} />
      )}
      {playerStatus === 'connecting' && (
        <div className="dh-overlay">
          <div className="dh-pulse" />
          <span className="dh-overlay-text">{showRetry ? '连接超时' : '数字人正在唤醒…'}</span>
          {showRetry && <button className="dh-retry-btn" onClick={() => setReconnectKey(k => k + 1)}>🔄 点击重试</button>}
        </div>
      )}
      <div className={`dh-status ${playerStatus} ${status}`}>
        {playerStatus === 'live' ? (status === 'speaking' ? '数字人正在回应' : status === 'thinking' ? '正在思考…' : 'AI 数字人已就绪') : playerStatus === 'connecting' ? '连接中…' : '⚠️ 视频流不可用'}
      </div>
    </>
  );
}

function HlsPlayer({ streamUrl, audioEnabled, status, emotion, onBufferDepthChange }: { streamUrl: string; audioEnabled: boolean; status: DhStatus; emotion: Emotion; onBufferDepthChange: (seconds: number) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playerStatus, setPlayerStatus] = useState<'connecting' | 'live' | 'error'>('connecting');
  const [showRetry, setShowRetry] = useState(false);
  const [reconnectKey, setReconnectKey] = useState(0);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryBtnRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSpeaking = status === 'speaking';

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !streamUrl) { setPlayerStatus('error'); return; }
    let destroyed = false;
    vid.muted = true;
    setShowRetry(false);
    if (retryBtnRef.current) clearTimeout(retryBtnRef.current);
    retryBtnRef.current = setTimeout(() => { if (!destroyed) setShowRetry(true); }, 8000);
    const onLive = () => { if (!destroyed) { setPlayerStatus('live'); setShowRetry(false); if (retryBtnRef.current) clearTimeout(retryBtnRef.current); } };
    const onError = () => { if (destroyed) return; setPlayerStatus('connecting'); retryRef.current = setTimeout(() => { if (!destroyed && videoRef.current) { videoRef.current.muted = true; videoRef.current.load(); void videoRef.current.play().catch(() => {}); } }, 3000); };
    vid.addEventListener('playing', onLive);
    vid.addEventListener('canplay', onLive);
    vid.addEventListener('error', onError);
    vid.src = streamUrl;
    vid.load();
    void vid.play().catch(() => { const onTouch = () => { void vid.play().catch(() => {}); document.removeEventListener('touchstart', onTouch); }; document.addEventListener('touchstart', onTouch, { once: true }); });
    return () => { destroyed = true; if (retryRef.current) clearTimeout(retryRef.current); if (retryBtnRef.current) clearTimeout(retryBtnRef.current); vid.removeEventListener('playing', onLive); vid.removeEventListener('canplay', onLive); vid.removeEventListener('error', onError); vid.pause(); vid.removeAttribute('src'); vid.load(); };
  }, [reconnectKey, streamUrl]);

  useEffect(() => { if (videoRef.current) videoRef.current.muted = !audioEnabled; }, [audioEnabled]);
  useEffect(() => {
    const timer = setInterval(() => onBufferDepthChange(readBufferedSeconds(videoRef.current)), 100);
    return () => clearInterval(timer);
  }, [onBufferDepthChange]);

  return (
    <>
      {playerStatus !== 'error' ? (
        <video ref={videoRef} className="dh-video" autoPlay playsInline muted={!audioEnabled} />
      ) : (
        <FallbackAvatar isSpeaking={isSpeaking} emotion={emotion} />
      )}
      {playerStatus === 'connecting' && (
        <div className="dh-overlay">
          <div className="dh-pulse" />
          <span className="dh-overlay-text">{showRetry ? '连接超时' : '数字人正在唤醒…'}</span>
          {showRetry && <button className="dh-retry-btn" onClick={() => setReconnectKey(k => k + 1)}>🔄 点击重试</button>}
        </div>
      )}
      <div className={`dh-status ${playerStatus} ${status}`}>
        {playerStatus === 'live' ? (status === 'speaking' ? '数字人正在回应' : status === 'thinking' ? '正在思考…' : 'AI 数字人已就绪') : playerStatus === 'connecting' ? '连接中 (HLS)…' : '⚠️ 视频流不可用'}
      </div>
    </>
  );
}

function FallbackAvatar({ isSpeaking, emotion }: { isSpeaking: boolean; emotion: Emotion }) {
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    let active = true; let timer: ReturnType<typeof setTimeout>;
    const loop = () => { timer = setTimeout(() => { if (!active) return; setBlink(true); setTimeout(() => active && setBlink(false), 150); loop(); }, 3000 + Math.random() * 2000); };
    loop(); return () => { active = false; clearTimeout(timer); };
  }, []);
  const face = emotion === 'concerned' || emotion === 'anxious' || emotion === 'sad' ? '😟' : '🙂';
  return <div className="dh-fallback"><div className="dh-fallback-face"><span className={`dh-fallback-emoji ${blink ? 'blink' : ''}`}>{face}</span>{isSpeaking && <div className="dh-fallback-mouth" />}</div></div>;
}
