/**
 * 长按消息弹出操作菜单 — 复制 & 重新生成（仅 AI 消息）
 */
import { useState, useRef, useCallback, useEffect } from 'react';

interface Props {
  text: string;
  role: 'user' | 'assistant';
  onRegenerate?: () => void;
  children: React.ReactNode;
}

export default function MessageAction({ text, role, onRegenerate, children }: Props) {
  const [menu, setMenu] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = useCallback(() => {
    timerRef.current = setTimeout(() => setMenu(true), 600);
  }, []);

  const stop = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  useEffect(() => {
    if (menu) {
      const close = () => setMenu(false);
      setTimeout(() => document.addEventListener('click', close, { once: true }), 0);
      return () => document.removeEventListener('click', close);
    }
  }, [menu]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); } catch { /* */ }
    setMenu(false);
  };

  return (
    <div
      className="msg-action-wrap"
      onTouchStart={start}
      onTouchEnd={stop}
      onTouchMove={stop}
      onMouseDown={start}
      onMouseUp={stop}
      onMouseLeave={stop}
    >
      {children}
      {menu && (
        <div className="msg-action-menu">
          <button onClick={copy}>📋 复制</button>
          {role === 'assistant' && onRegenerate && (
            <button onClick={() => { onRegenerate(); setMenu(false); }}>🔄 重新生成</button>
          )}
        </div>
      )}
    </div>
  );
}
