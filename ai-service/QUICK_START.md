# 🚀 阶段A完成 — Python AI服务快速启动指南

## ✅ 已完成内容

### 阶段A: Python AI服务 (100%)
- ✅ LLM工厂 + DeepSeek连通性
- ✅ ①调度智能体 (意图识别)
- ✅ ④知识库问答智能体 (RAG + 生成答案)
- ✅ LangGraph编排 (orchestrator → knowledge_qa)
- ✅ 真流式SSE接口 (token级流式)
- ✅ 完整测试套件 (6个测试文件,全部通过)

### 阶段B: NestJS集成准备 (90%)
- ✅ AiClientService (Python服务客户端)
- ✅ ChatModule注册
- ✅ 环境变量配置
- ⏳ ChatService灰度切换逻辑 (待实现)

---

## 🎯 快速启动

### 1. 启动Python AI服务

```bash
cd ai-service

# 方式1: 直接启动
python -c "from app.main import app; import uvicorn; uvicorn.run(app, host='0.0.0.0', port=8000)"

# 方式2: 使用uvicorn命令
pip install uvicorn[standard]
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**验证启动成功**:
```bash
curl http://localhost:8000/healthz
# {"status":"ok","service":"yhzk-ai-service","enabled_agents":["orchestrator","knowledge_qa"]}
```

---

### 2. 测试对话功能

#### 测试1: 健康问题
```bash
curl -X POST http://localhost:8000/v1/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "user_message": "高血压怎么控制",
    "user_context": {
      "user_id": "test_user_123",
      "profile_summary": "未建档",
      "scene_mode": "day"
    },
    "conversation_history": [],
    "scene_mode": "day",
    "message_type": "text"
  }'
```

**预期输出**:
```
data: {"type":"thinking","content":"正在分析...","timestamp":...}
data: {"type":"intent","primary":"health_question","confidence":0.95,"timestamp":...}
data: {"type":"token","content":"高","index":0,"timestamp":...}
data: {"type":"token","content":"血","index":1,"timestamp":...}
data: {"type":"token","content":"压","index":2,"timestamp":...}
...
data: {"type":"done","emotion":"neutral","intent":"health_question","timestamp":...}
```

#### 测试2: 通用对话
```bash
curl -X POST http://localhost:8000/v1/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "user_message": "你好",
    "user_context": {"user_id": "test", "profile_summary": "未建档"},
    "conversation_history": [],
    "scene_mode": "day",
    "message_type": "text"
  }'
```

**预期输出**:
```
data: {"type":"thinking",...}
data: {"type":"intent","primary":"general_chat","confidence":0.9,...}
data: {"type":"token","content":"你",...}
data: {"type":"token","content":"好",...}
...
data: {"type":"done","emotion":"happy","intent":"general_chat",...}
```

---

### 3. 运行测试套件

```bash
cd ai-service

# 测试1: LLM连通性
python tests/test_llm_simple.py
# 预期: [SUCCESS] DeepSeek-V3 + R1 都通过

# 测试2: 调度节点
python tests/test_orchestrator.py
# 预期: [PASS] 3/3 tests

# 测试3: 知识库节点
python tests/test_knowledge_qa.py
# 预期: [PASS] 2/2 tests (可能降级到FAQ)

# 测试4: LangGraph完整流程
python tests/test_graph.py
# 预期: [SUCCESS] 3/3 flows

# 测试5: SSE流式
cd ai-service && python -c "..." &  # 先启动服务
python tests/test_stream_real.py
# 预期: [SUCCESS] Task 5 completed
```

---

## 📊 核心功能验证

| 功能 | 验证方法 | 预期结果 |
|------|---------|---------|
| **服务启动** | `curl /healthz` | status: "ok" |
| **意图识别** | 发送"高血压怎么控制" | intent: "health_question" |
| **通用对话** | 发送"你好" | intent: "general_chat", 直接回复 |
| **紧急检测** | 发送"救命胸痛" | should_alert: true |
| **流式推送** | 观察SSE事件 | 逐token推送(不是攒齐后一次性) |
| **降级策略** | 关闭Milvus测试 | 自动降级到FAQ |

---

## 🔄 下一步:NestJS集成

### 当前状态
- ✅ Python服务完全可用
- ✅ AiClientService已创建
- ✅ 环境变量已配置 (`AI_BACKEND=legacy`)
- ⏳ ChatService灰度切换逻辑待实现

### 灰度切换步骤

#### 步骤1: 修改ChatService (待实现)

**文件**: `yhzk-mvp-backend/src/modules/chat/chat.service.ts`

需要添加:
```typescript
import { AiClientService } from './ai-client.service';

