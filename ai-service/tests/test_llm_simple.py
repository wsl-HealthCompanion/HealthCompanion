"""
Test LLM Factory and DeepSeek Connectivity (ASCII version for Windows)
"""
import asyncio
import sys
sys.path.insert(0, '.')

from app.llm.factory import get_llm


async def test_deepseek_v3():
    """Test DeepSeek-V3 (orchestrator)"""
    print("=== Testing DeepSeek-V3 (orchestrator) ===")
    try:
        llm = get_llm("orchestrator")
        response = await llm.ainvoke("Hello, please introduce yourself briefly.")
        content = response.content if hasattr(response, 'content') else str(response)
        print(f"Model: deepseek-chat (DeepSeek-V3)")
        print(f"Response: {content[:150]}...")
        print("[OK] DeepSeek-V3 connectivity passed\n")
        return True
    except Exception as e:
        print(f"[FAIL] DeepSeek-V3 failed: {e}\n")
        return False


async def test_deepseek_r1():
    """Test DeepSeek-R1 (knowledge_qa)"""
    print("=== Testing DeepSeek-R1 (knowledge_qa) ===")
    try:
        llm = get_llm("knowledge_qa")
        response = await llm.ainvoke("What is hypertension? Answer briefly.")
        content = response.content if hasattr(response, 'content') else str(response)
        print(f"Model: deepseek-reasoner (DeepSeek-R1)")
        print(f"Response: {content[:200]}...")
        print("[OK] DeepSeek-R1 connectivity passed\n")
        return True
    except Exception as e:
        print(f"[FAIL] DeepSeek-R1 failed: {e}\n")
        return False


async def main():
    """Run all tests"""
    print("Starting LLM Factory Tests...\n")

    v3_ok = await test_deepseek_v3()
    r1_ok = await test_deepseek_r1()

    print("=== Test Summary ===")
    print(f"DeepSeek-V3 (orchestrator):  {'PASS' if v3_ok else 'FAIL'}")
    print(f"DeepSeek-R1 (knowledge_qa):  {'PASS' if r1_ok else 'FAIL'}")

    if v3_ok and r1_ok:
        print("\n[SUCCESS] Task 1 completed: LLM factory works, DeepSeek connectivity verified")
        print("Ready for Task 2: Implement orchestrator node")
        return 0
    else:
        print("\n[ERROR] Some tests failed. Check API keys and network.")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
