"""
SSE 事件模型
与 NestJS sse-event.dto.ts 一一对应,保证契约一致
"""
from pydantic import BaseModel
from typing import Literal


class SSEThinking(BaseModel):
    """思考状态事件"""
    type: Literal["thinking"] = "thinking"
    content: str
    timestamp: int


class SSEIntent(BaseModel):
    """意图识别结果事件"""
    type: Literal["intent"] = "intent"
    primary: str
    confidence: float
    timestamp: int


class SSEToken(BaseModel):
    """token 流式输出事件"""
    type: Literal["token"] = "token"
    content: str
    index: int
    timestamp: int


class SSESpeechChunk(BaseModel):
    """经过清洗并切分完成的数字人朗读文本事件"""
    type: Literal["speech_chunk"] = "speech_chunk"
    text: str
    index: int
    timestamp: int


class SSECitation(BaseModel):
    """引用来源事件"""
    type: Literal["citation"] = "citation"
    source: str
    text: str
    timestamp: int


class SSEQuickReplies(BaseModel):
    """快捷回复事件"""
    type: Literal["quick_replies"] = "quick_replies"
    replies: list[dict]
    timestamp: int


class SSEDone(BaseModel):
    """完成事件"""
    type: Literal["done"] = "done"
    emotion: str
    intent: str | None = None
    timestamp: int


class SSEError(BaseModel):
    """错误事件"""
    type: Literal["error"] = "error"
    code: str
    message: str
    timestamp: int
