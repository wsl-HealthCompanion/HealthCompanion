# 炎华众康 HealthCompanion

炎华众康是一个由 H5、NestJS API 与 Python AI 服务组成的健康陪伴项目。仓库提供独立的匿名文字 Demo 构建；正式入口仍保留登录和健康建档流程。

> **在线体验暂未开放。** 2026-09-29 的只读检查发现公网 TCP 443 连接超时，服务器 Nginx 配置的是自签名证书，`/api/` 仍代理到现有 `:4000` API，未发现将 `X-Forwarded-For` 覆盖为 `$remote_addr` 的规则；服务器代码版本 `a2be847` 也不是这次更新的 Demo 版本。当前不能安全发布公网链接。

## 本机运行 Demo（Windows）

需要 Node.js 24 或更新版本、Python 3.11 或更新版本。首次启动会在本机安装缺少的 Node/Python 依赖；服务仅绑定 `127.0.0.1`。

```powershell
.\start-demo.ps1
```

浏览器会打开 [http://localhost:5273](http://localhost:5273)。按 `Ctrl+C` 停止本次启动的服务。

模型 API Key 是可选的。需要模型回答时，将 [ai-service/.env.example](ai-service/.env.example) 复制为 `ai-service/.env`，填写 `DEEPSEEK_API_KEY`（以及使用知识库时的 `DASHSCOPE_API_KEY`），再重启。不要把真实密钥提交到仓库。Demo 不启用 RAG；知识库回答和引用需要另行配置 Milvus、填充知识库并启用 `RAG_ENABLED`。

本地对话由 NestJS 保存在 `yhzk-mvp-backend/data/yhzk-mvp-dev.sqlite`，并发送到已配置的 AI 服务处理。该文件留在本机。**请勿输入真实姓名、电话、病史、检查结果或用药信息。**

Demo 仅提供文字聊天和静态回退形象，不连接 Xmov、LiveTalking 或 TTS。完整的登录后数字人链路还需要单独部署 LiveTalking、TTS、SRS 与对应模型文件。

## 架构与 CI

查看[系统架构图](系统架构图.md)，包含本地 Demo、受发布门槛保护的公网形态、AI/RAG 数据流和正式数字人链路。

每个 Pull Request 及推送到 `main` 都运行 [GitHub Actions CI](.github/workflows/frontend-ci.yml)：Frontend Build、Frontend Tests、NestJS Build、NestJS Jest 和 Python pytest。

## 主要目录

- `yhzk-demo-h5/`：React + Vite H5。
- `yhzk-mvp-backend/`：NestJS API、认证、聊天与数据持久化。
- `ai-service/`：FastAPI + LangGraph；RAG 默认关闭。
- `scripts/start-demo.mjs`、`start-demo.ps1`：Windows 本机 Demo 启动器。
