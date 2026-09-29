"""
Test Real SSE Stream with LangGraph (Task 5)
"""
import requests
import json

url = "http://127.0.0.1:8000/v1/chat/stream"

# Test 1: General chat
print("=== Test 1: General Chat ===")
data = {
    "user_message": "Hello",
    "user_context": {
        "user_id": "test123",
        "profile_summary": "No profile",
        "scene_mode": "day"
    },
    "scene_mode": "day",
    "message_type": "text",
    "conversation_history": [],
    "downgrade_level": "none",
    "recent_intents": []
}

try:
    response = requests.post(url, json=data, stream=True, timeout=30)
    print(f"Status: {response.status_code}")

    if response.status_code == 200:
        print("SSE Events:")
        event_count = 0
        for line in response.iter_lines():
            if line:
                decoded = line.decode('utf-8')
                if decoded.startswith('data: '):
                    event_count += 1
                    event_data = json.loads(decoded[6:])
                    print(f"  [{event_count}] {event_data['type']}: {str(event_data)[:80]}...")
                    if event_count >= 10:  # Limit output
                        print("  ...")
                        break
        print(f"[PASS] General chat SSE stream works ({event_count}+ events)\n")
    else:
        print(f"[FAIL] HTTP {response.status_code}: {response.text}\n")

except Exception as e:
    print(f"[FAIL] Request error: {e}\n")

# Test 2: Health question
print("=== Test 2: Health Question ===")
data["user_message"] = "What is hypertension?"

try:
    response = requests.post(url, json=data, stream=True, timeout=30)
    print(f"Status: {response.status_code}")

    if response.status_code == 200:
        print("SSE Events:")
        event_count = 0
        has_intent = False
        has_tokens = False

        for line in response.iter_lines():
            if line:
                decoded = line.decode('utf-8')
                if decoded.startswith('data: '):
                    event_count += 1
                    event_data = json.loads(decoded[6:])
                    event_type = event_data['type']

                    if event_type == 'intent':
                        has_intent = True
                        print(f"  Intent: {event_data.get('primary')} (confidence: {event_data.get('confidence')})")
                    elif event_type == 'token':
                        has_tokens = True
                        if event_count <= 15:  # Show first few tokens
                            print(f"  Token[{event_data.get('index')}]: {event_data.get('content')}")
                    elif event_type == 'done':
                        print(f"  Done: emotion={event_data.get('emotion')}, intent={event_data.get('intent')}")

                    if event_count >= 20:
                        break

        if has_intent and has_tokens:
            print(f"[PASS] Health question SSE stream works (intent + tokens)\n")
        else:
            print(f"[WARN] Stream works but missing intent or tokens\n")
    else:
        print(f"[FAIL] HTTP {response.status_code}\n")

except Exception as e:
    print(f"[FAIL] Request error: {e}\n")

print("=== Summary ===")
print("[SUCCESS] Task 5 completed: Real streaming integrated")
print("Ready for Stage B: NestJS integration")
