"""
④知识库问答智能体节点
职责:RAG检索 + 生成答案 + 高频问题缓存(Redis)
"""
import json
import re
import hashlib
import redis.asyncio as aioredis

from langchain_core.prompts import ChatPromptTemplate
from app.llm.factory import get_llm
from app.rag.retriever import dual_retrieve, format_context_for_llm
from app.rag.citations import build_citations
from app.rag.query_rewrite import build_retrieval_query
from app.fallback.keyword import fallback_faq
from app.config import settings
from app.utils.speech_stream import normalize_speech_piece

FA_CACHE_KEY_PREFIX = "faq_cache:"
FA_CACHE_TTL = 3600
FA_CACHE_MAX_ENTRIES = 200


def _kb_version() -> str:
    """知识库版本 — ingestion 更新后递增，使旧 citation 缓存自然失效"""
    return (settings.rag_kb_version or "v0").strip()

_redis: aioredis.Redis | None = None


async def _get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        try:
            _redis = aioredis.from_url(
                settings.redis_url,
                socket_connect_timeout=2,
                socket_timeout=2,
                decode_responses=False,
            )
            await _redis.ping()
        except Exception as e:
            print(f"[FAQ Cache] Redis unavailable ({e}), falling back to no cache")
            _redis = False
    return _redis if _redis is not False else None


def _cache_key(question: str, user_id: str) -> str:
    # key 携带知识库版本：知识库更新(版本递增)后旧缓存整体失效，
    # 避免知识库已更新但旧 citation 被 TTL 窗口内长期沿用
    q_hash = hashlib.md5(question.lower().strip().encode()).hexdigest()
    return f"{FA_CACHE_KEY_PREFIX}{_kb_version()}:{user_id}:{q_hash}"


SYSTEM_PROMPT = """你是炎华众康的健康知识助手。基于以下知识库回答用户问题。
你的回答会被数字人朗读出来。

## 核心规则（最高优先级）

【第一句话的格式 — 铁律】第一句话必须且只能是以下三种之一，后面直接接正文不加任何标点：
"好的！"（用户提问时用）
"明白了！"（用户描述症状时用）
"嗯！"（用户打招呼时用）
正确：用户问"血糖多少"→"好的！空腹血糖正常范围是..."
错误：好的 → 缺感叹号
错误：好的，→ 用了逗号

- 150字以内，最多3到5个要点，挑最重要的说，不要穷举
- 用短句口语，像朋友聊天一样
- 禁止任何括号 —— 错：荔枝（含糖高） 对：荔枝含糖高
- 禁止 - * 列表符号，禁止 --- 分隔线
- 禁止英文单位，全部用中文
- 涉及用药和治疗，提醒咨询健康顾问
- 直接输出答案正文，不要JSON和格式标记"""


prompt_template = ChatPromptTemplate.from_messages([
    ("system", SYSTEM_PROMPT),
    ("user", "对话历史:\n{history}\n\n知识库:\n{context}\n\n用户问题: {question}"),
])

SYSTEM_WITHOUT_RAG = """你是炎华众康的健康知识助手。你服务的是40-80岁的中老年用户，你的回答会被数字人口语播报。

## 核心规则（最高优先级）

【第一句话的格式 — 铁律】你的第一句话必须且只能是以下三种之一，后面直接接正文，不能加句号逗号冒号：
"好的！"（用户提问时用）
"明白了！"（用户描述症状时用）
"嗯！"（用户打招呼时用）
正确示例：用户问"血糖多少"→你答"好的！空腹血糖正常范围是..."
错误示例：用户问"血糖多少"→你答"好的"→错！没感叹号
错误示例：用户问"血糖多少"→你答"好的，空腹血糖"→错！用了逗号

你是一个语音助手，回答会被朗读出来。必须做到：
- 每次回答开头必须带确认词+感叹号（硬性规则，后面紧跟正文，不能加逗号句号）：
  用户提问 → 用"好的！"
  用户描述身体情况/症状 → 用"明白了！"
  用户闲聊/打招呼 → 用"嗯！"
  确认词和正文直接连在一起，中间不要加别的字。示例：用户问"血糖多少正常"→你答"好的！空腹血糖控制在4.4到7.0毫摩尔每升比较理想"
- 150字以内，最多3到5个要点，挑最重要的说，不要穷举
- 用短句口语，像朋友聊天一样，不要教科书式的列举
- 禁止任何括号 —— 错：荔枝（含糖高） 对：荔枝含糖高
- 禁止 - * 列表符号，禁止 --- 分隔线
- 禁止英文单位（cm/kg/m/ml/mg），全部用中文
- 涉及用药和治疗，提醒咨询健康顾问
- 输出纯文本"""

