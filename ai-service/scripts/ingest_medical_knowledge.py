#!/usr/bin/env python3
"""
Task 4 — 权威健康知识 ingestion 脚本

流程: 读取 manifest → 校验 URL 可达 → 清洗/分块 → metadata → DashScope embedding → Milvus upsert

用法 (在 ai-service 目录, 使用运行环境解释器):
    /home/opt/.conda/envs/yhzk-ai/bin/python scripts/ingest_medical_knowledge.py \
        --manifest knowledge/sources.json

设计要点:
- 不手工插数据; 幂等: 同一 source_id 重复执行先删后插 (chunk_id 稳定)
- 只收录权威公开资料; --check-urls (默认开) 实际请求 URL, 不可达直接跳过该来源
- 中文分块: 先按 section, 单段超长按句子切, 目标 500~800 字, overlap 100 字,
  不机械切断句子, 保留 section 标题进正文
- collection schema 固定: medical_knowledge / user_knowledge, 向量 1536 维 COSINE
- metadata 必带: source_id/title/publisher/url/published_at/retrieved_at/section/
  chunk_id/doc_type (+ user_knowledge 的 user_id)
"""
import argparse
import hashlib
import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pymilvus import (  # noqa: E402
    Collection,
    CollectionSchema,
    DataType,
    FieldSchema,
    connections,
    utility,
)

from app.config import settings  # noqa: E402
from app.rag.embeddings import QwenEmbeddings  # noqa: E402

COLLECTION_MEDICAL = "medical_knowledge"
COLLECTION_USER = "user_knowledge"
VECTOR_DIM = 1536
TEXT_MAX_LEN = 16384          # Milvus VARCHAR max_length (bytes 语义按字符保守取值)
CHUNK_TARGET = 700            # 目标块大小（字）
CHUNK_MAX = 800               # 超过则切分
CHUNK_OVERLAP = 100           # 重叠（字）
EMBED_BATCH = 6               # DashScope text-embedding-v3 单次批量上限 10，留余量
SENTENCE_SPLIT = re.compile(r"(?<=[。！？；])")

METADATA_FIELDS = [
    ("source_id", "VARCHAR", 128),
    ("title", "VARCHAR", 256),
    ("publisher", "VARCHAR", 128),
    ("url", "VARCHAR", 512),
    ("published_at", "VARCHAR", 32),
    ("retrieved_at", "VARCHAR", 32),
    ("section", "VARCHAR", 128),
    ("doc_type", "VARCHAR", 64),
]


def check_url(url: str, timeout: float = 12.0) -> bool:
    """来源可达性核验：HEAD 优先，失败降级 GET。非 2xx/3xx 判为不可达。"""
    try:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "Mozilla/5.0 (HealthCompanion-ingest)"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                if 200 <= resp.status < 400:
                    return True
        except Exception:
            pass
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (HealthCompanion-ingest)"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return 200 <= resp.status < 400
    except Exception as e:
        print(f"  [url-check] unreachable: {url} ({e})")
        return False


