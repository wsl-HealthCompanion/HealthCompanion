"""
L2 中期记忆 — 会话摘要压缩节点
触发条件: 会话消息数 >= 8 且距上次总结 >= 6 条新消息
"""
import json
import re
from langchain_core.messages import SystemMessage, HumanMessage
from app.llm.factory import get_llm

SUMMARIZER_PROMPT = """你是记忆压缩助手。将以下医疗健康对话压缩为一段不超过 150 字的中文摘要，只保留关键信息：

必须保留:
- 用户提到的新症状、新用药、新过敏
- 用户表达的健康目标或顾虑变化
- AI 给出的重要建议（含具体数值）
- 用户反馈（有效/无效/副作用）

删除:
- 寒暄、问候、感谢
- 重复内容

## 输出 JSON 格式(严格遵守)
{
  "summary": "一段不超过150字的摘要",
  "keyTopics": ["主题1", "主题2", "主题3"]
}

## 示例
对话:
用户: 我血压高怎么办
AI: 建议低盐饮食，每天盐不超过5g
用户: 好的谢谢，那我之前吃的硝苯地平还要继续吗
AI: 请按医嘱服用，不要自行调整

输出:
{
  "summary": "用户咨询高血压控制。AI建议低盐饮食(每天<5g)。用户提到正在服用硝苯地平，AI建议按医嘱服用不要自行调整。",
  "keyTopics": ["高血压", "低盐饮食", "硝苯地平"]
}"""


async def summarizer_node(state: dict) -> dict:
    """
    摘要生成节点
    输入: state 里的 conversation_history (最近 20 条消息)
    输出: { "memory_summary": { "summary": "...", "keyTopics": [...] } }
    """
    # 只取最近 20 条消息做摘要
    history = state.get("conversation_history", [])
    recent = history[-20:]

    if len(recent) < 4:
        # 消息太短不做摘要
        return {"memory_summary": None}

    # 格式化对话
    dialog = "\n".join([
        f"{'用户' if m.get('role') == 'user' else '小炎'}: {m.get('content', '')}"
        for m in recent
    ])

    llm = get_llm("orchestrator")  # 复用 orchestrator 配置 (deepseek-chat, 低成本)

    try:
        response = await llm.ainvoke([
            SystemMessage(content=SUMMARIZER_PROMPT),
            HumanMessage(content=f"对话记录:\n{dialog}"),
        ])

        content = response.content if hasattr(response, 'content') else str(response)

        # 解析 JSON
        json_match = re.search(r'\{[\s\S]*\}', content)
        if not json_match:
            raise ValueError(f"No JSON found: {content[:100]}")

        result = json.loads(json_match.group(0))
        return {
            "memory_summary": {
                "summary": result.get("summary", ""),
                "keyTopics": result.get("keyTopics", []),
            }
        }
    except Exception as e:
        print(f"[Summarizer] Failed: {e}")
        return {"memory_summary": None}
