# HealthCompanion × XmovAvatar：2026-09-29 产品方向、决策历程与技术方案

> 本文记录 2026-09-29 围绕 **2026 上海开源软件应用创新大赛 · 魔珐科技赛题《让 AI「活」起来：基于魔珐星云具身交互智能的创新应用》** 对 HealthCompanion 的完整讨论、判断、取舍与下一阶段技术方案。  
> 目标不是复述赛题，而是把今天形成的产品路线固化成可执行的开发依据，避免后续继续在“健康问答 + 数字人”这一弱创新方向上发散。
>
> 当前仓库：`wulisususu/HealthCompanion`  
> 当前主分支：`main`  
> 记录日期：2026-09-29

---

## 1. 今天讨论的起点

HealthCompanion 当前已经具备较完整的工程底座：

- React + Vite H5 前端；
- NestJS 后端；
- FastAPI + LangGraph AI Service；
- DeepSeek 大模型；
- 健康问答 / 通用聊天 / 紧急风险识别；
- RAG 基础设施与个人知识库 / 医疗知识库设计；
- PostgreSQL / Redis；
- SSE 真流式；
- 原 LiveTalking + GPT-SoVITS + SRS 数字人链路；
- 新接入 XmovAvatar；
- `Task 1`：XmovAvatar 最小状态机验证；
- `Task 2`：SSE → XmovAvatar 流式播报、打断与轮次隔离；
- `Task 3`：`intent + emotion` → Expression Planner → SSML / 动作语义 / 停顿 / 表达状态。

现有 Xmov 数据流已经形成：

```text
LangGraph
  ↓
thinking / intent / emotion / speech_chunk / done
  ↓
XmovAvatarBridge
  ↓
Expression Planner
  ↓
XmovAvatar speak / think / listen / interrupt / interactiveidle
```

但今天最核心的问题是：

> **如果把数字人删掉，HealthCompanion 是否依然基本成立？**

答案是：目前仍然成立。

当前主体仍偏向：

```text
用户问题
  ↓
意图识别
  ↓
RAG / LLM
  ↓
健康回答
  ↓
数字人播报
```

这意味着数字人更多是“表达外壳”，而不是业务机制的一部分。

这与赛题最强调的“为什么该场景必须使用具身交互，而不是纯文本或纯语音”存在明显差距。

---

## 2. 参考其他项目后的核心发现

今天先看了几类知乎黑客松项目，包括：

- 《心动小屋》
- 《谢邀喵》
- 《知乎脑洞游乐园》
- 《问山》
- 《知树》
- 《知乎·回响》
- ZhiForge

这些项目本身大多没有数字人，因此它们对“数字人动作与具身交互”的直接参考价值有限。

但是它们提供了一个非常重要的产品设计启发：

> **一次用户交互应该改变系统状态，而系统状态又要反过来影响下一次 AI 行为。**

例如：

```text
心动小屋：
用户选择
→ 人物关系变化
→ 剧情记忆变化
→ 下一轮角色行为变化

谢邀喵：
用户知乎数据
→ Persona
→ 行为方式
→ 社交关系
→ 长期经历

知乎脑洞游乐园：
用户决策
→ 世界状态变化
→ Agent 立场变化
→ 下一轮局势变化
```

因此 HealthCompanion 不能继续停留在：

```text
问题 → 回答
问题 → 回答
问题 → 回答
```

而应该进入：

```text
感知用户
→ 判断状态
→ 给出行动
→ 用户执行
→ 再次感知
→ 纠正 / 鼓励 / 继续
→ 写入长期状态
```

这成为今天产品路线转向的基础。

---

## 3. 第一轮产品转向：从“AI 健康助手”到“具身健康沟通陪伴”

早期讨论里提出过一个较强的方向：

> **不要只回答健康问题，而是确认用户是否真正理解，并帮助用户执行。**

对应机制：

```text
用户提出健康困扰
  ↓
AI 解释
  ↓
Teach-back：让用户用自己的话复述
  ↓
理解度评估
  ├─ 理解错误 → 换一种方式重新解释
  └─ 理解正确
          ↓
      Micro Action
          ↓
      长期记忆
          ↓
      下次继续跟进
```

该方向比纯健康问答更有连续性，也更像“陪伴”。

建议长期保留以下状态：

```json
{
  "goal": "控制血压",
  "current_concern": "担心长期用药",
  "knowledge_gaps": [
    "不清楚血压波动与症状之间的关系"
  ],
  "barriers": [
    "晚上容易忘记记录"
  ],
  "preferred_explanation": "短句、少术语",
  "teachback": {
    "last_result": "partial"
  },
  "follow_up": "询问最近记录执行情况"
}
```

但这仍没有完全解决“为什么必须数字人”的问题。

---

## 4. 与魔珐官方医疗场景的冲突判断

今天进一步发现，魔珐自身已有：

