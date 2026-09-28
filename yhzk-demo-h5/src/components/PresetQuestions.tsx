interface Props {
  questions: string[];
  onSelect: (q: string) => void;
  disabled?: boolean;
}

/** 预设问题按钮 — 演示利器，点一下直接触发一段对话 */
export default function PresetQuestions({ questions, onSelect, disabled }: Props) {
  if (questions.length === 0) return null;
  return (
    <div className="preset-questions">
      {questions.map((q, i) => (
        <button key={i} className="preset-q" disabled={disabled} onClick={() => onSelect(q)}>
          {q}
        </button>
      ))}
    </div>
  );
}
