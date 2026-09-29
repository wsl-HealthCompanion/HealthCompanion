"""
Test Orchestrator Node (Task 2)
"""
import asyncio
import pytest
import sys
sys.path.insert(0, '.')

pytestmark = pytest.mark.integration

from app.graph.nodes.orchestrator import orchestrator_node


async def test_health_question():
    """Test: Health question should route to knowledge_qa"""
    print("=== Test 1: Health Question ===")
    state = {
        "user_message": "How to control high blood pressure?",
        "user_context": {"user_id": "test_user", "profile_summary": "No profile"},
        "conversation_history": [],
        "scene_mode": "day",
    }

    result = await orchestrator_node(state)

    print(f"Intent: {result['intent']}")
    print(f"Confidence: {result['confidence']}")
    print(f"Routing: {result['routing']}")
    print(f"Query for agents: {result['query_for_agents']}")

    assert result["intent"] == "health_question", f"Expected health_question, got {result['intent']}"
    assert "knowledge_qa" in result["routing"], f"Expected knowledge_qa in routing, got {result['routing']}"
    print("[PASS] Health question correctly identified\n")
    return True


async def test_general_chat():
    """Test: General chat should reply directly"""
    print("=== Test 2: General Chat ===")
    state = {
        "user_message": "Hello",
        "user_context": {"user_id": "test_user", "profile_summary": "No profile"},
        "conversation_history": [],
        "scene_mode": "day",
    }

    result = await orchestrator_node(state)

    print(f"Intent: {result['intent']}")
    print(f"Confidence: {result['confidence']}")
    print(f"Routing: {result['routing']}")
    print(f"Final reply: {result['final_reply'][:50]}...")

    assert result["intent"] == "general_chat", f"Expected general_chat, got {result['intent']}"
    assert len(result["routing"]) == 0, f"General chat should not route, got {result['routing']}"
    assert result["final_reply"], "General chat should have final_reply"
    print("[PASS] General chat correctly handled\n")
    return True


async def test_emergency():
    """Test: Emergency keywords should trigger alert"""
    print("=== Test 3: Emergency ===")
    state = {
        "user_message": "Help! Severe chest pain!",
        "user_context": {"user_id": "test_user", "profile_summary": "No profile"},
        "conversation_history": [],
        "scene_mode": "day",
    }

    result = await orchestrator_node(state)

    print(f"Intent: {result['intent']}")
    print(f"Should alert: {result['should_alert']}")
    print(f"Final reply: {result['final_reply'][:80]}...")

    # Emergency might be detected by LLM or fallback
    assert result["should_alert"] == True or "emergency" in result["intent"].lower(), \
        f"Emergency should trigger alert or emergency intent"
    print("[PASS] Emergency correctly handled\n")
    return True


async def main():
    """Run all orchestrator tests"""
    print("Starting Orchestrator Node Tests...\n")

    try:
        test1 = await test_health_question()
        test2 = await test_general_chat()
        test3 = await test_emergency()

        print("=== Test Summary ===")
        print(f"Health Question:  {'PASS' if test1 else 'FAIL'}")
        print(f"General Chat:     {'PASS' if test2 else 'FAIL'}")
        print(f"Emergency:        {'PASS' if test3 else 'FAIL'}")

        if test1 and test2 and test3:
            print("\n[SUCCESS] Task 2 completed: Orchestrator node works correctly")
            print("Ready for Task 3: Implement knowledge_qa node")
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