- 医院 AI 导诊助理；
- AI 健康助手；
- 医疗 / 健康类具身交互示例。

这使得如果 HealthCompanion 最终仍然定义为：

> “AI 健康数字人助手 / AI 导诊 / AI 医生 / 健康问答数字人”

会存在很明显的同质化风险。

### 4.1 不属于规则冲突

目前没有证据表明魔珐赛题禁止参赛者做健康医疗相关场景。

问题不在“能不能做”，而在：

> **评委是否会认为只是官方医疗 Demo 的扩展版。**

### 4.2 应避免的定位

后续产品介绍中应尽量避免把核心卖点写成：

- AI 问诊；
- AI 医生；
- 智能导诊；
- 普通用药问答；
- “给数字人套上健康知识库”。

### 4.3 最终差异化方向

今天最终形成的新核心不是“看病”，而是：

> **视觉共练型具身健康陪伴 Agent**

以及较宽泛的产品定义：

> **一个能看见你、陪你一起做、实时纠正你，并持续记住你的生活与健康陪伴 Agent。**

---

# 5. 今天最终形成的核心创新：视觉共练型具身 Agent

## 5.1 核心思想

真正的创新不是：

> 给 AI 加一个摄像头。

而是形成闭环：

```text
数字人看见用户
  ↓
理解用户正在做什么
  ↓
数字人自己示范 / 引导
  ↓
用户跟做
  ↓
摄像头再次观察用户
  ↓
实时判断动作是否正确
  ↓
数字人用语言 / 动作 / Widget 纠正
  ↓
用户继续调整
  ↓
再次观察
```

这使数字人真正进入交互机制，而不只是播报答案。

---

## 6. 主 Demo：AI 视觉共练 / 动作纠正

这是目前建议作为比赛主线的场景。

### 6.1 示例用户输入

用户：

> “最近一直坐电脑前，肩膀特别僵，而且平时很少运动。”

数字人：

> “那我们别只聊建议了，现在一起活动两分钟吧。如果你愿意，可以打开摄像头，我陪你做几个简单动作。”

用户授权摄像头。

系统检测是否完整看到上半身：

```text
BODY_VISIBLE = false
```

数字人：

> “再往后一点，让我能看到你的上半身。”

用户调整位置后：

```text
BODY_VISIBLE = true
```

数字人进入示范阶段：

> “先把双臂慢慢抬到肩膀高度。”

此时：

- 数字人执行对应 KA / 示范动作；
- 摄像头分析用户骨骼关键点；
- Widget 显示实时姿势信息。

例如：

```text
左臂：76°
右臂：92°
目标：85° ~ 100°
```

数字人：

> “右边很好，左手再抬高一点点。”

用户调整。

```text
左臂：91°
右臂：94°
```

数字人：

> “对，就是这里。保持三秒。”

Widget：

```text
肩部打开

左臂  91°  ✓
右臂  94°  ✓

保持  3  2  1
```

如果用户过程中讲话：

> “这里有点拉扯感。”

系统应该：

```text
ASR / 用户输入
→ interrupt
→ 当前动作阶段暂停
→ Agent 重新判断
→ 数字人回应
```

数字人：

> “那先不要硬撑，我们把幅度降一点。”

这一个 Demo 可以同时覆盖：

- 视觉感知；
- 用户摄像头；
- 双向交互；
- 多轮对话；
- 聆听；
- 打断；
- 动作识别；
- Agent 工具调用；
- 数字人动作；
- Widget；
- 具身表达；
- 状态机；
- 个性化反馈。

---

# 7. 第二场景：生活环境视觉陪伴

该能力适合作为第二 Demo 或扩展能力，不建议优先于视觉共练。

示例：

用户：

> “我最近老打喷嚏，鼻子不舒服。”

数字人不能直接依赖摄像头诊断“鼻炎”“过敏”“某种疾病”，但可以询问：

> “有些人的鼻部不适会受到生活环境影响。如果你愿意，可以让我看看你平时待得比较久的地方，我帮你看看有没有值得注意的环境因素。”

用户授权后置摄像头，在房间中环顾。

VLM 可以关注：

- 大面积地毯；
- 毛绒玩具；
- 床品；
- 宠物；
- 空调出风口；
- 明显积尘；
- 可见潮湿 / 疑似霉斑；
- 通风状况的可见线索。

系统不能输出：

> “你的打喷嚏就是因为这块地毯。”

而应该输出：

> “我看到床边有较大面积织物，而且当前窗户关闭。这些不一定是鼻部不适的原因，但如果你本身对尘螨或灰尘敏感，可以先尝试清洁织物、改善通风等低风险措施。”

Widget：

```text
环境观察

🟡 大面积织物
🟡 当前通风较少
🟢 未见明显烟雾

可以尝试
□ 清洗床品
□ 清洁地毯
□ 通风 10 分钟
```

---

# 8. 明确不做：用普通摄像头“看脸诊断疾病”

