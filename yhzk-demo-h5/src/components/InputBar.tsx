import { useState, useEffect } from 'react';
import VoiceButton from './VoiceButton';
import { addImageToChips, capturePhotoDataUri, MAX_CHAT_IMAGES } from '../utils/frameCapture';

interface Props {
  disabled?: boolean;
  onSend: (text: string, images?: string[]) => void;
  editText?: string;
}

/** 带图但没打字时的兜底提问 — 后端 message 有非空约束, 且给老人的提示要具体 */
const DEFAULT_PHOTO_PROMPT = '请看看我拍的照片，告诉我里面是什么、做得对不对';

/**
 * 底部输入栏。
 * 结构：[语音按钮] [拍照按钮] [输入框] [发送按钮]。
 * 拍照问一问：截帧生成 data URI 随消息发送，图片不落盘。
 */
export default function InputBar({ disabled, onSend, editText }: Props) {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (editText) setValue(editText);
  }, [editText]);

  const shoot = async () => {
    if (disabled || capturing || images.length >= MAX_CHAT_IMAGES) return;
    setCapturing(true);
    try {
      const dataUri = await capturePhotoDataUri();
      setImages((prev) => addImageToChips(prev, dataUri));
    } catch {
      // 摄像头不可用/权限被拒 — 与语音按钮一致静默降级, 按钮不消失可重试
    } finally {
      setCapturing(false);
    }
  };

  const submit = (text?: string) => {
    const t = (text ?? value).trim();
    if (disabled) return;
    if (!t && images.length === 0) return;
    onSend(t || DEFAULT_PHOTO_PROMPT, images.length ? images : undefined);
    setValue('');
    setImages([]);
  };

  const canSend = (!!value.trim() || images.length > 0) && !disabled;
  const full = images.length >= MAX_CHAT_IMAGES;

  return (
    <div className={`input-bar ${focused ? 'focused' : ''}`}>
      {/* 语音输入按钮 — 浏览器不支持时自动隐藏 */}
      <VoiceButton
        disabled={disabled}
        onResult={(text) => submit(text)}
      />
      {/* 拍照问一问 */}
      <button
        className={`input-camera ${full ? 'full' : ''}`}
        onClick={() => void shoot()}
        disabled={disabled || capturing || full}
        title={full ? `最多 ${MAX_CHAT_IMAGES} 张` : capturing ? '正在拍照…' : '拍照问一问'}
        aria-label="拍照问一问"
      >📷</button>
      {images.length > 0 && (
        <div className="kb-image-chips">
          {images.map((img, i) => (
            <span key={i} className="kb-image-chip">
              <img src={img} alt={`附图 ${i + 1}`} />
              <button
                className="kb-image-chip-x"
                aria-label={`移除附图 ${i + 1}`}
                onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
              >×</button>
            </span>
          ))}
        </div>
      )}
      <input
        className="input-field"
        value={value}
        placeholder="输入您的问题，或拍照问问看…"
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
