"""
输入输出数据模型
与 NestJS AgentInput/AgentOutput 对齐
"""
from pydantic import BaseModel, Field
from typing import Literal


class Message(BaseModel):
    """对话消息"""
    role: Literal["user", "assistant", "system"]
    content: str
    timestamp: str | None = None


class UserContext(BaseModel):
    """用户上下文"""
    user_id: str
    profile_summary: str = "未建档"
    vital_snapshot: dict | None = None
    active_alerts: list | None = None
    plan_completion_today: str | None = None
    scene_mode: str = "day"


class ChatRequest(BaseModel):
    """聊天请求"""
    user_message: str
    message_type: Literal["text", "voice", "quick_reply"] = "text"
    conversation_history: list[Message] = Field(default_factory=list)
    user_context: dict = Field(default_factory=dict)
    scene_mode: str = "day"
    downgrade_level: Literal["none", "L1", "L2"] = "none"
    recent_intents: list[str] = Field(default_factory=list)
    recent_memories: list[str] = Field(default_factory=list)  # L2 中期记忆


class Citation(BaseModel):
    """引用来源"""
    source: str
    text: str


class ChatResponse(BaseModel):
    """聊天响应(非流式)"""
    intent: str | None = None
    confidence: float | None = None
    routing: list[str] = Field(default_factory=list)
    final_reply: str
    tts_text: str | None = None
    quick_replies: list[str] = Field(default_factory=list)
    citations: list[Citation] = Field(default_factory=list)
    emotion_detected: str = "neutral"
    should_alert: bool = False
    latency_ms: int = 0