不建议把以下能力做成核心：

- 看脸色判断贫血；
- 看面部“水肿”直接推断疾病；
- 通过普通 RGB 摄像头判断具体健康指标；
- 通过外观直接诊断疾病。

原因：

- 光线影响；
- 白平衡影响；
- 摄像头算法差异；
- 妆容；
- 角度；
- 个体差异；
- 医疗风险。

视觉能力应优先用于：

1. 看动作；
2. 看姿态；
3. 看用户是否参与；
4. 看生活环境；
5. 在用户授权下观察明显、低风险、非诊断性线索。

---

# 9. 视觉技术架构：实时 CV + 低频 VLM + Agent

不要把 30 FPS 视频全部传给大模型。

原因：

- 成本高；
- 延迟高；
- Token / 图像调用开销大；
- 隐私压力大；
- 没有必要。

建议分为三层。

---

## 9.1 第一层：浏览器本地实时人体姿态

推荐候选：

- MediaPipe Pose；
- MoveNet；
- 后续可评估 WebGPU / WASM 推理。

数据流：

```text
Camera
  ↓
navigator.mediaDevices.getUserMedia()
  ↓
MediaPipe Pose / MoveNet
  ↓
人体关键点
肩 / 肘 / 腕 / 髋 / 膝 / 踝
  ↓
角度 / 相对位置 / 可见度
  ↓
Exercise Rule Engine
```

本地高频推理可保持 15~30 FPS，不需要把原始视频送到 LLM。

---

## 9.2 第二层：Pose Rule Engine

实时判断动作完成度。

例如：

```json
{
  "exercise": "shoulder_raise",
  "phase": "hold",
  "left_arm_angle": 76,
  "right_arm_angle": 93,
  "torso_lean": 4.2,
  "body_visible": true,
  "duration": 1.7,
  "issues": [
    "left_arm_too_low"
  ]
}
```

规则引擎负责：

- 是否看全身体；
- 左右臂角度；
- 躯干倾斜；
- 是否进入目标区间；
- 是否保持足够时间；
- 当前动作阶段；
- 是否需要纠正；
- 是否完成动作。

这样可以做到毫秒级 / 帧级反馈。

---

## 9.3 第三层：低频视觉大模型 VLM

VLM 不负责每一帧。

它更适合：

- 判断用户当前是在坐着还是站着；
- 判断空间是否适合某个动作；
- 判断画面是否遮挡严重；
- 识别房间环境；
- 理解传统姿态模型难以表达的上下文；
- 在关键时间点读取一帧 / 少量关键帧。

推荐策略：

```text
Pose 模型：
15~30 FPS 高频判断

VLM：
事件触发 / 关键帧 / 低频采样
```

架构：

```text
              ┌─ Pose Engine → 高频结构化判断
Camera ───────┤
              └─ VLM → 低频场景理解
                       ↓
                   LangGraph
                       ↓
              Embodied Behavior Planner
                       ↓
                  XmovAvatar
```

---

# 10. AI 不直接读“一坨代码”，而是消费结构化感知事件

今天用户提出了：

> 摄像头拍到视频 → 大模型分析 → 传给数字人。

技术上应做一层抽象。

不要把原始视觉结果直接塞给对话模型。

建议统一为 `PerceptionEvent`：

```json
{
  "source": "pose",
  "event": "exercise_feedback",
  "exercise": "shoulder_raise",
  "phase": "hold",
  "confidence": 0.96,
  "metrics": {
    "left_arm_angle": 76,
    "right_arm_angle": 93
  },
  "issues": [
    "left_arm_too_low"
  ]
}
```

环境观察：

```json
{
  "source": "vision",
  "event": "environment_observation",
  "observations": [
    {
      "type": "large_textile_area",
      "confidence": 0.81
    },
    {
      "type": "window_closed",
      "confidence": 0.74
    }
  ]
}
```

Agent 只处理结构化结果，再决定怎么回应。

---

# 11. LangGraph 下一阶段建议架构

现有主图较简单：

```text
START
  ↓
orchestrator
  ├─ health_question → knowledge_qa
  ├─ general_chat → END
  └─ emergency → END
```

建议演进为：

```text
START
  ↓
Context Loader
  ↓
Orchestrator
  ↓
Safety / Risk Gate
  ↓
Perception Router
  ├─ normal_chat
  ├─ pose_session
  └─ environment_session
  ↓
Coach / Knowledge
  ↓
Embodied Behavior Planner
  ↓
Tool Executor
  ├─ avatar_action
  ├─ show_widget
  ├─ pose_monitor
  ├─ camera_observe
  ├─ start_timer
  └─ save_memory
  ↓
Memory Update
  ↓
END
```

Teach-back 可以作为普通健康沟通流中的一个分支：

```text
Coach
  ↓
Teach-back
  ↓
Understanding Evaluator
  ├─ misunderstanding → Re-explain
  └─ understood → Micro Action
```

