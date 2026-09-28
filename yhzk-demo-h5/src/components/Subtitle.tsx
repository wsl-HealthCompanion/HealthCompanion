type DhStatus = 'idle' | 'thinking' | 'speaking';

interface Props {
  text: string;
  role: 'user' | 'assistant';
  status: DhStatus;
}

export default function Subtitle({ text, role, status }: Props) {
  if (status === 'thinking') {
    return (
      <div className="subtitle assistant">
        <span className="subtitle-role">AI</span>
        <span className="subtitle-thinking"><i /><i /><i /></span>
        <span className="subtitle-thinking-label">正在生成回答…</span>
      </div>
    );
  }
  if (!text.trim()) return null;
  return (
    <div className={`subtitle ${role}`}>
      <span className="subtitle-role">{role === 'user' ? '你' : 'AI'}</span>
      <span className="subtitle-text">{text}</span>
      {status === 'speaking' && <span className="subtitle-cursor">▍</span>}
    </div>
  );
}
