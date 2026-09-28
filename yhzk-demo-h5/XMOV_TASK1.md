# XmovAvatar Task 1

本页用于隔离验证魔珐星云 XmovAvatar 具身驱动，不接入现有 DeepSeek、LangGraph、LiveTalking 或 SRS 主链路。

## 目标

验证以下最小闭环：

```text
init -> idle -> listen -> think -> speak -> interrupt -> interactiveidle
                                      |
                                      +-> destroy -> init
```

## 本地配置

不要把真实 App ID / App Secret 提交到 Git。

在 `yhzk-demo-h5/.env.local` 中填写：

```env
VITE_XMOV_APP_ID=你的AppID
VITE_XMOV_APP_SECRET=你的AppSecret
```

其余配置已有默认值。如需覆盖：

```env
VITE_XMOV_SDK_URL=https://media.xingyun3d.com/xingyun3d/general/litesdk/xmovAvatar@latest.js
VITE_XMOV_GATEWAY_URL=https://nebula-agent.xingyun3d.com/user/v1/ttsa/session
VITE_XMOV_AUTHORIZATION=888jn
```

仓库根目录的 `.gitignore` 已忽略 `.env` 和 `.env.*`，仅保留 `.env.example`。

> Task 1 仅用于本地验证。`VITE_*` 变量会进入浏览器构建产物，因此比赛正式部署前需要再次确认魔珐对 App Secret 的生产接入要求，不能把本地开发方式直接当作服务端保密方案。

## 启动

```bash
cd yhzk-demo-h5
npm install
npm run dev
```

浏览器打开：

```text
http://localhost:5173/xmov-task1.html
```

魔珐 JS SDK 的部分能力要求 `localhost` 或 HTTPS 环境，不建议通过普通 HTTP 的非 localhost 地址验证。

## 验收

依次点击：

1. 待机
2. 倾听
3. 思考
4. 说话
5. 打断
6. 互动待机
7. 销毁
8. 重新初始化

“说话”固定使用：

> 你好，我是康伴智生，你的具身AI健康陪伴助手。

验收时确认：

- 3D 数字人正常渲染；
- 状态切换没有 SDK 异常；
- 中文播报有声音、口型和动作；
- 打断可以停止当前播报；
- 销毁后可以重新初始化；
- 刷新页面可以再次初始化；
- Git diff 中不存在真实 App ID / App Secret。

## Task 1 与现有系统的边界

Task 1 使用独立入口 `xmov-task1.html`，不会改动生产入口 `index.html -> App.tsx`，也不会启动原有 LiveTalking 会话。

Task 2 再把现有 SSE 事件：

```text
thinking / intent / speech_chunk / done
```

映射到 XmovAvatar 的：

```text
think / speak(streaming) / interactiveidle
```