---

# 12. 新核心：Embodied Behavior Planner

当前 Task 3 的 Expression Planner 已有：

```text
emotion
+ intent
↓
facialEmotion
action
style
leadBeatMs
```

下一阶段建议升级为：

> **Embodied Behavior Planner**

输入：

- 当前对话阶段；
- 用户情绪；
- 用户姿态；
- 当前运动步骤；
- 视觉感知事件；
- 风险级别；
- 用户长期状态；
- 可用 KA 动作；
- 当前 Widget 状态。

输出：

```json
{
  "dialogue_stage": "exercise_feedback",
  "user_state": "engaged",
  "tone": "encouraging",
  "speech_rate": 0.92,
  "pause_before_ms": 150,
  "avatar_state": "speak",
  "ka_semantic": "Acknowledge",
  "speech": "右边很好，左手再抬高一点点。",
  "widget": {
    "type": "pose_feedback",
    "left_arm_angle": 76,
    "right_arm_angle": 93,
    "target_min": 85,
    "target_max": 100
  }
}
```

---

# 13. XmovAvatar 动作：不要假设可以任意骨骼控制

这是今天非常关键的技术结论。

当前公开 LiteSDK 不应按 Unity / Unreal 的方式理解。

不能先假设一定存在：

```text
walkTo(x, y)
setJoint(...)
setPose(...)
playArbitraryAnimation(...)
```

目前应优先依赖官方开放的：

- speak；
- think；
- listen；
- idle；
- interactiveidle；
- interrupt；
- KA Action；
- SSML / 事件驱动；
- Widget / Event 能力。

因此：

> **“数字人自己做一套完整健身操”目前不能直接承诺。**

是否能做到，要先取决于当前数字人实际拥有的 KA 动作库以及赛事方是否提供定制动作支持。

---

# 14. 第一步必须做：Xmov Action Lab

建议在前端增加开发工具页：

```text
/xmov-lab
```

用途：

1. 获取当前 Avatar 可用 KA；
2. 显示动作名；
3. 显示中文说明；
4. 展示预览图 / 预览视频；
5. 点击即可试播；
6. 验证每个动作是否适合比赛场景。

当前应优先验证官方动作列表查询接口：

```text
GET /user/v1/external/lite_ka_summary
```

建议产生本地 `Action Registry`：

```json
[
  {
    "semantic": "Acknowledge",
    "display_name": "点头确认",
    "category": "feedback",
    "usable_for": [
      "exercise_correct",
      "teachback_correct"
    ]
  }
]
```

---

# 15. 业务动作与 Xmov KA 必须解耦

不要在产品逻辑里直接写 Xmov 动作名。

推荐：

```text
业务语义
  ↓
Action Resolver
  ↓
真实可用 KA
```

例如：

```text
encourage_user
→ Acknowledge

show_left
→ PointingLeft

warm_up
→ Stretch

celebrate_completion
→ Thanks
```

如果目标动作不存在：

```text
业务动作
→ Resolver
→ 无匹配 KA
→ fallback
   ├─ 只语言反馈
   ├─ Widget 动作视频
   └─ 通用确认动作
```

这样不会让业务层和某个特定 Avatar 的动作库绑死。

---

# 16. KA 动作触发建议

根据魔珐公开文档，动作可通过具身播报内容中的 KA 语义触发。

示意：

```xml
<speak>
  <ue4event>
    <type>ka</type>
    <data>
      <action_semantic>Acknowledge</action_semantic>
    </data>
  </ue4event>
  对，就是这样。保持三秒。
</speak>
```

实际字段应以当前比赛 SDK / 当前 App 配置返回为准。

不要自行发明不存在的 KA semantic。

---

# 17. Function Calling / Tool Calling：行动层真正应该怎么实现

赛题提到：

- Function Calling；
- MCP；
- 行走；
- 动作编排；
- Widget。

这里不应该理解为：

> “XmovAvatar 自己调用工具。”

正确架构应是：

```text
LLM / LangGraph
  ↓
Tool Decision
  ↓
Tool Executor
  ├─ avatar_action
  ├─ camera_observe
  ├─ pose_monitor
  ├─ show_widget
  ├─ start_timer
  ├─ save_memory
  └─ health_knowledge_search
  ↓
前端 / Xmov / Camera / RAG 等实际执行器
```

---

## 17.1 建议 Tool 列表

### `avatar_action`

```json
{
  "name": "avatar_action",
  "description": "执行当前数字人支持的 KA 动作",
  "parameters": {
    "semantic": "Acknowledge",
    "speech": "对，就是这样。"
  }
}
```

### `pose_monitor`

```json
{
  "name": "pose_monitor",
  "description": "开始监测指定动作",
  "parameters": {
    "exercise": "shoulder_raise",
    "duration_seconds": 30
  }
}
```

### `camera_observe`

