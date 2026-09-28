"""
Citation 构建 (Task 4)

铁律：引用只能来自 Milvus Document.metadata（ingestion 时写入的真实来源），
缺失到无法还原出处的文档直接跳过。禁止任何"看起来像来源"的编造。
"""
from typing import Any, Dict, List

from langchain_core.documents import Document

# citation 中来源摘要的最大长度（正文截断，不朗读）
_SNIPPET_MAX_LEN = 120


def _clean(value: Any) -> str:
    return str(value or "").strip()


def build_citations(docs: List[Document], limit: int = 3) -> List[Dict[str, str]]:
    """
    从检索结果构造 citation 列表。

    规则：
    - 顺序保留检索排序（user 优先于 general 由调用方拼接顺序决定）
    - 同一 url 只保留第一条（同一文档多 chunk 去重）
    - 无 url 且无 chunk_id 的文档跳过（无法还原出处，绝不编造）
    - 最多返回 limit 条（默认 3）
    """
    seen_urls: set[str] = set()
    seen_chunk_ids: set[str] = set()
    citations: List[Dict[str, str]] = []

    for doc in docs:
        md = doc.metadata or {}
        url = _clean(md.get("url"))
        chunk_id = _clean(md.get("chunk_id")) or _clean(md.get("pk"))
        title = _clean(md.get("title"))
        publisher = _clean(md.get("publisher"))

        if not url and not chunk_id:
            continue
        if url and url in seen_urls:
            continue
        if chunk_id and chunk_id in seen_chunk_ids:
            continue

        seen_urls.add(url)
        seen_chunk_ids.add(chunk_id)

        citations.append({
            "source": publisher or title or url,
            "title": title,
            "url": url,
            "publisher": publisher,
            "text": (doc.page_content or "").strip()[:_SNIPPET_MAX_LEN],
            "chunk_id": chunk_id,
        })

        if len(citations) >= limit:
            break

    return citations
