"""
LangGraph 状态定义
ChatState 包含整个对话流程的状态
"""
from typing import TypedDict, Literal, NotRequired


class ChatState(TypedDict):
    """
    对话状态(LangGraph State)
    包含输入、中间状态、输出
    """
    # ===== 输入 =====
    user_message: str
    message_type: Literal["text", "voice", "quick_reply"]
    conversation_history: list[dict]
    user_context: dict
    scene_mode: str
    downgrade_level: NotRequired[Literal["none", "L1", "L2"]]
    recent_intents: NotRequired[list[str]]

    # ===== ① Orchestrator 产出 =====
    intent: NotRequired[str]
    confidence: NotRequired[float]
    routing: NotRequired[list[str]]
    query_for_agents: NotRequired[str]
    final_reply: NotRequired[str]
    emotion_detected: NotRequired[str]
    should_alert: NotRequired[bool]

    # ===== 各 Agent 产出 =====
    agent_outputs: NotRequired[dict]  # {"knowledge_qa": {...}, "data_organizer": {...}}