```json
{
  "name": "camera_observe",
  "description": "在用户授权后观察当前环境关键帧",
  "parameters": {
    "camera": "rear",
    "task": "environment_scan"
  }
}
```

### `show_widget`

```json
{
  "name": "show_widget",
  "description": "展示实时交互卡片",
  "parameters": {
    "type": "pose_feedback"
  }
}
```

### `start_timer`

用于：

- 保持动作；
- 呼吸练习；
- 休息；
- 倒计时。

### `save_memory`

写入：

- 用户执行困难；
- 偏好；
- 上一次动作完成情况；
- 下次跟进目标。

---

# 18. Widget 应成为数字人旁边的“第二表达通道”

不要让所有信息都靠数字人嘴说。

推荐屏幕布局：

```text
┌─────────────────────────────────────────┐
│                                         │
│      XmovAvatar 数字人                  │
│                                         │
│ “左手再抬高一点点。”                   │
│                                         │
├──────────────────┬──────────────────────┤
│ 摄像头预览        │ Pose Feedback       │
│                  │ 左臂 76°            │
│                  │ 目标 85°~100°       │
│                  │ ███████░░           │
├──────────────────┴──────────────────────┤
│ 🎤 说话 / 暂停 / 结束训练               │
└─────────────────────────────────────────┘
```

Widget 适合展示：

- 姿势角度；
- 动作进度；
- 倒计时；
- 今日计划；
- 环境观察；
- 健康知识来源；
- Teach-back 结果；
- 训练完成情况。

---

# 19. 为什么这次“数字人不可替代性”更强

以后答辩不要只说：

> “数字人更生动、更有亲和力。”

这不足以构成不可替代性。

建议正式论证：

> **在视觉共练场景里，用户与 Agent 共享同一个身体动作语境。数字人负责示范与身体反馈，视觉系统负责观察，Agent 负责判断，数字人再通过语言、动作和多模态 Widget 对用户做实时纠正。**

如果去掉数字人：

```text
文字：
“请把手抬到 90°。”
```

保留数字人：

```text
数字人示范
  ↓
用户模仿
  ↓
AI 观察
  ↓
数字人实时纠正
  ↓
用户调整
  ↓
AI 再观察
```

差异不是“UI 更漂亮”，而是：

> **数字人本身参与了任务执行过程。**

---

# 20. Web / PC / Android 的平台决策

当前赛题没有必要把产品强行改成 Android。

## 当前建议

### 主作品

> **Web / PC 浏览器版**

原因：

- 当前 H5 / React / Vite 已成熟；
- XmovAvatar Web 接入已开始完成；
- 浏览器可直接使用 `getUserMedia()`；
- 摄像头、Pose、Widget 都更容易快速验证；
- 评审演示方便；
- 不需要重写 Android UI。

### 第二阶段

再考虑：

- Android SDK；
- 手机前置 / 后置摄像头；
- 平板；
- RK3588 健康终端；
- 大屏健康陪伴终端。

产品层应保持“一套 Agent，多终端身体”。

---

# 21. PC 与手机摄像头交互差异

## PC

适合：

- 上半身；
- 全身动作；
- 肩颈拉伸；
- 久坐活动；
- 姿态练习；
- 呼吸与节奏训练。

典型：

```text
显示器
+ Webcam
+ 数字人
+ 用户站在电脑前跟练
```

## 手机

适合：

- 自拍式上半身练习；
- 手机固定后拍全身；
- 后置摄像头环境观察；
- 房间 / 办公位 / 生活环境扫描。

---

# 22. 隐私策略：摄像头能力必须默认克制

视觉会明显增加隐私敏感度。

建议明确：

1. 摄像头默认关闭；
2. 只有用户显式授权后开启；
3. 运动模式尽量本地 Pose 推理；
4. 原始视频默认不上传；
5. 原始视频默认不存储；
6. VLM 只上传用户明确允许的关键帧；
7. 可显示“当前正在分析什么”；
8. 随时支持关闭摄像头；
9. 不做人脸识别；
10. 不进行身份推断；
11. 不从外观推断疾病；
12. 医疗建议保持非诊断性边界。

理想数据流：

```text
Raw Video
  ↓
浏览器本地 Pose
  ↓
关键点 / 角度
  ↓
上传结构化数据
```

而不是：

```text
Raw Video
→ 持续上传服务器
→ LLM 看完整视频
```

---

# 23. 医疗安全边界

HealthCompanion 当前仍然包含健康知识、用药、紧急风险等能力。

建议最终定位：

> **生活与健康陪伴 Agent，而不是医生替代品。**

可以做：

- 健康知识解释；
- 医嘱 / 健康资料解释；
- Teach-back；
- 日常生活建议；
- 非医疗运动陪伴；
- 环境观察；
- 用户行动跟进；
- 风险提示；
- 建议就医。

不能依赖普通摄像头做：

