import ReactDOM from 'react-dom/client';
import XmovAvatarPlayer from './components/XmovAvatarPlayer';
import './xmov-task1.scss';

function XmovTask1Page() {
  return (
    <main className="xmov-task1-page">
      <section className="xmov-task1-copy">
        <span className="xmov-task1-badge">Task 1 · 魔珐星云具身驱动</span>
        <h1>康伴智生</h1>
        <p>
          独立验证 XmovAvatar 的初始化、待机、倾听、思考、说话、打断与互动待机状态。
          本页面不连接 DeepSeek、LangGraph 或原 LiveTalking 链路。
        </p>
      </section>
      <section className="xmov-task1-stage">
        <XmovAvatarPlayer showDevControls />
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('xmov-task1-root')!).render(
  <XmovTask1Page />,
);
