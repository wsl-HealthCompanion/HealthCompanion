"""
FastAPI 主入口
提供健康检查接口,后续挂载 chat 路由
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from app.config import settings, get_enabled_agents

app = FastAPI(
    title="炎华众康 AI Service",
    description="LangGraph Multi-Agent Orchestration",
    version="0.1.0",
)

# CORS(允许 NestJS 调用)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境改为具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def health_check():
    """健康检查"""
    return {
        "status": "ok",
        "service": "yhzk-ai-service",
        "enabled_agents": get_enabled_agents(),
    }


@app.get("/readyz")
async def readiness_check():
    """就绪检查(后续加 Milvus/LLM 连通性检查)"""
    checks = {
        "api": "ok",
        # TODO: 检查 Milvus 连接
        # TODO: 检查 DeepSeek API 可达
    }
    return {"status": "ready", "checks": checks}


# 挂载 chat 路由
from app.api.chat import router as chat_router
app.include_router(chat_router)


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=True,  # 开发模式
    )