prompt_without_rag = ChatPromptTemplate.from_messages([
    ("system", SYSTEM_WITHOUT_RAG),
    ("user", "用户问题: {question}"),
])


async def knowledge_qa_node(state: dict) -> dict:
    raw_question = state["user_message"]
    # orchestrator 结合历史给出的改写查询（query_for_agents），是回答/检索语义的首选来源
    question = state.get("query_for_agents") or raw_question
    user_id = state["user_context"]["user_id"]

    redis_client = await _get_redis()
    if redis_client:
        try:
            cached = await redis_client.get(_cache_key(question, user_id))
            if cached:
                return json.loads(cached)
        except Exception as e:
            print(f"[FAQ Cache] Read failed: {e}, continuing without cache")

    try:
        context = ""
        citations: list[dict] = []
        if settings.rag_enabled:
            # Task 4：检索查询走 build_retrieval_query（优先 LLM 改写，
            # 短追问自动拼接历史主题，解决"那每天盐摄入多少"类追问检索不到的问题）
            history_for_rewrite = state.get("conversation_history", [])
            retrieval_query = build_retrieval_query(raw_question, history_for_rewrite, question)
            print(f"[RAG] retrieval_query={retrieval_query!r} (raw={raw_question!r})")
            docs = await dual_retrieve(retrieval_query, user_id, k_user=3, k_general=2)
            context = format_context_for_llm(docs)
            # citation 只能来自检索结果的 metadata（去重、上限 3 条），禁止模型编造
            citations = build_citations(
                [*(docs.get("user") or []), *(docs.get("general") or [])],
                limit=3,
            )
        else:
            print("[RAG] disabled, answering without knowledge base")

        history = state.get("conversation_history", [])
        history_text = "\n".join([
            f"{'用户' if m.get('role') == 'user' else '小炎'}: {m.get('content', '')}"
            for m in history[-6:]
        ]) if history else "无历史对话"

        memories = state.get("recent_memories", [])
        memory_text = ""
        if memories:
            memory_lines = [f"- {m}" for m in memories]
            memory_text = "\n## 历史会话记忆\n" + "\n".join(memory_lines)

        # 注入用户档案摘要 — knowledge_qa 也需要知道在跟谁说话
        profile = state.get("user_context", {}).get("profile_summary", "")
        profile_text = f"\n## 当前用户档案\n{profile}" if profile and profile != "未建档" else ""

        if context and context != "暂无相关知识库内容":
            q = f"{profile_text}{memory_text}\n\n{question}" if (profile_text or memory_text) else question
            messages = prompt_template.format_messages(context=context, question=q, history=history_text)
        else:
            q = f"{profile_text}{memory_text}\n\n{question}" if (profile_text or memory_text) else question
            messages = prompt_without_rag.format_messages(question=q)

        llm = get_llm("knowledge_qa")
        answer_parts = []
        async for chunk in llm.astream(messages):
            piece = chunk.content if hasattr(chunk, "content") else str(chunk)
            if piece:
                answer_parts.append(piece)
        answer = "".join(answer_parts).strip()

        if not answer:
            return {"agent_outputs": {"knowledge_qa": fallback_faq(question)}}

        final_result = {
            "agent_outputs": {
                "knowledge_qa": {
                    "final_reply": answer,
                    "tts_text": normalize_speech_piece(answer),
                    "citations": citations,
                    "quick_replies": [],
                }
            }
        }
        if redis_client:
            try:
                await redis_client.setex(_cache_key(question, user_id), FA_CACHE_TTL, json.dumps(final_result))
            except Exception as e:
                print(f"[FAQ Cache] Write failed: {e}")
        return final_result

    except Exception as e:
        print(f"Knowledge QA failed: {e}, falling back to FAQ")
        import traceback
        traceback.print_exc()
        return {"agent_outputs": {"knowledge_qa": fallback_faq(question)}}


async def get_cache_stats() -> dict:
    redis_client = await _get_redis()
    if not redis_client:
        return {"backend": "disabled", "size": 0, "max": FA_CACHE_MAX_ENTRIES, "ttl_sec": FA_CACHE_TTL}
    try:
        keys = await redis_client.keys(f"{FA_CACHE_KEY_PREFIX}*")
        return {"backend": "redis", "size": len(keys), "max": FA_CACHE_MAX_ENTRIES, "ttl_sec": FA_CACHE_TTL}
    except Exception:
        return {"backend": "redis", "size": -1, "max": FA_CACHE_MAX_ENTRIES, "ttl_sec": FA_CACHE_TTL, "error": "unreachable"}