- 疾病诊断；
- 精确生命体征判断；
- 药物调整；
- 从脸色判断明确疾病；
- 根据外观给出确定病因。

---

# 24. 比赛主线不要做成“万能生活 AI”

今天讨论中也提出：

> 生活建议、健康建议、医疗建议、环境观察、运动都可以。

从长期产品愿景看没有问题。

但比赛不能全部平均展开。

否则又会回到：

> “这是一个什么都能聊的 AI 数字人。”

建议比赛功能优先级：

## P0：视觉共练

```text
Camera
+ Pose
+ XmovAvatar
+ 实时纠正
+ 打断
+ Widget
```

## P1：环境视觉陪伴

```text
Rear Camera
+ VLM
+ 环境观察
+ 低风险建议
```

## P1：长期陪伴

```text
Memory
+ 用户困难
+ 上次完成情况
+ 下次续接
```

## P2：Teach-back 健康沟通

```text
解释
+ 用户复述
+ 理解评估
+ 再解释
```

---

# 25. 建议的完整技术栈

## 前端

- React
- TypeScript
- Vite
- XmovAvatar Web SDK
- Web Camera API / `getUserMedia`
- MediaPipe Pose 或 MoveNet
- Canvas / SVG / React Widget
- SSE

## 后端

- NestJS
- PostgreSQL
- Redis

## Agent 层

- FastAPI
- LangGraph
- DeepSeek
- Function Calling / Tool Calling
- Structured Output

## 知识层

- Milvus
- 用户知识库
- 医疗 / 健康知识库
- Citation

## 视觉层

### 高频实时

- MediaPipe Pose / MoveNet
- 本地关键点推理
- Pose Rule Engine

### 低频高语义

- VLM
- 关键帧分析
- 环境场景理解

## 具身层

- XmovAvatar
- TTS
- 口型
- think / listen / speak / interrupt
- KA Action
- SSML
- Widget / Event
- Embodied Behavior Planner

## 原有兼容链

现有仓库中的：

- LiveTalking；
- GPT-SoVITS；
- SRS；

可以继续保留为历史 / fallback / 对比链路，但比赛主线建议聚焦 XmovAvatar。

---

# 26. 建议的新模块划分

以下是下一阶段建议新增，不代表当前仓库已经存在。

```text
yhzk-demo-h5/src/
├── perception/
│   ├── camera.ts
│   ├── poseEngine.ts
│   ├── poseTypes.ts
│   ├── exerciseRules.ts
│   └── perceptionEvents.ts
│
├── avatar/
│   ├── actionRegistry.ts
│   ├── actionResolver.ts
│   ├── embodiedBehaviorPlanner.ts
│   └── xmovKa.ts
│
├── components/
│   ├── CameraPreview.tsx
│   ├── PoseOverlay.tsx
│   ├── PoseFeedbackWidget.tsx
│   ├── ExerciseProgressWidget.tsx
│   └── EnvironmentObservationWidget.tsx
│
└── services/
    ├── xmovAvatar.ts
    ├── perception.ts
    └── agentTools.ts
```

AI Service：

```text
ai-service/app/
├── graph/
│   ├── nodes/
│   │   ├── perception_router.py
│   │   ├── health_coach.py
│   │   ├── safety_gate.py
│   │   ├── embodied_planner.py
│   │   └── memory_update.py
│   └── state.py
│
├── tools/
│   ├── avatar_action.py
│   ├── widget.py
│   ├── exercise.py
│   └── memory.py
```

---

# 27. 最小可行版本 MVP

不要第一天就做完整健身系统。

## MVP 只做一个动作

推荐：

> 双臂抬到肩高 / 简单肩部伸展

必须跑通：

```text
1. 用户点击“开始共练”
2. 请求摄像头权限
3. Camera Preview 出现
4. MediaPipe / MoveNet 检测上半身
5. 判断用户距离
6. 数字人引导调整位置
7. 数字人示范 / 给出动作指令
8. Pose Engine 判断手臂角度
9. 数字人实时纠正
10. Widget 显示角度
11. 达标后倒计时
12. 用户可以语音打断
13. 完成后数字人鼓励
14. 写入本次结果
```

只要这条链真的跑通，就已经是核心创新 Proof of Concept。

---

# 28. Demo 最关键的一幕

最终演示建议做到：

用户：

> “最近一直坐电脑前，肩膀特别僵。”

数字人：

> “那我们现在一起动两分钟吧。”

数字人进入运动模式。

用户授权摄像头。

数字人：

> “往后一点，让我能看到你的上半身。”

系统检测成功。

数字人：

> “好，现在跟我一起把手抬起来。”

用户动作不正确。

数字人：

> “右边很好，左手再抬高一点点。”

Widget：

```text
左臂 76°
目标 85°~100°
```

用户调整正确。

数字人点头 / KA：

> “对，就是这里。”

Widget：

```text
✓ 姿势正确
保持 5 秒
```

