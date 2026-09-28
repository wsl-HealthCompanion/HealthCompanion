# XmovAvatar Task 2 — SSE 流式具身对话

Task 2 把 HealthyDigitalHuman 现有 AI SSE 事件映射到 XmovAvatar，使模型回答可以边生成边驱动数字人说话。

## 事件映射

```text
后端 SSE                 XmovAvatar
------------------------------------------------
thinking                 think()
intent                   保存 intent / emotion 上下文
speech_chunk #0          speak(text, true,  false)
speech_chunk #1..N       speak(text, false, false)
done                     speak("",   false, true)
新一轮消息 / 取消         interrupt()
```

原 LiveTalking 链路仍然保留。运行时通过 `VITE_AVATAR_PROVIDER` 切换：

```env
VITE_AVATAR_PROVIDER=xmov
```

如果不显式填写 `VITE_AVATAR_PROVIDER`，且本地已经配置 Xmov App ID / App Secret，则前端自动选择 Xmov。

## 本地配置

真实凭据只写 `yhzk-demo-h5/.env.local`：

```env
VITE_XMOV_APP_ID=你的AppID
VITE_XMOV_APP_SECRET=你的AppSecret
VITE_AVATAR_PROVIDER=xmov
```

不要把 `.env.local` 提交到 Git。

## 主应用验证

```bash
cd yhzk-demo-h5
npm install
npm run dev
```

打开：

```text
https://localhost:5273/
```

完成登录和建档后进入数字人页。

## Task 2 验收路径

### 1. Thinking

发送任意健康问题，例如：

```text
高血压平时饮食要注意什么？
```

预期：

- 页面发送消息后进入 thinking；
- XmovAvatar 同步进入思考状态；
- 原 LiveTalking 不创建会话。

### 2. Streaming speech

后端产生第一条 `speech_chunk` 后：

- 数字人立即开始说话；
- 不等待完整回答生成；
- 后续 `speech_chunk` 顺序追加；
- 页面文字 token 继续实时显示。

### 3. Done

SSE 收到 `done` 后：

- 流式 speak 收到结束标记；
- 已排队语音继续正常播完；
- 数字人结束后回到互动待机状态。

### 4. Interrupt

在上一轮尚未完成时开始新一轮，或者离开当前会话：

- 上一轮生成请求被 AbortController 取消；
- XmovAvatar 当前播报被中断；
- 旧轮次排队的 speech chunk 因 generation 不匹配自动丢弃；
- 新轮次从新的 `isStart=true` 开始。

### 5. JSON fallback

若 SSE 不可用：

- 仍走现有 `/chat/send` JSON 回退；
- 回答按原分句规则拆分；
- XmovAvatar 使用同一流式队列播放；
- 最后正常发送 end marker。

## 实现说明

`src/services/xmovAvatar.ts` 是 Task 2 新增的运行时桥接层。它负责：

- 将 React 渲染组件拥有的 XmovAvatarProvider 暴露给业务层；
- 为每轮对话分配 generation；
- 串行化 speak 调用，避免 speech_chunk 乱序；
- 新轮次开始时使旧队列失效；
- 对流式起始/中间/结束标志进行统一管理；
- SDK 出错时不阻塞文本聊天主链路。

`App.tsx` 不直接操作底层 `window.XmovAvatar`，只调用桥接层，因此后续 Task 3 可以继续在 bridge 上增加情绪动作映射，不需要再次重写聊天流程。

## Task 3 预留

Task 2 已把 `intent` 和 `emotion` 写入当前 Xmov round context，但暂时不改变动作。下一阶段再实现：

```text
emotion + intent
      ↓
Expression Planner
      ↓
SSML / KA Action / speaking style
```
