"""
测试SSE流式接口
"""
import requests
import json

url = "http://127.0.0.1:8000/v1/chat/stream"
data = {
    "user_message": "你好",
    "user_context": {
        "user_id": "test123",
        "profile_summary": "未建档",
        "scene_mode": "day"
    },
    "scene_mode": "day"
}

print("发送请求到:", url)
print("请求体:", json.dumps(data, ensure_ascii=False, indent=2))

try:
    response = requests.post(
        url,
        json=data,
        headers={"Content-Type": "application/json"},
        stream=True,
        timeout=10
    )

    print(f"\n状态码: {response.status_code}")

    if response.status_code == 200:
        print("\nSSE 事件流:")
        for i, line in enumerate(response.iter_lines()):
            if i >= 15:  # 只显示前15行
                print("...")
                break
            if line:
                print(line.decode('utf-8'))
    else:
        print("错误响应:", response.text)

except Exception as e:
    print(f"请求失败: {e}")
