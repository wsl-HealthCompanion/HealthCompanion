"""
LangGraph 状态图构建
编排 ① Orchestrator + ④ Knowledge QA
"""
from langgraph.graph import StateGraph, START, END
from app.graph.state import ChatState
from app.graph.nodes.orchestrator import orchestrator_node
from app.graph.nodes.knowledge_qa import knowledge_qa_node


def route_by_intent(state: ChatState) -> str:
    """
    条件边:根据 orchestrator 的意图路由到下一个节点

    Args:
        state: 当前状态(包含 intent, routing, should_alert)

    Returns:
        下一个节点名称或 END
    """
    # 紧急情况:立即结束(orchestrator 已给出处理)
    if state.get("should_alert") or state.get("intent") == "emergency":
        return END

    # 通用对话:orchestrator 已直接回复,无需路由
    if state.get("intent") == "general_chat" or not state.get("routing"):
        return END

    # 健康问题:路由到知识库问答
    if "knowledge_qa" in state.get("routing", []):
        return "knowledge_qa"

    # Phase 2 扩展路由
    # if "data_organizer" in state.get("routing", []):
    #     return "data_organizer"
    # if "vitals_monitor" in state.get("routing", []):
    #     return "vitals_monitor"

    # 默认:结束
    return END


def build_graph() -> StateGraph:
    """
    构建 LangGraph 状态图

    流程:
      START → orchestrator → [条件路由]
                               ├→ knowledge_qa → END
                               └→ END (直接回复/紧急)

    Returns:
        编译后的 LangGraph
    """
    # 创建状态图
    graph = StateGraph(ChatState)

    # 添加节点
    graph.add_node("orchestrator", orchestrator_node)
    graph.add_node("knowledge_qa", knowledge_qa_node)

    # 添加边
    graph.add_edge(START, "orchestrator")

    # 条件路由
    graph.add_conditional_edges(
        "orchestrator",
        route_by_intent,
        {
            "knowledge_qa": "knowledge_qa",
            END: END,
        }
    )

    # knowledge_qa 完成后结束
    graph.add_edge("knowledge_qa", END)

    # 编译
    return graph.compile()


# 全局单例(懒加载)
_GRAPH = None


def get_graph() -> StateGraph:
    """获取全局 Graph 实例"""
    global _GRAPH
    if _GRAPH is None:
        _GRAPH = build_graph()
    return _GRAPH