export class ChatService {
  constructor(
    private aiClient: AiClientService,  // 注入
    // ... 其他依赖
  ) {}

  async *processMessage(userId, sessionId, message, messageType) {
    // ... 前置检查 ...

    const backend = this.config.get('AI_BACKEND', 'legacy');
    
    // 尝试使用Python AI服务
    if (backend === 'python' && await this.aiClient.isHealthy()) {
      this.logger.log(`User ${userId} routed to Python AI`);
      yield* this.processPythonAI(userId, sessionId, message, messageType);
      return;
    }
    
    // 回退到legacy
    this.logger.log(`User ${userId} using legacy AI`);
    yield* this.processLegacyAI(userId, sessionId, message, messageType);
  }

  private async *processPythonAI(userId, sessionId, message, messageType) {
    const session = await this.getOrCreateSession(userId, sessionId);
    await this.saveMessage({session_id: session.session_id, role:'user', content:message});
    
    const userContext = await this.loadUserContext(userId);
    const history = await this.loadConversationHistory(session.session_id);
    
    let accReply = '';
    
    // 透传Python SSE
    for await (const event of this.aiClient.streamChat({
      user_message: message,
      user_context: userContext,
      conversation_history: history,
      scene_mode: this.getSceneMode(),
    })) {
      if (event.type === 'token') accReply += event.content;
      yield event;  // 原样转发给小程序
    }
    
    // 补充TTS(Python不做)
    if (accReply) {
      const tts = await this.ttsService.synthesize(accReply);
      yield {type:'audio', url:tts.audioUrl, duration:tts.durationSec, timestamp:Date.now()};
      yield {type:'visemes', data:tts.visemeTimeline, timestamp:Date.now()};
    }
    
    // 存assistant消息
    await this.saveMessage({
      session_id: session.session_id,
      role: 'assistant',
      content: accReply,
    });
  }

  private async *processLegacyAI(userId, sessionId, message, messageType) {
    // 现有逻辑保持不变
    // ...
  }
}
```

#### 步骤2: 灰度放量

1. **10%灰度**: 
   ```env
   AI_BACKEND=legacy  # 保持
   # 或改为: AI_BACKEND=python, AI_ROLLOUT_PCT=10
   ```
   观察1天,对比答案质量

2. **50%灰度**:
   ```env
   AI_BACKEND=python
   AI_ROLLOUT_PCT=50
   ```
   持续观察

3. **全量**:
   ```env
   AI_BACKEND=python
   AI_ROLLOUT_PCT=100
   ```

4. **回退**:
   如有问题,秒切回:
   ```env
   AI_BACKEND=legacy
   ```

---

## 📁 项目结构总览

```
炎华众康-主动健康管理系统/
├── ai-service/                      # ✅ Python AI服务 (新)
│   ├── app/
│   │   ├── main.py                 # FastAPI入口
│   │   ├── config.py               # AgentRegistry
│   │   ├── api/chat.py             # SSE接口
│   │   ├── llm/factory.py          # LLM工厂
│   │   ├── graph/
│   │   │   ├── build.py            # LangGraph
│   │   │   ├── state.py            # ChatState
│   │   │   └── nodes/
│   │   │       ├── orchestrator.py # ①调度
│   │   │       └── knowledge_qa.py # ④知识库
│   │   ├── rag/                    # RAG检索
│   │   ├── schemas/                # 数据模型
│   │   └── fallback/               # 降级策略
│   ├── tests/                      # 测试套件
│   ├── .env                        # 环境变量(已配置)
│   └── IMPLEMENTATION_SUMMARY.md   # 实现总结
│
├── yhzk-mvp-backend/               # ✅ NestJS后端
│   ├── src/modules/chat/
│   │   ├── chat.service.ts         # ⏳ 待修改(灰度切换)
│   │   ├── chat.module.ts          # ✅ 已注册AiClientService
│   │   ├── ai-client.service.ts    # ✅ Python客户端
│   │   └── agents/                 # Legacy Agents
│   │       ├── orchestrator.agent.ts
│   │       └── knowledge-qa.agent.ts
│   └── .env                        # ✅ 已添加AI_BACKEND
│
└── yhzk-miniapp/                   # 小程序(无需改动)
    └── src/pages/chat/index.tsx    # 聊天页
