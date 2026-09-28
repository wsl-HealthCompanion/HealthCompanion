"""
Milvus 双知识库检索 (Task 4)
在 Task 前身架构上增强:
1. 并行查询 user_knowledge(用户专属, user_id 过滤) + medical_knowledge(通用医学)
2. 检索结果保留 page_content + metadata + score（citation 必须能还原出处）
3. 任意失败 → 返回空（RAG 降级安全：绝不阻塞主链路，绝不编造来源）

score 方向说明（由集成测试 test_rag_milvus.py 实测确认后固定）：
- collection 指标为 COSINE。Milvus 对 COSINE 返回 distance = 1 - cosine_similarity，
  即数值越小越相似；langchain_milvus 的 similarity_search_with_score 透传该值。
- 本模块统一换算为 similarity ∈ [0,1]（越大越相关）写入 metadata["score"]，
  方向换算有集成测试守护。
"""
from typing import List, Dict, Any

from langchain_core.documents import Document
from langchain_milvus import Milvus

from app.rag.embeddings import QwenEmbeddings
from app.config import settings


# 全局单例 embedding 实例
_embedding = QwenEmbeddings()

METRIC_COSINE = "COSINE"
METRIC_IP = "IP"
METRIC_L2 = "L2"


def get_vector_store(collection_name: str) -> Milvus:
    """获取 Milvus 向量存储实例（连接已存在、由 ingestion 显式建好的 collection）"""
    return Milvus(
        embedding_function=_embedding,
        collection_name=collection_name,
        connection_args={"uri": f"http://{settings.milvus_address}"},
        text_field="text",
        vector_field="vector",
    )


def _get_metric_type(collection_name: str) -> str:
    """读取 collection 向量字段的 metric（失败时按 COSINE 处理， ingestion 固定用 COSINE）"""
    try:
        from pymilvus import Collection
        col = Collection(collection_name)
        for idx in col.indexes:
            metric = (idx.params or {}).get("metric_type")
            if metric:
                return str(metric).upper()
    except Exception:
        pass
    return METRIC_COSINE


def _normalize_score(raw_score: float, metric: str) -> float:
    """
    把 Milvus 原始 score 换算为 similarity（越大越相关）。
    - COSINE: raw = 1 - cos_sim（小者更相关）→ sim = 1 - raw
    - IP:     raw 即内积相似度（大者更相关）→ sim = raw
    - L2:     欧氏距离（小者更相关）→ sim = 1 / (1 + raw)
    """
    try:
        raw = float(raw_score)
    except (TypeError, ValueError):
        return 0.0
    if metric == METRIC_L2:
        return round(1.0 / (1.0 + max(raw, 0.0)), 6)
    if metric == METRIC_IP:
        return round(max(raw, 0.0), 6)
    # COSINE（ingestion 固定指标）
    return round(max(0.0, min(1.0, 1.0 - raw)), 6)


def _attach_scores(pairs: List[tuple], metric: str) -> List[Document]:
    docs: List[Document] = []
    for doc, score in pairs:
        doc.metadata["score"] = _normalize_score(score, metric)
        doc.metadata["metric"] = metric
        docs.append(doc)
    return docs


async def dual_retrieve(
    query: str,
    user_id: str,
    k_user: int = 3,
    k_general: int = 2,
) -> Dict[str, List[Document]]:
    """
    双知识库检索（与 NestJS rag.service.ts 架构对齐）

    Returns:
        {"user": [Document...], "general": [Document...]}
        每个 Document.metadata 额外携带 score（similarity，越大越相关）与全部来源字段。
        任一库失败 → 该库返回空列表（RAG 降级，不抛异常、不阻塞主链路）。
    """
    user_docs: List[Document] = []
    general_docs: List[Document] = []

    try:
        user_store = get_vector_store("user_knowledge")
        metric = _get_metric_type("user_knowledge")
        pairs = user_store.similarity_search_with_score(
            query,
            k=k_user,
            expr=f'user_id == "{user_id}"',
        )
        user_docs = _attach_scores(pairs, metric)
    except Exception as e:
        print(f"[RAG] user_knowledge retrieval degraded: {e}")

    try:
        general_store = get_vector_store("medical_knowledge")
        metric = _get_metric_type("medical_knowledge")
        pairs = general_store.similarity_search_with_score(query, k=k_general)
        general_docs = _attach_scores(pairs, metric)
    except Exception as e:
        print(f"[RAG] medical_knowledge retrieval degraded: {e}")

    return {"user": user_docs, "general": general_docs}


def format_context_for_llm(docs: Dict[str, List[Document]]) -> str:
    """
    将检索结果格式化为 LLM prompt 上下文（只含正文；metadata 仅供 citation builder 使用）
    """
    parts = []

    if docs.get("user"):
        user_texts = [doc.page_content for doc in docs["user"]]
        parts.append("## 用户专属知识 (L3)\n" + "\n".join(user_texts))

    if docs.get("general"):
        general_texts = [doc.page_content for doc in docs["general"]]
        parts.append("## 通用医学知识 (L1)\n" + "\n".join(general_texts))

    return "\n\n".join(parts) if parts else "暂无相关知识库内容"


async def index_document(
    collection: str,
    doc_id: str,
    text: str,
    metadata: Dict[str, Any] | None = None,
) -> None:
    """索引单条文档（动态添加知识；ingestion 批量导入请用 scripts/ingest_medical_knowledge.py）"""
    try:
        store = get_vector_store(collection)
        doc = Document(page_content=text, metadata=metadata or {})
        store.add_documents([doc], ids=[doc_id])
        print(f"Document {doc_id} indexed to {collection}")
    except Exception as e:
        print(f"Failed to index document {doc_id}: {e}")
        raise
