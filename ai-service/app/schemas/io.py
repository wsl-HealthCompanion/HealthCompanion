"""
输入输出数据模型
与 NestJS AgentInput/AgentOutput 对齐
"""
import base64

from pydantic import BaseModel, Field, field_validator
from typing import Literal

# ===== M0 VLM 场景识别 — 附件契约(已冻结,与 NestJS 约定一致) =====
MAX_ATTACHMENTS = 4  # 附件数组长度 0~4
MAX_IMAGE_BYTES = 2 * 1024 * 1024  # 单张图片解码后 ≤ 2MB
ALLOWED_IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp"}

_DATA_URI_PREFIX = "data:"
_BASE64_MARK = ";base64,"


class Attachment(BaseModel):
    """
    多模态附件(图片) — M0 VLM 场景识别
    data 为完整 data URI, 如 "data:image/jpeg;base64,/9j/4AAQ..."
    """
    kind: Literal["image"]
    mime: str
    data: str

    @field_validator("mime")
    @classmethod
    def _validate_mime(cls, v: str) -> str:
        # 与 NestJS SendMessageDto.images 白名单保持一致, 不放宽到任意 image/*
        if v not in ALLOWED_IMAGE_MIMES:
            raise ValueError(
                f"附件 mime 仅支持 {'/'.join(sorted(ALLOWED_IMAGE_MIMES))}, 收到: {v}"
            )
        return v

    @field_validator("data")
    @classmethod
    def _validate_data(cls, v: str) -> str:
        if not v.startswith(_DATA_URI_PREFIX):
            raise ValueError("附件 data 必须是完整的 data URI(以 data: 开头)")
        if _BASE64_MARK not in v:
            raise ValueError("附件 data 必须是 base64 编码的 data URI(包含 ;base64,)")
        b64_part = v.split(_BASE64_MARK, 1)[1]
        try:
            raw = base64.b64decode(b64_part, validate=True)
        except Exception:
            raise ValueError("附件图片的 base64 内容无法解码")
        if not raw:
            raise ValueError("附件图片内容为空")
        if len(raw) > MAX_IMAGE_BYTES:
            raise ValueError(
                f"单张图片解码后大小不能超过 {MAX_IMAGE_BYTES // (1024 * 1024)}MB"
                f"(当前约 {len(raw) / (1024 * 1024):.1f}MB)"
            )
        return v


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
    attachments: list[Attachment] = Field(default_factory=list)  # M0 拍照问一问

    @field_validator("attachments")
    @classmethod
    def _check_attachments_count(cls, v: list[Attachment]) -> list[Attachment]:
        if len(v) > MAX_ATTACHMENTS:
            raise ValueError(f"最多附带 {MAX_ATTACHMENTS} 张图片, 收到 {len(v)} 张")
        return v


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
