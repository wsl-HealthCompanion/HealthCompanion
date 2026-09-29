from types import SimpleNamespace

import pytest

from app.rag.citations import build_citations


def test_citations_preserve_document_source_and_excerpt():
    docs = {
        "user": [
            SimpleNamespace(
                page_content="患者已登记的过敏史为青霉素。",
                metadata={"source": "health_profile.pdf"},
            )
        ],
        "general": [
            SimpleNamespace(
                page_content="收缩压和舒张压需要结合测量条件解读。",
                metadata={"title": "家庭血压测量指南"},
            )
        ],
    }

    assert build_citations(docs) == [
        {"source": "health_profile.pdf", "text": "患者已登记的过敏史为青霉素。"},
        {"source": "家庭血压测量指南", "text": "收缩压和舒张压需要结合测量条件解读。"},
    ]


def test_citations_skip_empty_documents_and_limit_excerpt_length():
    docs = {
        "general": [
            SimpleNamespace(page_content="  ", metadata={"source": "empty"}),
            SimpleNamespace(page_content="甲" * 400, metadata={"id": "doc-2"}),
        ]
    }

    citations = build_citations(docs, excerpt_limit=120)

    assert citations == [{"source": "doc-2", "text": "甲" * 120}]


@pytest.mark.asyncio
async def test_knowledge_qa_attaches_retrieved_citations(monkeypatch):
    from app.graph.nodes import knowledge_qa

    docs = {
        "user": [],
        "general": [
            SimpleNamespace(
                page_content="家庭血压应在静坐后测量。",
                metadata={"title": "家庭血压测量指南"},
            )
        ],
    }

    async def no_cache():
        return None

    async def retrieve(*args, **kwargs):
        return docs

    class StubLLM:
        async def astream(self, _messages):
            yield SimpleNamespace(content="好的！测量血压前先静坐。")

    monkeypatch.setattr(knowledge_qa, "_get_redis", no_cache)
    monkeypatch.setattr(knowledge_qa.settings, "rag_enabled", True)
    monkeypatch.setattr(knowledge_qa, "dual_retrieve", retrieve)
    monkeypatch.setattr(knowledge_qa, "format_context_for_llm", lambda _docs: "参考内容")
    monkeypatch.setattr(knowledge_qa, "get_llm", lambda _name: StubLLM())

    result = await knowledge_qa.knowledge_qa_node({
        "user_message": "怎么测血压？",
        "user_context": {"user_id": "test-user"},
        "conversation_history": [],
    })

    assert result["agent_outputs"]["knowledge_qa"]["citations"] == [
        {"source": "家庭血压测量指南", "text": "家庭血压应在静坐后测量。"}
    ]
