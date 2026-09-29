# 炎华众康 AI Service

LangGraph 多 Agent 编排服务,为炎华众康主动健康管理系统提供智能对话能力。

## 快速开始

### 1. 安装依赖

```bash
# 安装 uv (如果还没有)
curl -LsSf https://astral.sh/uv/install.sh | sh

# 安装项目依赖
uv sync
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env,填入 DEEPSEEK_API_KEY 和 DASHSCOPE_API_KEY
```

### 3. 启动服务(Docker Compose)

```bash
# 从项目根目录
cd ..
docker-compose up ai-service
```

### 4. 验证服务

```bash
curl http://localhost:8000/healthz
# 应返回: {"status":"ok","service":"yhzk-ai-service","enabled_agents":["orchestrator","knowledge_qa"]}
```

## 本地开发(不用 Docker)

```bash
# 启动依赖服务
docker-compose up postgres redis milvus

# 本地运行 Python 服务
uv run python -m app.main
# 或
uv run uvicorn app.main:app --reload --port 8000
```

## 架构

```
FastAPI (app/main.py)
  └── LangGraph StateGraph (app/graph/build.py)
        ├─ orchestrator_node (①调度智能体,DeepSeek-V3)
        ├─ knowledge_qa_node (④知识库问答,DeepSeek-R1；Milvus RAG 需启用 `RAG_ENABLED=true`，默认关闭)
        └─ [Phase 2] ②③⑤⑥ 节点(暂未启用)
```

## 当前状态

**阶段 1 任务 1 完成**: ✅ Python 服务骨架 + Docker 接入

**下一步**:
- 任务 2: 实现 Milvus 连接 + Embedding
- 任务 3: NestJS → Python SSE 透传链路
- 任务 4-5: 数据契约 + LLM 工厂

## 文档

详细实施文档见根目录:`AI-SERVICE-LangGraph实施文档.md`
