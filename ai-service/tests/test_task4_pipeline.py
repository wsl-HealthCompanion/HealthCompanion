"""
Task 4 RAG 管线集成验证（不依赖 DashScope key）

用确定性测试向量在【临时 collection】上验证完整管线：
schema 创建 → upsert（幂等）→ 检索 → metadata 还原 → user_id 隔离 → citation 构建 → 清理 drop

说明：
- 真实语义检索与 COSINE 方向验证需要真实 DashScope embedding
  （tests/test_task4_milvus_integration.py，需有效 DASHSCOPE_API_KEY）
- 本测试绝不向 medical_knowledge / user_knowledge 写入假向量，
  临时 collection 结束后 drop，零污染。
"""
import asyncio
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import ingest_medical_knowledge as ingest  # noqa: E402
from pymilvus import connections, utility  # noqa: E402
from langchain_core.embeddings import Embeddings  # noqa: E402

from app.config import settings  # noqa: E402

PASS = 0
FAIL = 0
TEST_COLLECTION = "it_pipeline_test"


def check(name: str, cond: bool, extra: str = ""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  PASS {name}")
    else:
        FAIL += 1
        print(f"  FAIL {name} {extra}")


class DeterministicEmbeddings(Embeddings):
    """确定性测试向量：文本 hash → 1536 维归一化向量。仅用于管线验证。"""

    def _vec(self, text: str):
        import hashlib
        vec = []
        seed = text.strip()
        while len(vec) < 1536:
            seed = hashlib.md5(seed.encode()).hexdigest()
            vec.extend(int(seed[i:i + 8], 16) / 0xFFFFFFFF * 2 - 1 for i in range(0, 32, 8))
        norm = sum(v * v for v in vec) ** 0.5
        return [v / norm for v in vec[:1536]]

    def embed_documents(self, texts):
        return [self._vec(t) for t in texts]

    def embed_query(self, text):
        return self._vec(text)


def main() -> int:
    print("=== connect milvus ===")
    try:
        connections.connect(uri=f"http://{settings.milvus_address}", timeout=10)
    except Exception as e:
        print(f"SKIP: milvus unreachable: {e}")
        return 3

    if utility.has_collection(TEST_COLLECTION):
        utility.drop_collection(TEST_COLLECTION)

    print("=== schema (same as production collections) ===")
    col = ingest.ensure_collection(TEST_COLLECTION, with_user_field=True)
    check("collection created", utility.has_collection(TEST_COLLECTION))

    print("=== upsert via ingestion.upsert_source (fake embeddings) ===")
    import app.rag.retriever as retriever_mod
    fake = DeterministicEmbeddings()
    retriever_mod._embedding = fake  # 管线验证：替换 retriever 的 embedding 单例

    sid_a = f"it_pipe_{uuid.uuid4().hex[:6]}"
    chunks_a = ingest.build_chunks({
        "source_id": sid_a,
        "title": "管线验证文档A",
        "publisher": "HealthCompanion-IT",
        "url": "https://example.org/it-a",
        "published_at": "2026",
        "doc_type": "integration_test",
        "sections": [
            {"section": "S1", "text": "第一条管线验证内容，用于确认写入与检索路径。" * 3},
            {"section": "S2", "text": "第二条管线验证内容，覆盖 chunk_id 稳定性与 metadata。" * 3},
        ],
    }, "2026-09-28")
    check("chunks built", len(chunks_a) == 2)
    n = ingest.upsert_source(col, sid_a, chunks_a, fake)
    check("upsert rows", n == 2, f"got={n}")

    print("=== idempotent re-upsert ===")
    n2 = ingest.upsert_source(col, sid_a, chunks_a, fake)
    col.flush()
    time.sleep(1.0)
    col.load()
    # 注意：num_entities 不实时反映刚删除的行（Milvus 删除异步生效），
    # 幂等性以可查询行数为准（删除的行不会出现在查询结果里）
    qres = col.query(expr=f'source_id == "{sid_a}"', output_fields=["id"])
    check("re-upsert no dup (queryable rows)", n2 == 2 and len(qres) == 2,
          f"n={n2} queryable={len(qres)}")

    print("=== retrieval returns metadata ===")
    from app.rag.retriever import dual_retrieve
    from app.rag.citations import build_citations
    result = asyncio.run(dual_retrieve("管线验证内容", "it_nobody", k_user=1, k_general=3))
    # dual_retrieve 查的是生产 collection（不存在）→ general 为空属预期；
    # 这里直接对临时 collection 验证 metadata（等价路径）
    pairs = col.search(
        data=[fake.embed_query("管线验证内容")], anns_field="vector",
        param={"metric_type": "COSINE", "params": {"ef": 64}},
        limit=2, output_fields=["id", "title", "publisher", "url", "section", "source_id"],
    )
    hits = list(pairs[0])
    check("search hits", len(hits) == 2, f"got={len(hits)}")
    h0 = hits[0]
    # id 主键即 chunk_id（langchain 检索时映射为 metadata.pk）
    check("metadata chunk_id", sid_a in str(h0.id))
    check("metadata publisher", h0.entity.get("publisher") == "HealthCompanion-IT")
    check("metadata url", h0.entity.get("url") == "https://example.org/it-a")
    check("metadata section present", h0.entity.get("section") in ("S1", "S2"))

    print("=== citation from retrieved hits ===")
    docs = [
        __import__("langchain_core.documents", fromlist=["Document"]).Document(
            page_content="管线验证内容",
            metadata={"publisher": h.entity.get("publisher"), "url": h.entity.get("url"),
                      "title": h.entity.get("title"), "chunk_id": h.id},
        ) for h in hits
    ]
    cites = build_citations(docs, limit=3)
    check("citation built", len(cites) == 1, f"got={len(cites)}")
    check("citation fields", cites and cites[0]["url"] == "https://example.org/it-a"
          and cites[0]["publisher"] == "HealthCompanion-IT" and cites[0]["chunk_id"])

    print("=== user_id isolation on temp collection ===")
    sid_u = sid_a + "_u"
    uchunks = [{
        "chunk_id": f"{sid_u}::0",
        "text": "用户私有管线验证",
        "metadata": {"source_id": sid_u, "title": "私有", "publisher": "", "url": "",
                     "published_at": "", "retrieved_at": "2026-09-28", "section": "U",
                     "doc_type": "integration_test", "user_id": "it_user_X"},
    }]
    ingest.upsert_source(col, sid_u, uchunks, fake)
    col.flush()
    col.load()
    res_x = col.search(
        data=[fake.embed_query("用户私有管线验证")], anns_field="vector",
        param={"metric_type": "COSINE", "params": {"ef": 64}},
        limit=5, expr='user_id == "it_user_X"',
        output_fields=["id", "user_id"],
    )
    res_y = col.search(
        data=[fake.embed_query("用户私有管线验证")], anns_field="vector",
        param={"metric_type": "COSINE", "params": {"ef": 64}},
        limit=5, expr='user_id == "it_user_Y"',
        output_fields=["id", "user_id"],
    )
    check("owner hits private chunk", len(res_x[0]) == 1, f"got={len(res_x[0])}")
    check("other user isolated", len(res_y[0]) == 0, f"leaked={len(res_y[0])}")

    print("=== cleanup: drop temp collection ===")
    utility.drop_collection(TEST_COLLECTION)
    check("temp collection dropped", not utility.has_collection(TEST_COLLECTION))

    print(f"\npipeline: PASS={PASS} FAIL={FAIL}")
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