用户中途说：

> “这里有点拉扯感。”

立即 interrupt。

数字人：

> “那先别硬撑，我们把幅度降一点。”

这段 Demo 应成为比赛视频和现场演示的核心。

---

# 29. 对赛题三个自由度的覆盖

根据当前赛题说明，可以这样映射。

## 表达层

已具备 / 可继续深化：

- 数字人形象；
- TTS；
- 口型；
- 流式播报；
- 语速 / 音调 / 停顿；
- KA 动作；
- 字幕；
- Widget。

## 交互层

重点深化：

- 多轮对话；
- 情绪状态；
- listen；
- interrupt；
- RAG；
- 用户记忆；
- 摄像头视觉输入；
- Pose 实时交互。

## 行动层

重点创新：

- `avatar_action`
- `pose_monitor`
- `camera_observe`
- `show_widget`
- `start_timer`
- `save_memory`
- KA 动作编排
- Widget 动态反馈

---

# 30. 与魔珐官方导诊 / 健康助手的最终差异

## 官方典型医疗方向

```text
症状
→ 多轮追问
→ 健康信息 / 导诊 / 科室建议
```

## HealthCompanion 新方向

```text
用户身体 / 环境
→ 摄像头感知
→ Agent 判断
→ 数字人示范 / 引导
→ 用户行动
→ 再观察
→ 实时纠正
→ Widget
→ 长期记忆
```

重点不是“回答更多医疗问题”，而是：

> **把数字人变成一个与用户共享身体动作和现实环境语境的陪伴者。**

---

# 31. 下一阶段开发顺序

## Phase 0：Xmov 能力摸底

必须先做：

- 获取 KA 动作列表；
- Xmov Action Lab；
- 动作预览；
- 确认是否存在 Stretch / Exercise / Point / Nod / Encourage 等动作；
- 明确当前 Avatar 的真实能力边界。

### 产物

```text
Action Registry
```

---

## Phase 1：视觉共练最小闭环

只做一个动作：

```text
Camera
→ Pose
→ Angle
→ Feedback
→ Xmov speech
→ Widget
```

此时先不接 VLM。

---

## Phase 2：Agent Tool Calling

把：

- Pose；
- KA；
- Widget；
- Timer；

全部变成 LangGraph 可调用工具。

实现：

```text
LLM
→ tool_call
→ executor
→ result
→ next decision
```

---

## Phase 3：环境视觉

加入：

- 后置摄像头；
- 关键帧；
- VLM；
- Environment Observation Widget。

---

## Phase 4：长期陪伴

加入：

- companion memory；
- 上次训练；
- 用户阻碍；
- 下次续接；
- Teach-back。

---

## Phase 5：Android / 其他终端

比赛时间允许再做：

- Android；
- 平板；
- RK3588；
- 大屏终端。

---

# 32. 必须向魔珐赛事技术支持确认的问题

建议尽快在赛事群 / 官方支持渠道一次性确认：

1. 参赛账号是否能申请额外数字人形象？
2. 是否有比赛专用 Avatar 资源？
3. 是否可以申请运动 / 拉伸 / 健身类 KA？
4. 是否支持自定义 KA？
5. 是否支持上传动作资源？
6. “行走动画”在 LiteSDK 中对应哪个公开 API / 协议？
7. 是否支持数字人在场景中真正位移？
8. 是否存在比赛专用动作编排接口？
9. Widget 自定义的正式协议是什么？
10. Web SDK 中 App Secret 的正式生产接入方式是什么？
11. 是否允许 Camera + Pose / VLM 的具身交互作品？
12. 比赛现场网络 / 浏览器 / GPU 环境有什么限制？

特别重要：

> 如果官方愿意给参赛队开放运动动作资源，那么“数字人和用户同步共练”可以直接成为本项目的最强主线。

---

# 33. 当前不确定项

以下内容目前不应在提交材料中写成已实现：

- 任意 3D 骨骼驱动；
- 自定义运动动作上传；
- 数字人完整健身操；
- 真正自由行走；
- 任意表情 BlendShape 控制；
- 实时视频直接被大模型逐帧理解；
- 摄像头医学诊断。

必须先以实际 SDK / 比赛账号能力验证。

---

# 34. 当前最终产品表述建议

## 名称

仍可使用：

> **康伴智生 · HealthCompanion**

## 不建议副标题

> AI 健康数字人助手

太普通，也容易撞官方。

## 当前建议副标题

> **一个能看见你、陪你一起做、实时纠正你的具身健康陪伴 Agent**

或者：

> **会看、会做、会陪你一起行动的具身健康伙伴**

---

# 35. 当前最核心的产品价值

最终不是：

> AI 知道多少健康知识。

而是：

> **AI 能否进入用户真实生活与真实动作，形成持续的感知—行动—反馈闭环。**

HealthCompanion 下一阶段应围绕下面这句话开发：

