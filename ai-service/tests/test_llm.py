"""
测试 LLM 工厂和 DeepSeek 连通性
验证 API key 有效,模型能正常调用
"""
import asyncio
import pytest

pytestmark = pytest.mark.integration
from app.llm.factory import get_llm


async def test_orchestrator_llm():
    """测试 DeepSeek-V3 (①调度智能体)"""
    print("=== 测试 DeepSeek-V3 (orchestrator) ===")
    try:
        llm = get_llm("orchestrator")
        response = await llm.ainvoke("你好,请简单自我介绍")
        content = response.content if hasattr(response, 'content') else str(response)
        print(f"Model: deepseek-chat (DeepSeek-V3)")
        print(f"Response: {content[:100]}...")
        print("✓ DeepSeek-V3 连通性正常\n")
        return True
    except Exception as e:
        print(f"✗ DeepSeek-V3 连接失败: {e}\n")
        return False


async def test_knowledge_qa_llm():
    """测试 DeepSeek-R1 (④知识库问答智能体)"""
    print("=== 测试 DeepSeek-R1 (knowledge_qa) ===")
    try:
        llm = get_llm("knowledge_qa")
        response = await llm.ainvoke("什么是高血压?请简要回答。")
        content = response.content if hasattr(response, 'content') else str(response)
        print(f"Model: deepseek-reasoner (DeepSeek-R1)")
        print(f"Response: {content[:150]}...")
        print("✓ DeepSeek-R1 连通性正常\n")
        return True
    except Exception as e:
        print(f"✗ DeepSeek-R1 连接失败: {e}\n")
        return False


async def main():
    """运行所有测试"""
    print("开始测试 LLM 工厂和 DeepSeek 连通性...\n")

    # 测试两个模型
    v3_ok = await test_orchestrator_llm()
    r1_ok = await test_knowledge_qa_llm()

    # 总结
    print("=== 测试总结 ===")
    print(f"DeepSeek-V3 (orchestrator):  {'✓ 通过' if v3_ok else '✗ 失败'}")
    print(f"DeepSeek-R1 (knowledge_qa):  {'✓ 通过' if r1_ok else '✗ 失败'}")

    if v3_ok and r1_ok:
        print("\n✓ 任务1完成: LLM工厂正常,DeepSeek连通性验证通过")
        print("可以进入任务2: 实现①调度智能体节点")
    else:
        print("\n需要检查:")
        if not v3_ok:
            print("  - DEEPSEEK_API_KEY 是否正确")
        if not r1_ok:
            print("  - DeepSeek-R1 API 权限")
        print("  - 网络连接是否正常")


if __name__ == "__main__":
    asyncio.run(main())
