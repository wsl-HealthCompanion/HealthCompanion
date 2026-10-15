"""
场景理解节点 — 带图消息的视觉理解(M0 拍照问一问)

设计要点:
- 带图消息在 build.py 预路由直达本节点, 不经 orchestrator(它的意图表是纯文本, 看不到图)
- provider 必须是 qwen(通义 VL), DeepSeek 无视觉能力
- VLM 输出坏 JSON / 调用失败 → 降级为纯文本回复, 不抛错(不炸 SSE 流)
"""
import json
import re

from langchain_core.messages import HumanMessage

from app.llm.factory import get_llm

SYSTEM_PROMPT = """你是炎华众康主动健康管理系统的AI助手"小炎"。用户发来了照片和一句话。

请看图回答:
1. description: 画面里有什么(场景/人物/正在做什么), 用一两句通俗的话描述
2. assessment: 结合用户的问题给出判断或建议; 涉及疾病/用药时必须加一句"具体请咨询健康顾问"
3. exercise: 画面是已知训练动作时填对应标识, 否则填 unknown。已知: shoulder_raise(抬肩练习), squat(深蹲)
4. emotion_detected: 根据画面和用户的话判断情绪: happy/neutral/concerned/anxious/sad

## 输出JSON格式(严格遵守, 不要输出 JSON 以外的内容)
{"intent": "scene_query", "exercise": "unknown", "description": "...", "assessment": "...", "quick_replies": ["..."], "emotion_detected": "neutral"}

## 语气要求
面向老年用户: 温和、耐心、大白话、不堆术语, 回复不超过100字。"""

DEGRADED_REPLY = "抱歉，我刚才没看清这张照片，请再发一次好吗？"


def _build_multimodal_message(user_message: str, image_data_uris: list[str]) -> HumanMessage:
    content: list[dict] = [
        {"type": "text", "text": f"{SYSTEM_PROMPT}\n\n用户的问题: {user_message or '请看看这张照片'}"}
    ]
    for uri in image_data_uris:
        content.append({"type": "image_url", "image_url": {"url": uri}})
    return HumanMessage(content=content)


def _extract_text(response) -> str:
    text = response.content if hasattr(response, "content") else str(response)
    if isinstance(text, list):  # 多模态返回可能是 content blocks
        text = "".join(
            part.get("text", "") for part in text if isinstance(part, dict)
        )
    return text if isinstance(text, str) else str(text)


def _parse_llm_json(text: str) -> dict | None:
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        return None
    try:
        parsed = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _degraded(reply: str) -> dict:
    return {
        "intent": "scene_query",
        "emotion_detected": "neutral",
        "agent_outputs": {
            "scene_understand": {
                "final_reply": reply,
                "exercise": "unknown",
                "description": reply,
                "assessment": "",
                "quick_replies": [],
            }
        },
    }


async def scene_understand_node(state: dict) -> dict:
    """
    场景理解节点(VLM)

    Args:
        state: ChatState, 需含 attachments(非空, 已由预路由保证)与 user_message

    Returns:
        intent=scene_query + agent_outputs.scene_understand{final_reply, exercise, ...}
    """
    attachments = state.get("attachments") or []
    image_uris = [
        a.get("data", "") for a in attachments if isinstance(a, dict) and a.get("data")
    ]
    user_message = state.get("user_message", "")

    try:
        llm = get_llm("scene_understand")
        response = await llm.ainvoke([_build_multimodal_message(user_message, image_uris)])
        parsed = _parse_llm_json(_extract_text(response))

        if not parsed:
            # 契约: VLM 输出坏 JSON → 原文当描述降级, 不抛错
            raw = _extract_text(response).strip()
            return _degraded(raw or DEGRADED_REPLY)

        description = (parsed.get("description") or "").strip()
        assessment = (parsed.get("assessment") or "").strip()
        reply = f"{description} {assessment}".strip() or DEGRADED_REPLY
        quick_replies = parsed.get("quick_replies")
        return {
            "intent": "scene_query",
            "emotion_detected": parsed.get("emotion_detected", "neutral"),
            "agent_outputs": {
                "scene_understand": {
                    "final_reply": reply,
                    "exercise": parsed.get("exercise", "unknown"),
                    "description": description,
                    "assessment": assessment,
                    "quick_replies": quick_replies if isinstance(quick_replies, list) else [],
                }
            },
        }
    except Exception as e:  # VLM 超时/网络/配额 — 降级不抛错, 保住 SSE 流
        print(f"[scene_understand] LLM failed: {e}")
        return _degraded(DEGRADED_REPLY)
