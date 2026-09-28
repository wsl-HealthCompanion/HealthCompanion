import { useState, useEffect } from 'react';
import VoiceButton from './VoiceButton';

interface Props {
  disabled?: boolean;
  onSend: (text: string) => void;
  editText?: string;
}

export default function InputBar({ disabled, onSend, editText }: Props) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (editText) setValue(editText);
  }, [editText]);

  const submit = (text?: string) => {
    const t = (text ?? value).trim();
    if (!t || disabled) return;
    onSend(t);
    setValue('');
  };

  return (
    <div className="input-bar">
      {/* 语音输入按钮 — 浏览器不支持时自动隐藏 */}
      <VoiceButton
        disabled={disabled}
        onResult={(text) => submit(text)}
      />
      <input
        className="input-field"
        value={value}
        placeholder="输入您的问题…"
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
      />
      <button
        className={`input-send ${!value.trim() || disabled ? 'disabled' : ''}`}
        onClick={() => submit()}
      >↑</button>
    </div>
  );
}
