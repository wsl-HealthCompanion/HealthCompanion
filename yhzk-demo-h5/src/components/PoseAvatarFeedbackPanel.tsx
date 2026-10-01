import { useCallback, useState } from 'react';
import type { PoseAvatarFeedbackState } from '../pose/poseAvatarFeedback';
import XmovAvatarPlayer from './XmovAvatarPlayer';

interface Props {
  feedback: PoseAvatarFeedbackState;
  onAvailabilityChange: (ready: boolean) => void;
}

export function PoseAvatarFeedbackPanel({ feedback, onAvailabilityChange }: Props) {
  const [connected, setConnected] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const availability = useCallback((available: boolean) => {
    setReady(available);
    onAvailabilityChange(available);
  }, [onAvailabilityChange]);

  const disconnect = () => {
    availability(false);
    setConnected(false);
  };

  const reconnect = () => {
    availability(false);
    setAttempt((value) => value + 1);
    setConnected(true);
  };

  return (
    <section className="pose-lab__panel pose-avatar" aria-label="数字人陪练">
      <h2>数字人陪练</h2>
      <p>连接后会用语音提示姿势，并用点头和点赞回应。请先连接，再开始训练。</p>
      <p className="pose-avatar__note">打招呼、点头和点赞是互动反馈；动作要求请看训练提示。</p>
      {connected && (
        <div className="pose-avatar__stage">
          <XmovAvatarPlayer
            key={attempt}
            showDevControls={false}
            presentation="training"
            onAvailabilityChange={availability}
          />
        </div>
      )}
      <div className="pose-avatar__feedback" aria-live="polite" aria-atomic="true">
        {feedback.error ? (
          <p className="pose-lab__error">{feedback.error}</p>
        ) : feedback.text ? (
          <p><strong>康伴智生：</strong>{feedback.text}</p>
        ) : (
          <p>{!connected ? '尚未连接数字人，摄像头练习可以独立使用。'
            : ready ? '数字人已连接，等待新的训练反馈。'
              : '数字人尚未就绪，摄像头练习可以继续。'}</p>
        )}
      </div>
      <div className="pose-avatar__controls">
        {connected ? (
          <>
            <button type="button" onClick={disconnect}>断开数字人</button>
            <button type="button" onClick={reconnect}>重新连接</button>
          </>
        ) : <button type="button" onClick={reconnect}>连接数字人</button>}
      </div>
    </section>
  );
}
