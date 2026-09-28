"""
Task 4 Milvus 集成测试 — 真实 Milvus + 真实 DashScope embedding（不 mock 核心链路）

运行 (在 ai-service 目录):
    cd ai-service && /home/opt/.conda/envs/yhzk-ai/bin/python tests/test_task4_milvus_integration.py

覆盖:
- Milvus 真实连接
- 建 collection（固定 schema, 1536 维 COSINE HNSW）
- 插入测试文档 → embedding → search
- 检索结果带 metadata（title/publisher/url/chunk_id）
- COSINE score 方向实测确认（相关文档 similarity 必须高于无关文档）
- user_knowledge 的 user_id 隔离
- citation 从真实检索结果构造

测试数据用独立 source_id / user_id（it_task4_ 前缀），结束清理。
"""
import asyncio
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import ingest_medical_knowledge as ingest  # noqa: E402
from pymilvus import connections, Collection  # noqa: E402

from app.config import settings  # noqa: E402
from app.rag.embeddings import QwenEmbeddings  # noqa: E402
from app.rag.retriever import dual_retrieve  # noqa: E402
from app.rag.citations import build_citations  # noqa: E402

PASS = 0
FAIL = 0
SOURCE_ID = f"it_task4_{uuid.uuid4().hex[:8]}"
USER_A = f"it_user_{uuid.uuid4().hex[:8]}"
USER_B = f"it_user_{uuid.uuid4().hex[:8]}"


def check(name: str, cond: bool, extra: str = ""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  PASS {name}")
    else:
        FAIL += 1
        print(f"  FAIL {name} {extra}")


def main() -> int:
    print("=== connect milvus ===")
    try:
        connections.connect(uri=f"http://{settings.milvus_address}", timeout=10)
    except Exception as e:
        print(f"SKIP: milvus unreachable ({settings.milvus_address}): {e}")
        return 3
    print(f"  connected: {settings.milvus_address}")

    medical = ingest.ensure_collection(ingest.COLLECTION_MEDICAL, with_user_field=True)
    ingest.ensure_collection(ingest.COLLECTION_USER, with_user_field=True)

    embeddings = QwenEmbeddings()

    print("=== insert test docs (real embeddings) ===")
    docs = [
        {"text": "【盐摄入建议】高血压患者每天食盐摄入量建议不超过5克，同时减少腌制食品和咸味酱料。",
         "section": "盐摄入建议"},
        {"text": "【儿童疫苗接种】儿童疫苗接种时间应按照国家免疫规划的安排执行，按时接种。",
         "section": "儿童疫苗接种"},
    ]
    vectors = embeddings.embed_documents([d["text"] for d in docs])
    check("embedding dim 1536", len(vectors) == 2 and len(vectors[0]) == 1536)
    retrieved_at = time.strftime("%Y-%m-%d")
    rows = []
    for i, (d, vec) in enumerate(zip(docs, vectors)):
        rows.append({
            "id": f"{SOURCE_ID}::chunk{i}",
            "text": d["text"],
            "vector": list(vec),
            "source_id": SOURCE_ID,
            "title": "集成测试来源",
            "publisher": "HealthCompanion-IT",
            "url": "https://www.who.int/zh/news-room/fact-sheets/detail/healthy-diet",
            "published_at": "",
            "retrieved_at": retrieved_at,
            "section": d["section"],
            "doc_type": "integration_test",
            "user_id": "",
        })
    try:
        medical.delete(f'source_id == "{SOURCE_ID}"')
    except Exception:
        pass
    medical.insert(rows)
    medical.flush()
    time.sleep(1.0)
    medical.load()

    print("=== real retrieval: query salt intake ===")
    result = asyncio.run(dual_retrieve("高血压每天吃多少盐比较合适？", USER_A, k_user=1, k_general=3))
    general = result.get("general", [])
    check("general hits >= 1", len(general) >= 1, f"got={len(general)}")

    top_salt = next((d for d in general if SOURCE_ID in str(d.metadata.get("chunk_id", ""))), None)
    if top_salt is not None:
        others = [d for d in general if d is not top_salt]
        check("relevant doc found", "盐" in top_salt.page_content)
        if others:
            check("score direction: relevant > irrelevant (COSINE sim higher)",
                  float(top_salt.metadata["score"]) > float(others[0].metadata["score"]),
                  f"rel={top_salt.metadata['score']} other={others[0].metadata['score']}")
        md = top_salt.metadata
        check("metadata roundtrip publisher", md.get("publisher") == "HealthCompanion-IT")
        check("metadata roundtrip chunk_id", SOURCE_ID in str(md.get("chunk_id")))
        check("metadata roundtrip url", "who.int" in str(md.get("url")))
        cites = build_citations(general, limit=3)
        check("citation built from real retrieval", len(cites) >= 1 and cites[0]["publisher"] == "HealthCompanion-IT")
        check("citation has url", any(c["url"] for c in cites))
    else:
        check("relevant doc found", False, "salt chunk not in top hits")

    print("=== user_knowledge isolation ===")
    user_col = Collection(ingest.COLLECTION_USER)
    uvec = embeddings.embed_documents(["我的血压记录"])[0]
    user_rows = [{
        "id": f"{SOURCE_ID}::user0",
        "text": "我的血压记录135/85",
        "vector": list(uvec),
        "source_id": SOURCE_ID,
        "title": "用户私人记录",
        "publisher": "",
        "url": "",
        "published_at": "",
        "retrieved_at": retrieved_at,
        "section": "血压记录",
        "doc_type": "user_memory",
        "user_id": USER_A,
    }]
    try:
        user_col.delete(f'user_id == "{USER_A}"')
    except Exception:
        pass
    user_col.insert(user_rows)
    user_col.flush()
    time.sleep(1.0)
    user_col.load()

    res_a = asyncio.run(dual_retrieve("血压记录", USER_A, k_user=3, k_general=0))
    res_b = asyncio.run(dual_retrieve("血压记录", USER_B, k_user=3, k_general=0))
    check("owner sees own knowledge", len(res_a.get("user", [])) >= 1)
    check("other user isolated", len(res_b.get("user", [])) == 0,
          f"leaked={len(res_b.get('user', []))}")

    print("=== cleanup ===")
    try:
        medical.delete(f'source_id == "{SOURCE_ID}"')
        user_col.delete(f'user_id == "{USER_A}"')
        medical.flush()
        user_col.flush()
        print("  cleaned test rows")
    except Exception as e:
        print(f"  cleanup warning: {e}")

    print(f"\nintegration: PASS={PASS} FAIL={FAIL}")
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
