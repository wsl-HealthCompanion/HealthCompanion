"""
Milvus 双知识库检索 (Task 4)

在原架构上增强:
1. 并行查询 user_knowledge(用户专属, user_id 过滤) + medical_knowledge(通用医学)
2. 检索结果保留 page_content + metadata + score（citation 必须能还原出处）
3. 任意失败 → 返回空（RAG 降级安全：绝不阻塞主链路，绝不编造来源）

实现说明：
- 直接使用 pymilvus 检索。langchain_milvus 0.3.3 的 MilvusClient 懒连接与内部
  ORM Collection 路径不兼容（ConnectionNotExistException, 实测 2026-09-28），
  直接 pymilvus 路径稳定且与 ingestion/测试一致。

score 方向说明（集成测试确认）：
- collection 指标为 COSINE。Milvus 返回 distance = 1 - cosine_similarity，
  数值越小越相似；本模块统一换算为 similarity ∈ [0,1]（越大越相关）写入 metadata["score"]。
"""
from typing import List, Dict, Any

from langchain_core.documents import Document
from pymilvus import Collection, connections

from app.rag.embeddings import QwenEmbeddings
from app.config import settings


# 全局单例 embedding 实例
_embedding = QwenEmbeddings()

METRIC_COSINE = "COSINE"
METRIC_IP = "IP"
METRIC_L2 = "L2"

OUTPUT_FIELDS = [
    "text", "source_id", "title", "publisher", "url",
    "published_at", "retrieved_at", "section", "doc_type", "user_id",
]


def _ensure_connection() -> None:
    """确保 pymilvus default 连接已建立（幂等）"""
    try:
        if not connections.has_connection("default"):
            connections.connect(
                alias="default",
                uri=f"http://{settings.milvus_address}",
                timeout=10,
            )
    except Exception as e:
        print(f"[RAG] milvus connect failed: {e}")


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


def _search(
    collection_name: str,
    query: str,
    k: int,
    expr: str | None = None,
) -> List[Document]:
    """单库检索：query 向量化 → pymilvus search → Document(page_content, metadata+score)"""
    _ensure_connection()
    col = Collection(collection_name)
    col.load()
    query_vec = _embedding.embed_query(query)
    search_params = {"metric_type": METRIC_COSINE, "params": {"ef": 128}}
    results = col.search(
        data=[query_vec],
        anns_field="vector",
        param=search_params,
        limit=k,
        expr=expr,
        output_fields=OUTPUT_FIELDS,
    )
    docs: List[Document] = []
    for hits in results:
        for h in hits:
            ent = h.entity
            metadata: Dict[str, Any] = {}
            for field in OUTPUT_FIELDS:
                metadata[field] = ent.get(field)
            metadata["pk"] = str(h.id)          # 主键即 chunk_id
            metadata["chunk_id"] = str(h.id)
            metadata["score"] = _normalize_score(h.distance, METRIC_COSINE)
            metadata["metric"] = METRIC_COSINE
            metadata["collection"] = collection_name
            docs.append(Document(page_content=ent.get("text") or "", metadata=metadata))
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
        每个 Document.metadata 携带 score（similarity，越大越相关）与全部来源字段。
        任一库失败 → 该库返回空列表（RAG 降级，不抛异常、不阻塞主链路）。
    """
    user_docs: List[Document] = []
    general_docs: List[Document] = []

    try:
        user_docs = _search(
            "user_knowledge", query, k_user,
            expr=f'user_id == "{user_id}"',
        )
    except Exception as e:
        print(f"[RAG] user_knowledge retrieval degraded: {e}")

    try:
        general_docs = _search("medical_knowledge", query, k_general)
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
    """索引单条文档（动态添加知识；批量导入请用 scripts/ingest_medical_knowledge.py）"""
    try:
        _ensure_connection()
        col = Collection(collection)
        col.load()
        md = metadata or {}
        row = {
            "id": doc_id,
            "text": text,
            "vector": _embedding.embed_query(text),
            "source_id": str(md.get("source_id", "")),
            "title": str(md.get("title", "")),
            "publisher": str(md.get("publisher", "")),
            "url": str(md.get("url", "")),
            "published_at": str(md.get("published_at", "")),
            "retrieved_at": str(md.get("retrieved_at", "")),
            "section": str(md.get("section", "")),
            "doc_type": str(md.get("doc_type", "")),
            "user_id": str(md.get("user_id", "")),
        }
        col.insert([row])
        col.flush()
        print(f"Document {doc_id} indexed to {collection}")
    except Exception as e:
        print(f"Failed to index document {doc_id}: {e}")
        raise