```

---

## 🎉 已实现的核心能力

### 1. 意图识别 (①调度智能体)
- ✅ health_question → 路由到知识库
- ✅ general_chat → 直接回复
- ✅ emergency → 触发预警
- ✅ 置信度评估 (0-1)
- ✅ 情绪检测 (neutral/happy/anxious/sad)

### 2. 知识库问答 (④知识库智能体)
- ✅ RAG双库检索 (user + general)
- ✅ DeepSeek-R1生成答案
- ✅ 引用来源标注
- ✅ TTS文本生成
- ✅ 快捷回复生成

### 3. 编排框架 (LangGraph)
- ✅ 条件路由 (intent-based)
- ✅ 状态管理 (ChatState)
- ✅ 可视化trace (LangSmith集成准备)

### 4. 流式输出 (SSE)
- ✅ 真·token级流式
- ✅ 完整事件类型 (thinking/intent/token/done)
- ✅ 错误处理 (error事件)

### 5. 降级策略
- ✅ LLM失败 → 关键词匹配
- ✅ RAG失败 → 本地FAQ
- ✅ Python服务不可用 → Legacy Agent

---

## 📝 环境变量清单

### Python服务 (`ai-service/.env`)
```env
DEEPSEEK_API_KEY=sk-your_deepseek_api_key_here
DASHSCOPE_API_KEY=sk-dev-000000000000000000000000
MILVUS_ADDRESS=localhost:19530
LANGSMITH_TRACING=false
PORT=8000
```

### NestJS服务 (`yhzk-mvp-backend/.env`)
```env
# AI Service (新增)
AI_BACKEND=legacy                   # legacy | python
AI_SERVICE_URL=http://localhost:8000

# DeepSeek (Legacy用)
DEEPSEEK_API_KEY=sk-your_deepseek_api_key_here

# DashScope (Legacy用)
DASHSCOPE_API_KEY=sk-dev-000000000000000000000000
```

---

## 🔧 故障排查

### 问题1: Python服务启动失败
```bash
# 检查依赖
pip list | grep -E "fastapi|langchain|langgraph"

# 检查.env
cat ai-service/.env | grep API_KEY

# 查看详细日志
python -c "from app.main import app; import uvicorn; uvicorn.run(app, port=8000, log_level='debug')"
```

### 问题2: DeepSeek API调用失败
```bash
# 测试连通性
cd ai-service
python tests/test_llm_simple.py

# 如果失败,检查API key
python -c "from app.config import settings; print(settings.deepseek_api_key)"
```

### 问题3: Milvus连接失败
```bash
# 检查Milvus是否运行
curl http://localhost:19530/healthz

# 如果未运行,使用Docker启动
docker-compose up milvus -d

# 降级测试(不依赖Milvus)
python tests/test_knowledge_qa.py
# 应该降级到FAQ,仍然通过
```

### 问题4: SSE流式无响应
```bash
# 检查端口占用
netstat -ano | grep 8000

# 测试非流式接口
curl -X POST http://localhost:8000/v1/chat \
  -d '{"user_message":"test",...}'

# 查看服务日志
# (启动时不加 > /dev/null)
```

---

## 🎯 验收清单

阶段A完成验收:
- [x] Python服务可启动
- [x] /healthz返回OK
- [x] DeepSeek-V3连通性通过
- [x] DeepSeek-R1连通性通过
- [x] 意图识别测试通过 (3/3)
- [x] 知识库问答测试通过 (2/2)
- [x] LangGraph流程测试通过 (3/3)
- [x] SSE流式测试通过
- [x] 降级策略测试通过
- [x] AiClientService已创建
- [x] ChatModule已注册
- [x] 环境变量已配置

阶段B待完成:
- [ ] ChatService灰度切换逻辑
- [ ] 端到端测试 (小程序→NestJS→Python)
- [ ] 答案质量对比测试
- [ ] 性能基准测试

---

## 📞 需要帮助?

**继续完成阶段B**: 告诉我 "继续阶段B",我会实现ChatService灰度切换逻辑

**手动测试**: 告诉我 "我先测试",你自己试试效果

**部署指南**: 告诉我 "部署文档",我给你Docker部署步骤

**代码审查**: 告诉我 "代码审查",我详细解释某个模块的实现

---

**当前状态**: 阶段A ✅ 完成,阶段B 90% 完成,最后一步是实现ChatService灰度切换逻辑(预计30分钟)!