def clean_text(text: str) -> str:
    """清洗：去多余空白、规范标点间距，保留原文语义。"""
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def split_long(text: str, target: int = CHUNK_TARGET, max_len: int = CHUNK_MAX, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """按句子切长段，尽量贴近 target，不超过 max_len，块间带 overlap。"""
    if len(text) <= max_len:
        return [text]
    sentences = [s for s in SENTENCE_SPLIT.split(text) if s.strip()]
    chunks: list[str] = []
    current = ""
    for s in sentences:
        if len(current) + len(s) > max_len and current:
            chunks.append(current)
            current = current[-overlap:] if overlap < len(current) else current
        current += s
        if len(current) >= target:
            chunks.append(current)
            current = current[-overlap:] if overlap < len(current) else current
    if current.strip():
        if chunks and len(current) < CHUNK_OVERLAP:
            chunks[-1] += current
        else:
            chunks.append(current)
    return chunks


def build_chunks(source: dict, retrieved_at: str) -> list[dict]:
    """section → chunk；每个 chunk 正文前置 section 标题，metadata 带完整来源。"""
    chunks: list[dict] = []
    for sec in source.get("sections", []):
        section = str(sec.get("section", "")).strip()
        body = clean_text(str(sec.get("text", "")))
        if not body:
            continue
        full = f"【{section}】{body}" if section else body
        pieces = split_long(full)
        for i, piece in enumerate(pieces):
            digest = hashlib.md5(piece.encode()).hexdigest()[:10]
            chunks.append({
                "chunk_id": f"{source['source_id']}::{digest}",
                "text": piece,
                "metadata": {
                    "source_id": str(source.get("source_id", ""))[:128],
                    "title": str(source.get("title", ""))[:256],
                    "publisher": str(source.get("publisher", ""))[:128],
                    "url": str(source.get("url", ""))[:512],
                    "published_at": str(source.get("published_at", ""))[:32],
                    "retrieved_at": retrieved_at[:32],
                    "section": section[:128],
                    "doc_type": str(source.get("doc_type", "authoritative_guidance"))[:64],
                    "user_id": "",
                    "chunk_part": i,
                },
            })
    return chunks


def ensure_collection(name: str, with_user_field: bool) -> Collection:
    """显式建 collection（幂等）：固定 schema + HNSW COSINE 索引，1536 维。"""
    if utility.has_collection(name):
        col = Collection(name)
        col.load()  # 已存在的 collection 也必须 load，delete/search 才可用
        return col

    fields = [
        FieldSchema("id", DataType.VARCHAR, max_length=128, is_primary=True),
        FieldSchema("text", DataType.VARCHAR, max_length=TEXT_MAX_LEN),
        FieldSchema("vector", DataType.FLOAT_VECTOR, dim=VECTOR_DIM),
    ]
    for fname, _, flen in METADATA_FIELDS:
        fields.append(FieldSchema(fname, DataType.VARCHAR, max_length=flen))
    if with_user_field:
        fields.append(FieldSchema("user_id", DataType.VARCHAR, max_length=64))

    schema = CollectionSchema(fields, description=f"HealthCompanion {name} (Task4 trusted RAG)")
    col = Collection(name, schema)
    index_params = {
        "metric_type": "COSINE",
        "index_type": "HNSW",
        "params": {"M": 16, "efConstruction": 200},
    }
    col.create_index("vector", index_params)
    col.load()
    print(f"[schema] created collection {name} (dim={VECTOR_DIM}, metric=COSINE, HNSW, loaded)")
    return col


def upsert_source(col: Collection, source_id: str, chunks: list[dict], embeddings: QwenEmbeddings) -> int:
    """同一 source_id 先删后插（幂等），批量 embedding 后写入。"""
    try:
        col.delete(f'source_id == "{source_id}"')
    except Exception as e:
        print(f"  [upsert] delete old rows skipped ({e})")

    texts = [c["text"] for c in chunks]
    vectors: list[list[float]] = []
    for i in range(0, len(texts), EMBED_BATCH):
        batch = texts[i:i + EMBED_BATCH]
        vecs = embeddings.embed_documents(batch)
        if len(vecs) != len(batch):
            raise RuntimeError(f"embedding count mismatch: {len(vecs)} != {len(batch)}")
        vectors.extend(vecs)
        time.sleep(0.3)  # 温和限速

    rows = []
    for c, vec in zip(chunks, vectors):
        md = c["metadata"]
        rows.append({
            "id": c["chunk_id"],
            "text": c["text"][:TEXT_MAX_LEN],
            "vector": list(vec),
            "source_id": md["source_id"],
            "title": md["title"],
            "publisher": md["publisher"],
            "url": md["url"],
            "published_at": md["published_at"],
            "retrieved_at": md["retrieved_at"],
            "section": md["section"],
            "doc_type": md["doc_type"],
            "user_id": md["user_id"],
        })
    col.insert(rows)
    col.flush()
    return len(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest authoritative medical knowledge into Milvus")
    parser.add_argument("--manifest", default="knowledge/sources.json")
    parser.add_argument("--no-check-urls", action="store_true", help="跳过 URL 可达性核验（不推荐）")
    parser.add_argument("--dry-run", action="store_true", help="只分块不写入/不调用 embedding")
    args = parser.parse_args()

    manifest_path = Path(args.manifest)
    if not manifest_path.exists():
        print(f"manifest not found: {manifest_path}")
        return 2
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    kb_version = str(manifest.get("kb_version", "v1"))
    retrieved_at = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    print(f"[ingest] kb_version={kb_version} retrieved_at={retrieved_at}")

    sources = manifest.get("sources", [])
    if not sources:
        print("[ingest] no sources in manifest")
        return 2

    # 1) URL 核验（不可达直接跳过 —— 无法核验的内容绝不入库）
    accepted = []
    for src in sources:
        url = str(src.get("url", "")).strip()
        publisher = src.get("publisher", "?")
        if not url:
            print(f"[skip] {src.get('source_id')}: no url")
            continue
        if not args.no_check_urls and not check_url(url):
            print(f"[skip] {src.get('source_id')}: url unreachable ({url})")
            continue
        accepted.append(src)
        print(f"[ok] {src.get('source_id')} ← {publisher} {url}")
    if not accepted:
        print("[ingest] no verifiable sources, abort")
        return 2

    # 2) 分块 + metadata
    all_chunks = []
    for src in accepted:
        chunks = build_chunks(src, retrieved_at)
        print(f"[chunks] {src['source_id']}: {len(chunks)} chunks")
        all_chunks.extend(chunks)
    if not all_chunks:
        print("[ingest] no chunks produced")
        return 2
    lens = [len(c["text"]) for c in all_chunks]
    print(f"[chunks] total={len(all_chunks)} len min/avg/max = {min(lens)}/{sum(lens)//len(lens)}/{max(lens)}")

    if args.dry_run:
        print("[dry-run] stop before embedding/milvus write")
        return 0

    # 3) 连接 Milvus
    connections.connect(uri=f"http://{settings.milvus_address}")
    medical = ensure_collection(COLLECTION_MEDICAL, with_user_field=True)
    ensure_collection(COLLECTION_USER, with_user_field=True)

    # 4) embedding + upsert（按 source 分组写入）
    embeddings = QwenEmbeddings()
    total = 0
    by_source: dict[str, list[dict]] = {}
    for c in all_chunks:
        by_source.setdefault(c["metadata"]["source_id"], []).append(c)

    for source_id, chunks in by_source.items():
        n = upsert_source(medical, source_id, chunks, embeddings)
        total += n
        print(f"[upsert] {source_id}: {n} rows")

    medical.load()
    print(f"[ingest] done. total rows inserted={total}, medical_knowledge num_entities={medical.num_entities}")

    # 简单检索自检（验证 COSINE 方向与 metadata 完整性）
    try:
        test_vec = embeddings.embed_query("高血压每天食盐摄入多少")
        res = medical.search(
            data=[test_vec], anns_field="vector",
            param={"metric_type": "COSINE", "params": {"ef": 64}},
            limit=2, output_fields=["id", "title", "publisher", "section"],
        )
        for hits in res:
            for h in hits:
                print(f"[selftest] score={h.distance:.4f} chunk={h.id} pub={h.entity.get('publisher')}")
    except Exception as e:
        print(f"[selftest] search failed: {e}")

    connections.disconnect("default")
    return 0


if __name__ == "__main__":
    sys.exit(main())
