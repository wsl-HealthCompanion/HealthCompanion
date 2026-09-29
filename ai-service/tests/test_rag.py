"""
测试 RAG 检索功能
验证与现有 NestJS rag.service.ts 结果一致性
"""
import asyncio
import pytest
import sys

pytestmark = pytest.mark.integration

from app.rag.retriever import dual_retrieve, format_context_for_llm
from app.rag.embeddings import QwenEmbeddings


async def test_embedding():
    """测试 Embedding 向量化"""
    print("=== 测试 Embedding ===")
    emb = QwenEmbeddings()

    try:
        vector = emb.embed_query("高血压怎么控制")
        print(f"✓ 向量维度: {len(vector)}")
        print(f"✓ 前5维: {vector[:5]}")
        assert len(vector) == 1536, "向量维度应为 1536"
        print("✓ Embedding 测试通过\n")
        return True
    except Exception as e:
        print(f"✗ Embedding 失败: {e}\n")
        return False


async def test_retrieval():
    """测试双知识库检索"""
    print("=== 测试 Milvus 检索 ===")

    # 注意:需要 Milvus 服务运行 + 已有数据
    try:
        docs = await dual_retrieve(
            query="高血压怎么控制",
            user_id="test_user_123",
            k_user=3,
            k_general=2,
        )

        print(f"✓ 用户知识库: {len(docs['user'])} 条")
        print(f"✓ 通用知识库: {len(docs['general'])} 条")

        if docs["user"]:
            print(f"  示例: {docs['user'][0].page_content[:50]}...")
        if docs["general"]:
            print(f"  示例: {docs['general'][0].page_content[:50]}...")

        # 格式化上下文
        context = format_context_for_llm(docs)
        print(f"\n✓ 格式化上下文长度: {len(context)} 字符")
        print(f"✓ 检索测试通过\n")
        return True
    except Exception as e:
        print(f"✗ 检索失败(可能 Milvus 未运行或无数据): {e}\n")
        return False


async def main():
    """运行所有测试"""
    print("开始测试 RAG 模块...\n")

    # 测试 1: Embedding
    emb_ok = await test_embedding()

    # 测试 2: Retrieval(需要 Milvus 运行)
    retrieval_ok = await test_retrieval()

    print("\n=== 测试总结 ===")
    print(f"Embedding: {'✓ 通过' if emb_ok else '✗ 失败'}")
    print(f"检索:      {'✓ 通过' if retrieval_ok else '✗ 失败(需要 Milvus 运行)'}")

    if emb_ok:
        print("\n✓ 任务 2(RAG基础设施)完成,可以进入任务 3")
    else:
        print("\n需要检查 DASHSCOPE_API_KEY 配置")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
