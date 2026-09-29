"""
Test Knowledge QA Node (Task 3)
"""
import asyncio
import pytest
import sys
sys.path.insert(0, '.')

pytestmark = pytest.mark.integration

from app.graph.nodes.knowledge_qa import knowledge_qa_node


async def test_knowledge_qa():
    """Test: Knowledge QA node should generate answer"""
    print("=== Test: Knowledge QA Node ===")
    state = {
        "user_message": "What is hypertension?",
        "query_for_agents": "What is hypertension?",
        "user_context": {"user_id": "test_user_123"},
    }

    result = await knowledge_qa_node(state)

    print(f"Agent outputs: {result.keys()}")

    qa_output = result["agent_outputs"]["knowledge_qa"]
    print(f"Final reply: {qa_output['final_reply'][:150]}...")
    print(f"TTS text: {qa_output['tts_text'][:100]}...")
    print(f"Citations: {len(qa_output['citations'])} items")
    print(f"Quick replies: {qa_output['quick_replies']}")

    assert qa_output["final_reply"], "Should have final_reply"
    assert len(qa_output["final_reply"]) > 10, "Answer should not be empty"
    print("[PASS] Knowledge QA node works\n")
    return True


async def test_chinese_question():
    """Test: Chinese health question"""
    print("=== Test: Chinese Question ===")
    state = {
        "user_message": "高血压怎么控制",
        "query_for_agents": "高血压怎么控制",
        "user_context": {"user_id": "test_user_cn"},
    }

    result = await knowledge_qa_node(state)

    qa_output = result["agent_outputs"]["knowledge_qa"]
    print(f"Final reply: {qa_output['final_reply'][:200]}...")

    assert qa_output["final_reply"], "Should have answer for Chinese question"
    print("[PASS] Chinese question handled\n")
    return True


async def main():
    """Run all knowledge QA tests"""
    print("Starting Knowledge QA Node Tests...\n")
    print("Note: Requires Milvus running with data, will use fallback FAQ if unavailable\n")

    try:
        test1 = await test_knowledge_qa()
        test2 = await test_chinese_question()

        print("=== Test Summary ===")
        print(f"English Question:  {'PASS' if test1 else 'FAIL'}")
        print(f"Chinese Question:  {'PASS' if test2 else 'FAIL'}")

        if test1 and test2:
            print("\n[SUCCESS] Task 3 completed: Knowledge QA node works correctly")
            print("Ready for Task 4: Assemble LangGraph")
            return 0
        else:
            print("\n[ERROR] Some tests failed")
            return 1

    except Exception as e:
        print(f"\n[ERROR] Test execution failed: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
