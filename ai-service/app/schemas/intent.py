"""
意图决策输出模型
对齐 orchestrator.agent.ts 的输出结构
"""
from pydantic import BaseModel, Field
from typing import Literal


class IntentDecision(BaseModel):
    """
    ①调度智能体的意图识别结果
    对齐 NestJS orchestrator.agent.ts 的 IntentResult
    """
    intent: Literal[
        "health_question",  # 健康知识提问
        "general_chat",     # 通用对话/寒暄
        "emergency",        # 紧急情况
        # Phase 2 扩展意图
        "symptom_report",   # 症状报告
        "vital_query",      # 体征查询
        "exercise_help",    # 运动康复
        "deep_analysis",    # 深度分析
        "medication_query", # 用药咨询
    ]

    confidence: float = Field(ge=0.0, le=1.0, description="置信度 0-1")

    routing: list[str] = Field(
        default_factory=list,
        description="需要调用的 Agent 列表,如 ['knowledge_qa']"
    )

    query_for_agents: str = Field(
        default="",
        description="转发给专业 Agent 的查询文本(可能经过改写)"
    )

    final_reply: str = Field(
        default="",
        description="直接回复的文本(general_chat 时必填)"
    )

    emotion_detected: Literal["neutral", "happy", "anxious", "sad"] = Field(
        default="neutral",
        description="检测到的用户情绪"
    )

    should_alert: bool = Field(
        default=False,
        description="是否需要触发预警(紧急情况)"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "intent": "health_question",
                "confidence": 0.92,
                "routing": ["knowledge_qa"],
                "query_for_agents": "高血压如何控制",
                "final_reply": "",
                "emotion_detected": "neutral",
                "should_alert": False
            }
        }
