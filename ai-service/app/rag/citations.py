from typing import Any


_SOURCE_LABELS = {
    "user": "用户知识库",
    "general": "通用医学知识库",
}


def build_citations(
    doc_groups: dict[str, list[Any]],
    excerpt_limit: int = 240,
    max_citations: int = 5,
) -> list[dict[str, str]]:
    """Return short, displayable citations for the documents used in a RAG answer."""
    citations: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()

    for group in ("user", "general"):
        for document in doc_groups.get(group, []):
            text = str(getattr(document, "page_content", "") or "").strip()
            if not text:
                continue

            metadata = getattr(document, "metadata", {}) or {}
            source = next(
                (
                    str(metadata[key]).strip()
                    for key in ("source", "title", "document_name", "file_name", "doc_id", "id")
                    if metadata.get(key)
                ),
                _SOURCE_LABELS.get(group, "知识库"),
            )
            citation_key = (source, text)
            if citation_key in seen:
                continue

            seen.add(citation_key)
            citations.append({"source": source, "text": text[:excerpt_limit].rstrip()})
            if len(citations) >= max_citations:
                return citations

    return citations
