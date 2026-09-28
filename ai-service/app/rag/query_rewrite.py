"""
检索查询改写 (Task 4)
解决多轮追问的检索语义缺失问题：

    Q1: 高血压平时饮食需要注意什么？
    Q2: 那每天盐摄入多少比较合适？   ← "那"依赖上下文，单独 embedding 检索不到盐摄入资料

优先级：
1. orchestrator 已结合历史输出的 query_for_agents（LLM 改写）——若可用直接采用
2. 短追问启发式：取最近一条用户消息做主题拼接（不把整段对话塞进 embedding）
3. 兜底：原始问题
纯函数，无 IO，可单测。
"""
import re
from typing import List, Dict, Any

# 明显依赖上下文的短追问前缀/特征
_FOLLOWUP_PREFIX = re.compile(
    r"^(那|这|还有|然后|另外|再|其次|每次|每天|哪些|多少|几种|怎么办|怎么吃|怎么降|怎么治疗|有什么)"
)
_MAX_FOLLOWUP_LEN = 16
_TOPIC_MAX_LEN = 30


def is_short_followup(query: str) -> bool:
    """判断是否为明显依赖上下文的短追问"""
    q = (query or "").strip()
    if not q or len(q) > _MAX_FOLLOWUP_LEN:
        return False
    return bool(_FOLLOWUP_PREFIX.match(q))


def _last_user_message(history: List[Dict[str, Any]] | None) -> str:
    for m in reversed(history or []):
        role = (m.get("role") or "").lower()
        if role in ("user", "human") and (m.get("content") or "").strip():
            return m["content"].strip()
    return ""


def build_retrieval_query(
    current_query: str,
    conversation_history: List[Dict[str, Any]] | None = None,
    rewritten_query: str | None = None,
) -> str:
    """
    构造用于向量检索的查询。

    Args:
        current_query: 用户原始消息
        conversation_history: 对话历史 [{role, content}]
        rewritten_query: orchestrator 结合历史给出的改写查询(query_for_agents)

    Returns:
        检索查询文本。示例：
            current="那每天盐摄入多少比较合适？"
            last_user="高血压平时饮食需要注意什么？"
            → "高血压平时饮食需要注意什么 那每天盐摄入多少比较合适"
    """
    current = (current_query or "").strip()
    llm = (rewritten_query or "").strip()

    # 1) LLM 改写可用：与原文不同且有实质内容（凝练的改写同样有效）
    if llm and llm != current and len(llm) >= 6:
        return llm

    # 2) 短追问启发式：最近一条用户消息主题 + 当前问题
    if _last_user_message_ok(last := _last_user_message(conversation_history)) and is_short_followup(current):
        topic = re.sub(r"[。！？?!，,\s]+$", "", last)[:_TOPIC_MAX_LEN]
        return f"{topic} {current}"

    # 3) 兜底：原始问题
    return current or llm


def _last_user_message_ok(last: str) -> bool:
    return bool(last)
