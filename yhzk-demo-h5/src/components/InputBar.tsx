import { useState, useEffect } from 'react';
import VoiceButton from './VoiceButton';

interface Props {
  disabled?: boolean;
  onSend: (text: string) => void;
  editText?: string;
}

/**
 * 底部输入栏。
 * 结构：[语音按钮] [输入框] [发送按钮]，上方另有一排功能操作按钮区（在 App 里单独渲染）。
 */
export default function InputBar({ disabled, onSend, editText }: Props) {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (editText) setValue(editText);
  }, [editText]);

  const submit = (text?: string) => {
    const t = (text ?? value).trim();
    if (!t || disabled) return;
    onSend(t);
    setValue('');
  };

  const canSend = !!value.trim() && !disabled;

  return (
    <div className={`input-bar ${focused ? 'focused' : ''}`}>
      {/* 语音输入按钮 — 浏览器不支持时自动隐藏 */}
      <VoiceButton
        disabled={disabled}
        onResult={(text) => submit(text)}
      />
      <input
        className="input-field"
        value={value}
        placeholder="输入您的问题，或直接按住麦克风说话…"
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
      />
      <button
        className={`input-send ${canSend ? '' : 'disabled'}`}
        onClick={() => submit()}
        disabled={!canSend}
        title="发送"
        aria-label="发送"
      >↑</button>
    </div>
  );
}
