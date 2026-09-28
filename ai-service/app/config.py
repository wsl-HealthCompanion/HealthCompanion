"""
AI Service Configuration
环境变量驱动配置,对齐 NestJS agentRegistry
"""
from pydantic import BaseModel
from pydantic_settings import BaseSettings
from typing import Literal


class AgentConfig(BaseModel):
    """单个 Agent 配置"""
    enabled: bool
    provider: Literal["deepseek", "qwen"]
    model: str
    timeout: float  # 秒
    temperature: float = 0.3
    max_tokens: int = 1024


class Settings(BaseSettings):
    """全局配置(从环境变量读取)"""
    # LLM API Keys
    deepseek_api_key: str = ""
    dashscope_api_key: str = ""

    # API Base URLs
    deepseek_base_url: str = "https://api.deepseek.com/v1"
    qwen_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"

    # Milvus
    milvus_address: str = "localhost:19530"
    # RAG 开关 — Milvus 未部署/无知识库时关闭, knowledge_qa 直接用模型自身知识(方案B)
    # 关闭可省去 ~4.6s 的 Milvus 连接超时 + embedding 网络往返
    rag_enabled: bool = False
    # 知识库版本 — ingestion 更新知识库后递增，使 FAQ 缓存中的旧 citation 失效
    rag_kb_version: str = "v1"

    # Redis (与 NestJS 端共用)
    redis_url: str = "redis://:redis_dev_2024@localhost:6379/0"

    # 可观测
    langsmith_tracing: bool = False
    langsmith_api_key: str = ""

    # 服务
    port: int = 8000

    class Config:
        env_file = ".env"


settings = Settings()


# Agent Registry — 与 NestJS agents.config.ts 同源
AGENT_REGISTRY: dict[str, AgentConfig] = {
    # MVP 已启用
    "orchestrator": AgentConfig(
        enabled=True,
        provider="deepseek",
        model="deepseek-chat",  # DeepSeek-V3
        timeout=8.0,  # 给足时间, API 高峰也会慢; 超时后自动降级到关键词匹配
        temperature=0.0,
        max_tokens=200,
    ),
    "knowledge_qa": AgentConfig(
        enabled=True,
        provider="deepseek",
        # DeepSeek-V3 (deepseek-chat) — 非推理模型, 无 <think> 块, 首 token 快.
        # 之前用 deepseek-reasoner(R1) 会先生成长思考块, 造成 ~5-15s 延迟且不流式.
        model="deepseek-chat",
        timeout=12.0,
        temperature=0.3,
        max_tokens=300,   # 约180字，3-5个要点，生成时间约1-2s
    ),
    # Phase 2 — 翻 enabled 即启用
    "data_organizer": AgentConfig(
        enabled=False,
        provider="qwen",
        model="qwen-turbo",
        timeout=5.0,
        temperature=0.3,
        max_tokens=1024,
    ),
    "vitals_monitor": AgentConfig(
        enabled=False,
        provider="qwen",
        model="qwen-turbo",  # 实际是规则引擎+LLM混合
        timeout=2.0,
        temperature=0.3,
        max_tokens=512,
    ),
    "rehab_fitness": AgentConfig(
        enabled=False,
        provider="qwen",
        model="qwen-plus",
        timeout=8.0,
        temperature=0.3,
        max_tokens=2048,
    ),
    "llm_analyzer": AgentConfig(
        enabled=False,
        provider="deepseek",
        model="deepseek-reasoner",  # 异步深度分析
        timeout=30.0,
        temperature=0.3,
        max_tokens=3072,
    ),
}


def get_enabled_agents() -> list[str]:
    """获取已启用的 Agent 列表"""
    return [name for name, cfg in AGENT_REGISTRY.items() if cfg.enabled]