```text
SEE
看见你

UNDERSTAND
理解你现在的状态

ACT
数字人做出动作、语言和 Widget 反馈

CO-ACT
和你一起行动

CORRECT
实时纠正

REMEMBER
记住这一次经历
```

即：

```text
SEE → UNDERSTAND → ACT → CO-ACT → CORRECT → REMEMBER
```

这将作为下一阶段产品与技术设计的总原则。

---

# 36. 决策日志

| 编号 | 决策 | 结论 |
|---|---|---|
| D1 | 是否继续普通健康问答数字人 | 否，创新不足 |
| D2 | 是否放弃 HealthCompanion 重做新项目 | 否，保留现有工程底座 |
| D3 | 是否以 AI 医生 / 导诊为核心 | 否，与官方场景过近 |
| D4 | 是否保留健康方向 | 是，但改为生活 / 健康陪伴 |
| D5 | 是否强化长期记忆与 Teach-back | 是，作为持续陪伴能力 |
| D6 | 是否把视觉作为下一阶段核心 | 是 |
| D7 | 是否持续上传完整视频给 LLM | 否 |
| D8 | 实时动作判断方案 | 本地 Pose 为主 |
| D9 | VLM 用途 | 低频场景理解 / 环境观察 |
| D10 | 是否直接承诺数字人完整健身操 | 否，先确认 KA |
| D11 | 是否做 Android 为主作品 | 否，Web / PC 先完成 |
| D12 | Action Layer 怎么实现 | LangGraph Tool Calling → Xmov / Camera / Widget 执行器 |
| D13 | 比赛最核心 Demo | 数字人与用户视觉共练 |
| D14 | 数字人不可替代性 | 示范 + 观察 + 纠正 + 共同行动闭环 |
| D15 | 环境视觉是否保留 | 是，作为第二场景 |
| D16 | 看脸诊断是否做 | 否 |
| D17 | 下一步第一件事 | Xmov Action Lab + KA 能力摸底 |
| D18 | 下一步第二件事 | Camera → Pose → 一个动作判断 → Xmov 反馈闭环 |

---

# 37. 相关官方资料

后续开发前应持续以魔珐当前官方文档为准：

- 魔珐星云 / XmovAvatar：  
  https://www.xingyun3d.com/
- 开发者文档：  
  https://www.xingyun3d.com/developers
- XmovAvatar / LiteSDK 相关开发文档：  
  https://www.xingyun3d.com/developers/52-183
- KA 动作相关文档：  
  https://www.xingyun3d.com/developers/52-192
- 魔珐技术社区 / Agent + 动作相关案例：  
  https://www.xingyun3d.com/community/

> 注意：SDK、接口、赛题资源可能继续变化。正式实现时，应以比赛账号当前可访问的官方文档、实际返回字段和技术支持回复为准。

---

# 38. 最终结论

HealthCompanion 目前不需要推倒重来。

它已经有：

- LangGraph；
- RAG；
- 健康上下文；
- SSE；
- 数字人；
- XmovAvatar；
- 情绪表达；
- 打断；
- 前后端；
- 数据库；
- 部署链。

真正缺失的是：

> **一个让数字人本身成为业务必需部分的核心机制。**

2026-09-29 的最终方向是：

> **从“健康问答数字人”升级为“视觉共练型具身健康陪伴 Agent”。**

技术重点从：

```text
Question
→ LLM
→ Answer
→ Avatar Speak
```

转为：

```text
Camera / User State
→ Real-time Pose / VLM
→ LangGraph Decision
→ Tool Calling
→ XmovAvatar Action + Speech + Widget
→ User Action
→ Re-observe
→ Correct / Encourage
→ Memory
```

下一阶段优先只做两件事：

1. **拿到真实 KA 动作库并做 Xmov Action Lab。**
2. **完成 Camera → Pose → 一个动作判断 → 数字人实时反馈的最小闭环。**

这两件事如果真正跑通，HealthCompanion 才会从“数字人展示项目”进入“具身交互 Agent 项目”。

## 30. 商用产品体验方向（2026-10-01 用户补充）

当前 Pose Lab 与 SDK 页面属于临时技术验证窗口，不是最终商用产品 UI。后续产品设计要从真实落地场景和用户任务出发，以用户体验和长期商业价值为目标，避免把摄像头调试页直接扩充成产品首页。

用户明确的体验方向：

- 使用大场景作为主要体验空间；
- 数字人是主要陪伴对象，而不是小画布中的附属部件；
- 语音是日常交互的主要方式，产品流程不依赖阅读屏幕文字；
- 摄像头、姿态识别、Agent 和动作反馈作为支撑真实场景服务的能力；
- 商业场景、目标客户和收费方式需要后续验证，不提前臆定。

短期的 Pose Lab 仍承担摄像头、关键点、动作闭环和响应体验验收。本次改为视口内可操作的临时训练窗，不能据此视为商用主界面设计完成。
