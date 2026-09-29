# 阶段A完成报告 — Python Agent实现

## ✅ 已完成任务(5/5)

### 任务1:LLM工厂 + DeepSeek连通性测试 ✓ (30分钟)
- **文件**: `app/llm/factory.py`
- **功能**: 根据agent名称返回配置好的ChatOpenAI实例
- **验收**: DeepSeek-V3 + DeepSeek-R1 连通性测试通过
- **测试**: `tests/test_llm_simple.py` — PASS

### 任务2:①调度智能体节点 ✓ (1.5小时)
- **文件**: 
  - `app/graph/nodes/orchestrator.py` — 核心逻辑
  - `app/schemas/intent.py` — 意图决策模型
  - `app/fallback/keyword.py` — 关键词降级
- **功能**: 意图识别(health_question/general_chat/emergency) + 路由决策
- **验收**: 3种意图识别准确
- **测试**: `tests/test_orchestrator.py` — PASS (3/3)

### 任务3:④知识库问答节点 ✓ (2小时)
- **文件**: `app/graph/nodes/knowledge_qa.py`
- **功能**: DeepSeek-R1生成答案；RAG双库检索需启用 `RAG_ENABLED=true` 并连接已有数据的 Milvus (默认关闭)
- **验收**: 能生成答案(Milvus不可用时降级到FAQ)
- **测试**: `tests/test_knowledge_qa.py` — PASS (2/2)

### 任务4:LangGraph装配 ✓ (1小时)
- **文件**:
  - `app/graph/state.py` — ChatState定义
  - `app/graph/build.py` — 状态图构建
- **功能**: orchestrator → [条件路由] → knowledge_qa
- **验收**: 完整流程执行正确
- **测试**: `tests/test_graph.py` — PASS (3/3)

### 任务5:真流式集成 ✓ (1小时)
- **文件**: `app/api/chat.py` (更新)
- **功能**: astream_events集成,真·LLM token流式推送
- **验收**: SSE事件正确推送(thinking → intent → token → done)
- **测试**: `tests/test_stream_real.py` — PASS

---

## 📊 对比:之前 vs 现在

| 维度 | NestJS手写 | Python LangGraph |
|------|-----------|------------------|
| **①调度** | `orchestrator.agent.ts` | ✅ `orchestrator.py` |
| **④知识库** | `knowledge-qa.agent.ts` | ✅ `knowledge_qa.py` |
| **编排框架** | ❌ 手写if/else | ✅ LangGraph StateGraph |
| **流式** | ❌ 伪流式(逐字sleep) | ✅ 真流式(LLM token流) |
| **降级** | ✅ 关键词匹配 | ✅ 关键词+FAQ双降级 |
| **扩展性** | ❌ 加Agent改代码 | ✅ 翻enabled+加节点 |

---

## 🎯 现在可以做什么?

你现在有一个**完整的Python AI服务**:

```bash
# 启动服务
cd ai-service
python -c "from app.main import app; import uvicorn; uvicorn.run(app, port=8000)"

# 测试健康检查
curl http://localhost:8000/healthz

# 测试对话
curl -X POST http://localhost:8000/v1/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "user_message": "高血压怎么控制",
    "user_context": {"user_id": "test"},
    "conversation_history": [],
    "scene_mode": "day"
  }'
# 会看到: thinking → intent(health_question) → [知识库答案] → done
```

---

## 🚀 下一步:阶段B — NestJS集成

### 目标
让小程序的聊天页能**调用Python AI服务**,同时保留NestJS手写Agent作为回退。

### 任务清单(预计2小时)

#### 任务6:NestJS客户端 + 灰度切换 (1.5小时)

**创建文件**: `yhzk-mvp-backend/src/modules/chat/ai-client.service.ts`

```typescript
@Injectable()
export class AiClientService {
  private readonly baseUrl = 'http://localhost:8000';
  
  async *streamChat(input: ChatRequest) {
    // HTTP调用Python SSE,解析事件流
    const response = await axios.post(`${this.baseUrl}/v1/chat/stream`, input, {
      responseType: 'stream'
    });
    
    for await (const line of response.data) {
      if (line.startsWith('data: ')) {
        yield JSON.parse(line.slice(6));
      }
    }
  }
}
```

**修改文件**: `yhzk-mvp-backend/src/modules/chat/chat.service.ts`

```typescript
async *processMessage(userId, sessionId, message) {
  const backend = process.env.AI_BACKEND || 'legacy';
  
  if (backend === 'python' && await this.aiClient.isHealthy()) {
    // 路由到Python
    yield* this.processPythonAI(userId, sessionId, message);
  } else {
    // 回退到legacy
    yield* this.processLegacyAI(userId, sessionId, message);
  }
}
```

**环境变量**: `.env`
```env
AI_BACKEND=python           # python | legacy
AI_SERVICE_URL=http://localhost:8000
```

#### 任务7:对比测试 (30分钟)

**测试用例**:
```typescript
// 对比新旧实现的答案质量
const queries = [
  "高血压怎么控制",
  "你好",
  "救命胸痛"
];

for (const q of queries) {
  const legacyResult = await testLegacy(q);
  const pythonResult = await testPython(q);
  console.log(`质量对比: ${similarity(legacyResult, pythonResult)}`);
}
```

**验收标准**:
- [ ] 答案质量相似度 > 80%
- [ ] 首token延迟 < 2s
- [ ] 总延迟 < 5s
- [ ] 错误率 < 1%

---

## 💾 代码统计

| 类别 | 文件数 | 代码行数 |
|------|--------|---------|
| 核心逻辑 | 5 | ~500行 |
| 测试 | 6 | ~400行 |
| 配置 | 3 | ~100行 |
| **总计** | **14** | **~1000行** |

---

## 📝 要继续吗?

选择下一步:

**A. 继续任务6** → 写NestJS客户端,让小程序能用Python服务

**B. 先手动测试** → 你自己启动服务测试一下,看看效果

**C. 暂停** → 我先消化一下阶段A的代码

**D. 跳过NestJS集成** → 直接给我部署文档,我自己搞

告诉我选哪个!
