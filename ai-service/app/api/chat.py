"""
聊天 API 路由
提供 SSE 流式接口 + 真实 LangGraph 执行
"""
from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse
import json
import time

from app.schemas.io import ChatRequest, ChatResponse
from app.graph.build import get_graph
from app.utils.speech_stream import SpeechChunkStream

router = APIRouter()


@router.post("/v1/chat/stream")
async def chat_stream(req: ChatRequest):
    """
    SSE 流式聊天接口(真实 LangGraph 调用)

    流程:
    1. 构建初始 state
    2. 执行 LangGraph (orchestrator -> knowledge_qa)
    3. 流式推送事件: thinking -> intent -> token -> quick_replies -> done
    """

    # 1. 构建初始 state
    state = {
        "user_message": req.user_message,
        "message_type": req.message_type,
        "conversation_history": [
            {"role": m.role, "content": m.content}
            for m in req.conversation_history
        ],
        "user_context": req.user_context,
        "scene_mode": req.scene_mode,
        "downgrade_level": req.downgrade_level,
        "recent_intents": req.recent_intents,
        "recent_memories": req.recent_memories,  # L2 中期记忆
    }

    async def event_generator():
        """生成 SSE 事件流"""
        now = lambda: int(time.time() * 1000)

        # 2. 思考状态
        yield {
            "event": "message",
            "data": json.dumps({
                "type": "thinking",
                "content": "正在分析...",
                "timestamp": now()
            })
        }

        emitted_intent = False
        accumulated_tokens = []
        speech_stream = SpeechChunkStream()
        speech_chunk_index = 0
        final_state = None

        # 3. 流式执行 LangGraph
        graph = get_graph()

        try:
            async for event in graph.astream_events(state, version="v2"):
                event_type = event["event"]

                # 3.1 意图识别/agent 节点完成 → 收集输出到 state
                if event_type == "on_chain_end":
                    name = event.get("name", "")
                    output = event["data"].get("output", {})

                    if "orchestrator" in name:
                        if not emitted_intent and output.get("intent"):
                            # 情绪和意图一起提前发出 — 让前端在数字人第一句speak时就用正确表情
                            yield {
                                "event": "message",
                                "data": json.dumps({
                                    "type": "intent",
                                    "primary": output.get("intent", "unknown"),
                                    "confidence": output.get("confidence", 0),
                                    "emotion": output.get("emotion_detected", "neutral"),
                                    "timestamp": now()
                                })
                            }
                            emitted_intent = True
                        for key in ("intent", "confidence", "routing", "final_reply", "emotion_detected", "should_alert"):
                            if key in output:
                                state[key] = output[key]

                    # 收集 knowledge_qa 等其他 agent 节点的输出
                    if "knowledge_qa" in name and "agent_outputs" in output:
                        state.setdefault("agent_outputs", {}).update(output["agent_outputs"])

                # 3.2 LLM token 流式输出 (knowledge_qa 节点的 LLM)
                if event_type == "on_chat_model_stream":
                    metadata = event.get("metadata", {})
                    node_name = metadata.get("langgraph_node", "")

                    if node_name == "knowledge_qa":
                        chunk = event["data"].get("chunk")
                        if chunk:
                            token = chunk.content if hasattr(chunk, "content") else str(chunk)
                            if token:
                                accumulated_tokens.append(token)
                                yield {
                                    "event": "message",
                                    "data": json.dumps({
                                        "type": "token",
                                        "content": token,
                                        "index": len(accumulated_tokens) - 1,
                                        "timestamp": now()
                                    })
                                }
                                for speech_chunk in speech_stream.push(token):
                                    yield {
                                        "event": "message",
                                        "data": json.dumps({
                                            "type": "speech_chunk",
                                            "text": speech_chunk,
                                            "index": speech_chunk_index,
                                            "timestamp": now()
                                        })
                                    }
                                    speech_chunk_index += 1

            # 4. 获取最终状态
            final_state = state
            import sys
            print(f"[SSE DEBUG] intent={final_state.get('intent')}, final_reply={final_state.get('final_reply','')[:50]}, agent_outputs={final_state.get('agent_outputs',{}).get('knowledge_qa',{}).get('final_reply','')[:50]}, accumulated_tokens={len(accumulated_tokens)}", file=sys.stderr)

            # 4.1 如果还没发 token 事件,从 state 中提取回复并逐字发送
            if not accumulated_tokens:
                reply = ""

                # general_chat → orchestrator 的 final_reply
                if final_state.get("final_reply"):
                    reply = final_state["final_reply"]

                # knowledge_qa → agent_outputs.knowledge_qa.final_reply
                qa_out = final_state.get("agent_outputs", {}).get("knowledge_qa", {})
                if not reply and (qa_out.get("tts_text") or qa_out.get("final_reply")):
                    reply = qa_out.get("tts_text") or qa_out["final_reply"]

                if reply:
                    print(f"[SSE DEBUG] Emitting {len(reply)} token events for reply", file=sys.stderr)
                else:
                    print(f"[SSE DEBUG] NO REPLY FOUND - using fallback", file=sys.stderr)

                if reply:
                    for i, char in enumerate(reply):
                        yield {
                            "event": "message",
                            "data": json.dumps({
                                "type": "token",
                                "content": char,
                                "index": i,
                                "timestamp": now()
                            })
                        }
                        for speech_chunk in speech_stream.push(char):
                            yield {
                                "event": "message",
                                "data": json.dumps({
                                    "type": "speech_chunk",
                                    "text": speech_chunk,
                                    "index": speech_chunk_index,
                                    "timestamp": now()
                                })
                            }
                            speech_chunk_index += 1

            for speech_chunk in speech_stream.flush():
                yield {
                    "event": "message",
                    "data": json.dumps({
                        "type": "speech_chunk",
                        "text": speech_chunk,
                        "index": speech_chunk_index,
                        "timestamp": now()
                    })
                }
                speech_chunk_index += 1

            # 4.2 快捷回复
            quick_replies = []
            if final_state.get("agent_outputs", {}).get("knowledge_qa"):
                qa_output = final_state["agent_outputs"]["knowledge_qa"]
                quick_replies = qa_output.get("quick_replies", [])

            if quick_replies:
                yield {
                    "event": "message",
                    "data": json.dumps({
                        "type": "quick_replies",
                        "replies": [
                            {"label": r, "icon": "book", "score": 0.8}
                            for r in quick_replies
                        ],
                        "timestamp": now()
                    })
                }

            # 5. 完成
            yield {
                "event": "message",
                "data": json.dumps({
                    "type": "done",
                    "emotion": final_state.get("emotion_detected", "neutral"),
                    "intent": final_state.get("intent"),
                    "timestamp": now()
                })
            }

        except Exception as e:
            # 错误处理
            print(f"Graph execution error: {e}")
            import traceback
            traceback.print_exc()

            yield {
                "event": "message",
                "data": json.dumps({
                    "type": "error",
                    "code": "graph_error",
                    "message": "抱歉,服务暂时不可用,请稍后再试",
                    "timestamp": now()
                })
            }

    return EventSourceResponse(event_generator())


@router.post("/v1/memory/summarize")
async def memory_summarize(req: dict):
    """
    L2 中期记忆 — 会话摘要生成接口
    NestJS 在会话消息 >=8 条时调用，返回 summary + keyTopics
    """
    from app.graph.nodes.summarizer import summarizer_node
    result = await summarizer_node({
        "conversation_history": req.get("conversation_history", []),
    })
    return result


@router.post("/v1/chat")
async def chat_non_stream(req: dict):
    """
    非流式聊天接口(用于测试/调试)
    """
    return {
        "intent": "general_chat",
        "confidence": 0.85,
        "final_reply": "你好!我是小炎,你的AI健康助手。",
        "tts_text": "你好!我是小炎。",
        "quick_replies": ["查看健康档案", "健康知识"],
        "citations": [],
        "emotion_detected": "neutral",
        "latency_ms": 150,
    }
