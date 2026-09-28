/**
 * 语音输入按钮 — 讯飞 IAT v2 WebSocket 实时语音识别
 * 替代 Web Speech API，国内可直接使用无需翻墙
 *
 * 使用方式：按住说话，松开后自动识别并发送
 */
import { useRef, useState, useCallback } from 'react';

const APP_ID     = import.meta.env.VITE_XFYUN_APP_ID     as string;
const API_KEY    = import.meta.env.VITE_XFYUN_API_KEY    as string;
const API_SECRET = import.meta.env.VITE_XFYUN_API_SECRET as string;

// 三个密钥都配置了才显示语音按钮
const ENABLED = !!(APP_ID && API_KEY && API_SECRET);

// Float32 PCM → Int16 ArrayBuffer
function f32ToI16(buf: Float32Array): ArrayBuffer {
  const out = new Int16Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    out[i] = Math.max(-32768, Math.min(32767, buf[i] * 32768));
  }
  return out.buffer;
}

// ArrayBuffer → base64
function ab2b64(ab: ArrayBuffer): string {
  const bytes = new Uint8Array(ab);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

// 构造带 HMAC-SHA256 签名的讯飞 WebSocket URL
async function buildXfUrl(): Promise<string> {
  const host = 'iat-api.xfyun.cn';
  const path = '/v2/iat';
  const date = new Date().toUTCString();
  const enc = new TextEncoder();

  const key = await crypto.subtle.importKey(
    'raw', enc.encode(API_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sigBuf = await crypto.subtle.sign(
    'HMAC', key,
    enc.encode(`host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`),
  );
  const sig  = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
  const auth = btoa(`api_key="${API_KEY}", algorithm="hmac-sha256", headers="host date request-line", signature="${sig}"`);

  return `wss://${host}${path}?authorization=${auth}&date=${encodeURIComponent(date)}&host=${host}`;
}

interface Props { disabled?: boolean; onResult: (text: string) => void; }

export default function VoiceButton({ disabled, onResult }: Props) {
  const [recording, setRecording] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [hint, setHint] = useState('');

  const wsRef        = useRef<WebSocket | null>(null);
  const ctxRef       = useRef<AudioContext | null>(null);
  const streamRef    = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const resultRef    = useRef('');
  const frameRef     = useRef(0);
  const touchYRef    = useRef(0);     // 按下时的 Y 坐标
  const cancelRef    = useRef(false); // 是否已取消

  // 清理所有资源
  const cleanup = useCallback((sendEndFrame = true) => {
    cancelRef.current = false;
    if (sendEndFrame && wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({
          data: { status: 2, format: 'audio/L16;rate=16000', audio: '', encoding: 'raw' },
        }));
      } catch { /* ignore */ }
    }
    processorRef.current?.disconnect();
    processorRef.current = null;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    frameRef.current = 0;
    setRecording(false);
  }, []);

  const start = useCallback(async () => {
    if (disabled || wsRef.current) return;

    try {
      resultRef.current = '';
      const url = await buildXfUrl();
      const ws  = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = async () => {
        // 首帧：发参数 + 空音频（status=0）
        ws.send(JSON.stringify({
          common:   { app_id: APP_ID },
          business: { language: 'zh_cn', domain: 'iat', accent: 'mandarin', vad_eos: 3000 },
          data:     { status: 0, format: 'audio/L16;rate=16000', audio: '', encoding: 'raw' },
        }));

        // 打开麦克风
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        // 尝试直接以 16kHz 录制（多数浏览器支持）
        const ctx = new AudioContext({ sampleRate: 16000 } as any);
        ctxRef.current = ctx;
        const source    = ctx.createMediaStreamSource(stream);
        const processor = ctx.createScriptProcessor(2048, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const f32  = e.inputBuffer.getChannelData(0);
          const pcm  = f32ToI16(f32);
          const b64  = ab2b64(pcm);
          // 中间帧 status=1
          ws.send(JSON.stringify({
            data: { status: 1, format: 'audio/L16;rate=16000', audio: b64, encoding: 'raw' },
          }));
          frameRef.current++;
        };

        source.connect(processor);
        processor.connect(ctx.destination);
        setRecording(true);
        setHint('');
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string);
          if (msg.code !== 0) {
            setHint(`识别出错(${msg.message})`);
            cleanup(false);
            wsRef.current = null;
            return;
          }
          // 拼接识别文字
          const words: string = msg.data?.result?.ws
            ?.map((w: any) => w.cw?.map((c: any) => c.w ?? '').join('') ?? '')
            .join('') ?? '';
          if (words) resultRef.current += words;

          // status=2 表示本次识别结束
          if (msg.data?.status === 2) {
            if (cancelRef.current) {
              setHint('已取消'); setCancelled(false);
            } else if (resultRef.current.trim()) {
              onResult(resultRef.current.trim());
              setHint('');
            } else {
              setHint('没有识别到语音');
            }
            resultRef.current = '';
            ws.close();
            wsRef.current = null;
            cleanup(false);
          }
        } catch { /* ignore */ }
      };

      ws.onerror = () => {
        setHint('网络连接失败');
        wsRef.current = null;
        cleanup(false);
      };

      ws.onclose = () => {
        wsRef.current = null;
      };

    } catch (err: any) {
      const msg = err?.name === 'NotAllowedError' ? '请允许麦克风权限' : `启动失败: ${err?.message ?? err}`;
      setHint(msg);
      wsRef.current = null;
      cleanup(false);
    }
  }, [disabled, cleanup, onResult]);

  const stop = useCallback(() => {
    cleanup(true); // 发尾帧，等 onmessage status=2 回调
  }, [cleanup]);

  if (!ENABLED) return null;

  return (
    <div className="voice-wrap">
      <button
        className={`voice-btn ${recording ? 'recording' : ''} ${disabled ? 'disabled' : ''}`}
        onMouseDown={start}
        onMouseUp={stop}
        onMouseLeave={stop}
        onTouchStart={(e) => { e.preventDefault(); touchYRef.current = e.touches[0].clientY; setCancelled(false); cancelRef.current = false; start(); }}
        onTouchMove={(e) => { const dy = touchYRef.current - e.touches[0].clientY; const c = dy > 50; if (c !== cancelled) { setCancelled(c); cancelRef.current = c; } }}
        onTouchEnd={(e)   => { e.preventDefault(); stop();  }}
        disabled={disabled}
        title={recording ? '松开发送' : '按住说话'}
      >
        {recording
          ? cancelled
            ? <><span className="voice-dot cancel" />松开取消</>
            : <><span className="voice-dot" />松开发送</>
          : '🎤'}
      </button>
      {hint && <span className="voice-hint">{hint}</span>}
    </div>
  );
}
