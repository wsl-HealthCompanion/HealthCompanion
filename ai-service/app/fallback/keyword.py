"""
关键词降级逻辑
当 LLM 调用失败时,使用关键词匹配进行意图识别
迁移自 orchestrator.agent.ts fallbackIntentRecognition
"""


def fallback_intent_recognition(user_message: str) -> dict:
    """
    关键词降级:当LLM失败时使用
    迁移自 orchestrator.agent.ts L116-154
    """
    msg = user_message.lower()

    # 紧急关键词(最高优先级)
    emergency_keywords = ["救命", "120", "急救", "胸痛剧烈", "呼吸困难", "昏迷", "大出血"]
    if any(kw in msg for kw in emergency_keywords):
        return {
            "intent": "emergency",
            "confidence": 1.0,
            "routing": [],
            "query_for_agents": "",
            "final_reply": "检测到紧急情况!请立即拨打120或前往最近的医院急诊。如果情况危急,请保持冷静并等待救援。",
            "emotion_detected": "anxious",
            "should_alert": True,
        }

    # 工具执行请求 (Task 5) — 必须在健康关键词之前判定。
    # 严格模式：必须是"动作动词 + 明确宾语"，避免把健康知识提问误判为工具调用
    import re as _re
    action_patterns = [
        r"(生成|制定|做个|做一份|做一份|安排|来一份|设计|写一份|写个).{0,8}(饮食|食谱|餐单|计划|方案)",
        r"(根据|按照|按).{0,6}(档案|病情|忌口).{0,8}(调整|修改|定制|个性化|制定)",
        r"(设置|创建|添加|定个|设个|定一个|设一个).{0,4}提醒",
        r"提醒我",
        r"(查看|读取|看看|打开|展示).{0,4}(我的)?(健康)?档案",
        r"我的档案里?(有|是)什么",
        r"我有什么病",
        r"我在吃什么药",
    ]
    # 提醒类必须带时间语义，否则交给 LLM 追问（避免"帮我定个提醒"误触发）
    has_time_hint = bool(_re.search(r"(今天|明天|后天|每天|每周|早上|上午|中午|下午|晚上|点|时|分)", msg))
    action_hit = bool(msg) and any(_re.search(p, msg) for p in action_patterns)
    if action_hit and ("提醒" in msg and not has_time_hint):
        action_hit = False
    if action_hit:
        return {
            "intent": "tool_request",
            "confidence": 0.8,
            "routing": [],
            "query_for_agents": user_message,
            "final_reply": "",
            "emotion_detected": "neutral",
            "should_alert": False,
        }

    # 健康知识关键词
    health_keywords = [
        "血压", "血糖", "糖尿病", "高血压", "冠心病", "吃药", "用药", "药物",
        "怎么办", "能不能", "可以吗", "注意什么", "降", "控制", "治疗",
        "症状", "疼痛", "不舒服", "检查", "体检"
    ]
    if any(kw in msg for kw in health_keywords):
        return {
            "intent": "health_question",
            "confidence": 0.75,
            "routing": ["knowledge_qa"],
            "query_for_agents": user_message,
            "final_reply": "",
            "emotion_detected": "neutral",
            "should_alert": False,
        }

    # 寒暄/通用对话
    greeting_keywords = ["你好", "早上好", "晚上好", "在吗", "你是谁", "什么", "谢谢", "再见"]
    if any(kw in msg for kw in greeting_keywords) or len(user_message) < 5:
        return {
            "intent": "general_chat",
            "confidence": 0.6,
            "routing": [],
            "query_for_agents": "",
            "final_reply": "你好!我是小炎,你的AI健康助手。有什么可以帮到你的吗?",
            "emotion_detected": "happy",
            "should_alert": False,
        }

    # 默认:不确定,路由到知识库问答试试
    return {
        "intent": "health_question",
        "confidence": 0.5,
        "routing": ["knowledge_qa"],
        "query_for_agents": user_message,
        "final_reply": "",
        "emotion_detected": "neutral",
        "should_alert": False,
    }


def fallback_faq(question: str) -> dict:
    """
    FAQ 降级:当知识库检索失败时使用
    迁移自 knowledge-qa.agent.ts L137-185
    """
    q = question.lower()

    # 简单FAQ规则
    faq_map = {
        "血压": "高血压患者需要规律服药、低盐饮食、适量运动。建议每天监测血压,保持在130/80mmHg以下。具体请咨询健康顾问。",
        "血糖": "糖尿病患者需要控制饮食、规律运动、按时服药。建议每天监测血糖,空腹<7.0mmol/L,餐后2小时<10.0mmol/L。具体请咨询健康顾问。",
        "用药": "请按医嘱规律服药,不要自行停药或调整剂量。如有不适,请及时联系健康顾问。",
    }

    for keyword, answer in faq_map.items():
        if keyword in q:
            return {
                "final_reply": answer,
                "tts_text": answer,
                "citations": [],
                "quick_replies": ["查看用药记录", "联系健康顾问"],
            }

    # 默认回复
    return {
        "final_reply": "抱歉,我暂时无法找到相关信息。你可以咨询健康顾问获得专业建议。",
        "tts_text": "抱歉,我暂时无法找到相关信息。",
        "citations": [],
        "quick_replies": ["联系健康顾问", "查看健康档案"],
    }
