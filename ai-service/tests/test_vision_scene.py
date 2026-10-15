"""
M0 拍照问一问 — 场景识别链路测试(全部 mock, 不调真实 API)

覆盖:
- 契约层: Attachment 校验(mime 白名单/data URI/base64/大小) + ChatRequest 张数上限
- 路由层: 无图 → orchestrator; 带图 → scene_understand(预路由)
- 节点层: 正常 JSON 解析 / 坏 JSON 降级 / LLM 异常降级
- API 层: 超量/超大图 422; SSE 冒烟(带图 → intent=scene_query + token + done)
"""
import base64
import asyncio
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage
from pydantic import ValidationError
from sse_starlette.sse import AppStatus

from app.schemas.io import Attachment, ChatRequest, MAX_ATTACHMENTS
from app.graph.build import build_graph, route_by_attachments
from app.graph.nodes import scene_understand as su
from app.graph.nodes import orchestrator as orch
from app.api.chat import router


def jpeg_uri(kb: int = 10) -> str:
    raw = b"\xff\xd8\xff" + b"x" * (kb * 1024)
    return "data:image/jpeg;base64," + base64.b64encode(raw).decode()


def attachment(kb: int = 10, mime: str = "image/jpeg") -> dict:
    return {"kind": "image", "mime": mime, "data": jpeg_uri(kb)}


class FakeLLM:
    """按脚本行为的假 LLM: reply 文本 / exc 异常"""

    def __init__(self, reply: str | None = None, exc: Exception | None = None):
        self.reply = reply
        self.exc = exc
        self.calls: list = []

    async def ainvoke(self, messages, *args, **kwargs):
        self.calls.append(messages)
        if self.exc:
            raise self.exc
        return AIMessage(content=self.reply or "")


SCENE_JSON = json.dumps({
    "intent": "scene_query",
    "exercise": "shoulder_raise",
    "description": "您正在做抬肩练习。",
    "assessment": "动作标准，继续保持。",
    "quick_replies": ["再来一组", "休息一下"],
    "emotion_detected": "happy",
}, ensure_ascii=False)

ORCH_JSON = json.dumps({
    "intent": "general_chat",
    "confidence": 0.9,
    "routing": [],
    "query_for_agents": "",
    "final_reply": "你好！我是小炎。",
    "emotion_detected": "happy",
    "should_alert": False,
}, ensure_ascii=False)


def base_state(**extra) -> dict:
    return {
        "user_message": "看看我在做什么",
        "message_type": "text",
        "conversation_history": [],
        "user_context": {"user_id": "u1"},
        "scene_mode": "day",
        **extra,
    }


# ===== 契约层 =====

class TestAttachmentContract:
    def test_valid_jpeg(self):
        a = Attachment(**attachment())
        assert a.kind == "image"

    @pytest.mark.parametrize("mime", ["image/png", "image/webp"])
    def test_allowed_mimes(self, mime):
        a = Attachment(**attachment(mime=mime))
        assert a.mime == mime

    @pytest.mark.parametrize("mime", ["image/gif", "image/svg+xml", "application/pdf"])
    def test_rejects_non_whitelisted_mime(self, mime):
        with pytest.raises(ValidationError):
            Attachment(**attachment(mime=mime))

    def test_rejects_non_data_uri(self):
        with pytest.raises(ValidationError):
            Attachment(kind="image", mime="image/jpeg", data="https://example.com/a.jpg")

    def test_rejects_empty_content(self):
        with pytest.raises(ValidationError):
            Attachment(kind="image", mime="image/jpeg", data="data:image/jpeg;base64,")

    def test_rejects_bad_base64(self):
        with pytest.raises(ValidationError):
            Attachment(kind="image", mime="image/jpeg", data="data:image/jpeg;base64,!!!!")

    def test_rejects_oversize(self):
        with pytest.raises(ValidationError):
            Attachment(**attachment(kb=3 * 1024))  # 3MB > 2MB

    def test_chat_request_max_count(self):
        with pytest.raises(ValidationError):
            ChatRequest(
                user_message="看看",
                attachments=[attachment() for _ in range(MAX_ATTACHMENTS + 1)],
            )

    def test_chat_request_without_attachments_backwards_compatible(self):
        req = ChatRequest(user_message="你好")
        assert req.attachments == []


# ===== 路由层 =====

class TestPreRoute:
    def test_without_attachments_goes_orchestrator(self):
        assert route_by_attachments(base_state()) == "orchestrator"

    def test_with_attachments_goes_scene(self):
        assert route_by_attachments(base_state(attachments=[attachment()])) == "scene_understand"


# ===== 节点层 =====

