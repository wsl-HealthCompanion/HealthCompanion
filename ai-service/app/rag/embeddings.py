"""
通义千问 text-embedding-v3 封装
1536 维向量,与现有 NestJS embedding.service.ts 对齐
"""
from langchain_core.embeddings import Embeddings
from typing import List
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import settings


class QwenEmbeddings(Embeddings):
    """DashScope text-embedding（1536维）

    说明：text-embedding-v3 不支持 1536 维（仅 [64..1024]），
    实测 text-embedding-v4 + parameters.dimension=1536 可用（2026-09），
    与 Milvus schema 的 1536 维对齐。模型可经 EMBEDDING_MODEL 覆盖。
    """

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or settings.dashscope_api_key
        self.url = "https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding"
        self.model = getattr(settings, "embedding_model", None) or "text-embedding-v4"
        self.dimension = 1536

    @retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=1, max=3), reraise=True)
    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """批量向量化"""
        if not texts:
            return []

        try:
            response = httpx.post(
                self.url,
                json={
                    "model": self.model,
                    "input": {"texts": texts},
                    "parameters": {"dimension": self.dimension},
                },
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                timeout=10.0,
            )
            response.raise_for_status()
            data = response.json()
            embeddings = [e["embedding"] for e in data["output"]["embeddings"]]
            return embeddings
        except Exception as e:
            # 嵌入失败: 抛异常让调用方走无RAG路径, 绝不返回零向量
            # 零向量在Milvus中会返回随机结果 → 错误的医疗建议
            raise RuntimeError(
                f"Embedding API unreachable. Check DASHSCOPE_API_KEY and network. "
                f"Original error: {e}"
            ) from e

    def embed_query(self, text: str) -> List[float]:
        """单个文本向量化"""
        return self.embed_documents([text])[0]
