"""
Task 4 单元测试 — RAG 检索查询改写 / citation 构建 / 降级安全

运行 (在 ai-service 目录, 运行环境解释器):
    cd ai-service && /home/opt/.conda/envs/yhzk-ai/bin/python tests/test_task4_rag.py

覆盖:
- build_retrieval_query: LLM 改写优先 / 短追问拼接历史主题 / 无历史 / 原样兜底
- is_short_followup 判定
- build_citations: metadata 构造 / url 去重 / 缺失跳过 / 上限 3
- Milvus 不可达: dual_retrieve 降级为空, 不抛异常
- Embedding 失败: 抛 RuntimeError（绝不返回零向量）
- RAG disabled: build_citations 空输入为空
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from langchain_core.documents import Document

from app.rag.query_rewrite import build_retrieval_query, is_short_followup
from app.rag.citations import build_citations
from app.rag.retriever import dual_retrieve, _normalize_score
from app.rag.embeddings import QwenEmbeddings
from app.config import settings

PASS = 0
FAIL = 0


def check(name: str, cond: bool, extra: str = ""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  PASS {name}")
    else:
        FAIL += 1
        print(f"  FAIL {name} {extra}")


def test_query_rewrite():
    print("=== build_retrieval_query ===")
    history = [
        {"role": "user", "content": "高血压平时饮食需要注意什么？"},
        {"role": "assistant", "content": "好的！高血压要注意低盐饮食……"},
    ]

    # Case B 核心：短追问 + 历史 → 拼接主题
    q = build_retrieval_query("那每天盐摄入多少比较合适？", history, None)
    check("follow-up combines history topic", "高血压" in q and "盐" in q, f"got={q!r}")

    # LLM 改写可用且更有信息量 → 直接采用
    q = build_retrieval_query("那每天盐摄入多少比较合适？", history, "高血压患者每日食盐摄入建议量")
    check("LLM rewrite preferred", q == "高血压患者每日食盐摄入建议量", f"got={q!r}")

    # LLM 改写只是原样回传 → 走启发式
    q = build_retrieval_query("那每天盐摄入多少比较合适？", history, "那每天盐摄入多少比较合适？")
    check("echoed rewrite falls back to heuristic", "高血压" in q, f"got={q!r}")

    # 独立完整问题 → 不拼接
    q = build_retrieval_query("高血压平时饮食需要注意什么？", history, "高血压饮食注意事项")
    check("LLM rewrite used for full question", q == "高血压饮食注意事项", f"got={q!r}")

    # 无历史 + 无改写 → 原样
    q = build_retrieval_query("高血压怎么控制？", [], None)
    check("no history passthrough", q == "高血压怎么控制？", f"got={q!r}")

    # 空改写 + 非追问长问题 → 原样
    q = build_retrieval_query("我最近血压有点高怎么办？", history, "")
    check("long question passthrough", q == "我最近血压有点高怎么办？", f"got={q!r}")

    print("=== is_short_followup ===")
    check("那 prefix", is_short_followup("那每天多少？"))
    check("多少 prefix", is_short_followup("每天多少合适？"))
    check("这个 prefix", is_short_followup("这个呢？"))
    check("long sentence not followup", not is_short_followup("高血压平时饮食需要注意什么？"))
    check("empty not followup", not is_short_followup(""))


def test_citations():
    print("=== build_citations ===")
    docs = [
        Document(
            page_content="成人每天食盐不超过5克",
            metadata={
                "source_id": "cnsoc_dg2022", "title": "中国居民膳食指南（2022）",
                "publisher": "中国营养学会", "url": "http://dg.cnsoc.org/",
                "chunk_id": "cnsoc::aa", "section": "少盐少油",
            },
        ),
        Document(  # 同 URL 不同 chunk → 去重
            page_content="每天烹调油25到30克",
            metadata={"publisher": "中国营养学会", "url": "http://dg.cnsoc.org/", "chunk_id": "cnsoc::bb"},
        ),
        Document(  # 无 url 有 chunk_id → 保留
            page_content="血压达到140/90需就医",
            metadata={"publisher": "WHO", "chunk_id": "who::cc"},
        ),
        Document(  # 完全无出处 → 跳过（绝不编造）
            page_content="来路不明的内容",
            metadata={"score": 0.9},
        ),
        Document(  # 有 url 的第 4 条 → 超出 limit 被截断
            page_content="WHO 盐建议",
            metadata={"publisher": "WHO", "url": "https://www.who.int/zh/news-room/fact-sheets/detail/healthy-diet", "chunk_id": "who::dd"},
        ),
    ]
    cites = build_citations(docs, limit=3)
    check("limit 3", len(cites) == 3, f"got={len(cites)}")
    check("first is cnsoc", cites[0]["publisher"] == "中国营养学会" and cites[0]["chunk_id"] == "cnsoc::aa")
    check("same-url dedup", all(c["chunk_id"] != "cnsoc::bb" for c in cites))
    check("no-url no-chunkid skipped", all(c["chunk_id"] != "" or c["url"] for c in cites))
    check("chunkid-only kept", any(c["chunk_id"] == "who::cc" for c in cites))
    check("snippet truncated field", "食盐" in cites[0]["text"])
    check("empty docs -> empty", build_citations([], limit=3) == [])
    check("metadata-less docs -> empty", build_citations([Document(page_content="x")], limit=3) == [])


def test_score_normalization():
    print("=== score normalization (COSINE 方向守护) ===")
    # COSINE: raw distance = 1 - cos_sim, 越小越相关 → sim = 1 - raw
    check("cosine near-identical", _normalize_score(0.05, "COSINE") > _normalize_score(0.6, "COSINE"))
    check("cosine identical ~=1", _normalize_score(0.0, "COSINE") == 1.0)
    check("cosine opposite ~=0", _normalize_score(2.0, "COSINE") == 0.0)
    # IP: 越大越相关
    check("ip larger better", _normalize_score(0.9, "IP") > _normalize_score(0.2, "IP"))
    # L2: 越小越相关
    check("l2 smaller better", _normalize_score(0.1, "L2") > _normalize_score(5.0, "L2"))


async def test_degrade():
    print("=== RAG 降级安全 ===")
    # 1) Milvus 不可达 → dual_retrieve 返回空, 不抛异常
    original = settings.milvus_address
    try:
        settings.milvus_address = "127.0.0.1:59999"  # 无监听端口
        result = await asyncio.wait_for(
            dual_retrieve("高血压饮食", "user_it", k_user=3, k_general=2),
            timeout=30,
        )
        check("milvus down -> empty user", result.get("user") == [])
        check("milvus down -> empty general", result.get("general") == [])
    except asyncio.TimeoutError:
        check("milvus down -> empty user", False, "dual_retrieve hung >30s")
    finally:
        settings.milvus_address = original

    # 2) Embedding 失败 → 抛 RuntimeError（保留现有正确行为，绝不零向量）
    emb = QwenEmbeddings(api_key="invalid-key-for-test")
    emb.url = "http://127.0.0.1:59999/v1/embeddings"  # 无监听端口
    try:
        emb.embed_query("测试")
        check("embedding failure raises", False, "no exception raised")
    except RuntimeError:
        check("embedding failure raises", True)
    except Exception as e:
        check("embedding failure raises", False, f"wrong exception type: {type(e).__name__}: {e}")

    # 3) RAG disabled → citations 为空（knowledge_qa 路径的构建前提）
    check("rag disabled flag present", isinstance(settings.rag_enabled, bool))


async def main() -> int:
    test_query_rewrite()
    test_citations()
    test_score_normalization()
    await test_degrade()
    print(f"\nunit: PASS={PASS} FAIL={FAIL}")
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