class TestSceneUnderstandNode:
    @pytest.mark.asyncio
    async def test_parses_valid_json(self, monkeypatch):
        fake = FakeLLM(reply=SCENE_JSON)
        monkeypatch.setattr(su, "get_llm", lambda name: fake)
        result = await su.scene_understand_node(base_state(attachments=[attachment()]))
        assert result["intent"] == "scene_query"
        out = result["agent_outputs"]["scene_understand"]
        assert out["exercise"] == "shoulder_raise"
        assert "抬肩" in out["final_reply"]
        # 多模态消息: 文本段 + image_url 段
        sent = fake.calls[0][0]
        kinds = [c["type"] for c in sent.content]
        assert "image_url" in kinds

    @pytest.mark.asyncio
    async def test_bad_json_degrades_without_raise(self, monkeypatch):
        fake = FakeLLM(reply="这张照片拍得不错，但我看不太清内容。")
        monkeypatch.setattr(su, "get_llm", lambda name: fake)
        result = await su.scene_understand_node(base_state(attachments=[attachment()]))
        out = result["agent_outputs"]["scene_understand"]
        assert out["exercise"] == "unknown"
        assert "看不太清" in out["final_reply"]

    @pytest.mark.asyncio
    async def test_llm_error_degrades_without_raise(self, monkeypatch):
        fake = FakeLLM(exc=RuntimeError("timeout"))
        monkeypatch.setattr(su, "get_llm", lambda name: fake)
        result = await su.scene_understand_node(base_state(attachments=[attachment()]))
        out = result["agent_outputs"]["scene_understand"]
        assert out["exercise"] == "unknown"
        assert out["final_reply"]


# ===== 图路由(端到端, 两个节点都 mock) =====

class TestGraphRouting:
    def test_with_image_skips_orchestrator(self, monkeypatch):
        scene_llm = FakeLLM(reply=SCENE_JSON)
        orch_llm = FakeLLM(reply=ORCH_JSON)
        monkeypatch.setattr(su, "get_llm", lambda name: scene_llm)
        monkeypatch.setattr(orch, "get_llm", lambda name: orch_llm)

        # 节点是 async — 走 ainvoke(与生产 astream_events 同为异步 API)
        state = asyncio.run(build_graph().ainvoke(base_state(attachments=[attachment()])))
        assert state.get("intent") == "scene_query"
        assert "scene_understand" in state.get("agent_outputs", {})
        assert orch_llm.calls == []  # orchestrator 没被调用

    def test_without_image_keeps_original_flow(self, monkeypatch):
        scene_llm = FakeLLM(reply=SCENE_JSON)
        orch_llm = FakeLLM(reply=ORCH_JSON)
        monkeypatch.setattr(su, "get_llm", lambda name: scene_llm)
        monkeypatch.setattr(orch, "get_llm", lambda name: orch_llm)

        state = asyncio.run(build_graph().ainvoke(base_state()))
        assert state.get("intent") == "general_chat"
        assert "scene_understand" not in state.get("agent_outputs", {})
        assert scene_llm.calls == []  # scene 节点没被调用


# ===== API 层 =====

@pytest.fixture()
def client():
    # sse_starlette 的 AppStatus.should_exit_event 绑定首个事件循环,
    # 同进程第二个 SSE 请求会跨循环报错 — 每个用例前重置
    AppStatus.should_exit_event = None
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


class TestApiLayer:
    def test_oversize_image_422(self, client):
        resp = client.post("/v1/chat/stream", json={
            "user_message": "看看", "attachments": [attachment(kb=3 * 1024)],
        })
        assert resp.status_code == 422

    def test_too_many_images_422(self, client):
        resp = client.post("/v1/chat/stream", json={
            "user_message": "看看",
            "attachments": [attachment() for _ in range(MAX_ATTACHMENTS + 1)],
        })
        assert resp.status_code == 422

    def test_bad_mime_422(self, client):
        resp = client.post("/v1/chat/stream", json={
            "user_message": "看看", "attachments": [attachment(mime="image/gif")],
        })
        assert resp.status_code == 422

    def test_without_attachments_still_works(self, client, monkeypatch):
        orch_llm = FakeLLM(reply=ORCH_JSON)
        monkeypatch.setattr(orch, "get_llm", lambda name: orch_llm)
        resp = client.post("/v1/chat/stream", json={"user_message": "你好"})
        assert resp.status_code == 200
        types = [json.loads(line[6:])["type"]
                 for line in resp.text.splitlines() if line.startswith("data: ")]
        assert "done" in types
        assert "intent" in types  # orchestrator 的意图事件照常

    def test_sse_smoke_with_image(self, client, monkeypatch):
        # LLM 挂掉 → 节点降级 → final_reply 走逐字补发通道, SSE 依然完整
        fake = FakeLLM(exc=RuntimeError("no api key"))
        monkeypatch.setattr(su, "get_llm", lambda name: fake)
        resp = client.post("/v1/chat/stream", json={
            "user_message": "看看我在做什么", "attachments": [attachment()],
        })
        assert resp.status_code == 200
        events = [json.loads(line[6:])
                  for line in resp.text.splitlines() if line.startswith("data: ")]
        types = [e["type"] for e in events]
        assert types[0] == "thinking"
        assert "intent" in types
        intent_ev = next(e for e in events if e["type"] == "intent")
        assert intent_ev["primary"] == "scene_query"
        assert "token" in types           # 降级文本逐字补发
        assert "speech_chunk" in types    # 字幕/语音分段照常产出
        done = next(e for e in events if e["type"] == "done")
        assert done["intent"] == "scene_query"

    def test_non_stream_with_image(self, client, monkeypatch):
        fake = FakeLLM(reply=SCENE_JSON)
        monkeypatch.setattr(su, "get_llm", lambda name: fake)
        resp = client.post("/v1/chat", json={
            "user_message": "看看", "attachments": [attachment()],
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["intent"] == "scene_query"
        assert body["exercise"] == "shoulder_raise"
        assert body["final_reply"]
