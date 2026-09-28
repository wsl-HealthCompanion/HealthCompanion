"""
Milvus 双知识库检索
复刻 NestJS rag.service.ts 的逻辑:
1. 并行查询 user_knowledge(用户专属) + medical_knowledge(通用医学)
2. 支持 user_id 过滤
3. 返回 Top-K 文档
"""
from typing import List, Dict, Any
from langchain_milvus import Milvus
from langchain_core.documents import Document

from app.rag.embeddings import QwenEmbeddings
from app.config import settings


# 全局单例 embedding 实例
_embedding = QwenEmbeddings()


def get_vector_store(collection_name: str) -> Milvus:
    """获取 Milvus 向量存储实例"""
    return Milvus(
        embedding_function=_embedding,
        collection_name=collection_name,
        connection_args={"uri": f"http://{settings.milvus_address}"},
        text_field="text",
        vector_field="vector",
    )


async def dual_retrieve(
    query: str,
    user_id: str,
    k_user: int = 3,
    k_general: int = 2,
) -> Dict[str, List[Document]]:
    """
    双知识库并行检索(与 NestJS rag.service.ts 对齐)

    Args:
        query: 查询文本
        user_id: 用户ID(用于过滤 user_knowledge)
        k_user: 用户知识库返回数量
        k_general: 通用知识库返回数量

    Returns:
        {"user": [...], "general": [...]}
    """
    try:
        # 用户专属知识库(带 user_id 过滤)
        user_store = get_vector_store("user_knowledge")
        user_docs = user_store.similarity_search(
            query,
            k=k_user,
            expr=f'user_id == "{user_id}"',  # Milvus 过滤表达式
        )
    except Exception as e:
        print(f"User knowledge retrieval failed: {e}")
        user_docs = []

    try:
        # 通用医学知识库(无过滤)
        general_store = get_vector_store("medical_knowledge")
        general_docs = general_store.similarity_search(query, k=k_general)
    except Exception as e:
        print(f"General knowledge retrieval failed: {e}")
        general_docs = []

    return {"user": user_docs, "general": general_docs}


def format_context_for_llm(docs: Dict[str, List[Document]]) -> str:
    """
    将检索结果格式化为 LLM prompt 的上下文
    (对齐 knowledge-qa.agent.ts 的格式)
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
    """
    索引文档到 Milvus(Phase 2 用于动态添加知识)

    Args:
        collection: 集合名(user_knowledge / medical_knowledge)
        doc_id: 文档ID
        text: 文档文本
        metadata: 元数据(如 user_id, source, created_at)
    """
    try:
        store = get_vector_store(collection)
        doc = Document(page_content=text, metadata=metadata or {})
        store.add_documents([doc], ids=[doc_id])
        print(f"Document {doc_id} indexed to {collection}")
    except Exception as e:
        print(f"Failed to index document {doc_id}: {e}")
