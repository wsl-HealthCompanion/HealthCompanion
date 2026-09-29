# XmovAvatar 三个关键里程碑实施计划

> 本文把 HealthCompanion 下一阶段的具身交互开发收敛为三个关键里程碑。  
> 原则：先验证真实能力，再跑通最小闭环，最后接入 Agent Tool Calling。  
> 不同时铺开多个场景，不先做 Android，不先做复杂环境识别。

---

## 总目标

HealthCompanion 下一阶段不再只是：

```text
用户提问
→ LLM / RAG
→ 数字人播报
```

而要完成：

```text
用户现实动作 / 环境
→ 摄像头感知
→ Agent 判断
→ 数字人动作 + 语音 + Widget
→ 用户继续行动
→ 再感知
→ 再反馈
```

三个里程碑分别解决三个核心问题：

1. **数字人到底能做什么？**
2. **用户动作能不能真正驱动数字人反馈？**
3. **Agent 能不能自己决定何时调用感知、动作与 Widget？**

---

# Milestone 1：Xmov Action Lab

## 目标

拿到当前比赛账号 / App ID 对应数字人的**真实 KA 动作列表**，确认：

- 实际有哪些动作；
- 每个动作叫什么；
- 每个动作是否可以预览；
- 哪些动作适合健康陪伴；
- 哪些动作适合视觉共练；
- 是否存在伸展、指向、点头、鼓励、欢迎等动作；
- 哪些动作可以稳定通过 `speak()` / KA 事件触发。

在这一步完成前，不再假设：

- `Stretch` 一定存在；
- `PointingLeft` 一定存在；
- `Acknowledge` 一定存在；
- 数字人可以完整做健身操；
- Xmov 支持任意骨骼动作。

---

## 建议新增入口

前端新增独立开发页：

```text
/xmov-action-lab.html
```

不要一开始接入主聊天页面。

页面建议：

```text
┌──────────────────────────────────────────┐
│ Xmov Action Lab                         │
├───────────────────┬──────────────────────┤
│                   │ KA 动作列表          │
│    XmovAvatar     │                      │
│                   │ [刷新动作]           │
│                   │                      │
│                   │ 动作中文名           │
│                   │ semantic / name      │
│                   │ type                 │
│                   │ [预览] [执行]        │
└───────────────────┴──────────────────────┘
```

---

## 数据获取

优先验证魔珐官方 KA 列表接口：

```text
GET /user/v1/external/lite_ka_summary
```

注意：

- 由 NestJS 服务端调用；
- 不要在浏览器暴露 App Secret；
- 使用服务端环境变量保存 Xmov 凭据；
- 真实接口字段以比赛账号实际返回为准。

建议服务端增加：

```text
GET /api/v1/xmov/actions
```

前端只访问自己的 NestJS：

```text
Browser
  ↓
NestJS
  ↓
Xmov KA API
```

---

## 建议的数据标准化

无论官方返回字段如何，前端统一转换为：

```ts
interface XmovAction {
  semantic: string;
  displayName: string;
  type?: string;
  previewImage?: string;
  previewVideo?: string;
  available: boolean;
}
```

形成：

```text
Action Registry
```

例如：

```json
[
  {
    "semantic": "真实 KA 名称",
    "displayName": "点头确认",
    "type": "gesture",
    "available": true
  }
]
```

---

## 业务语义与 KA 解耦

以后不要让业务代码直接依赖 KA 名。

增加：

```text
Business Action
  ↓
Action Resolver
  ↓
Xmov KA
```

例如：

```text
encourage_user
  ↓
当前数字人可用的确认 / 鼓励动作

show_direction
  ↓
当前数字人可用的指向类动作

warm_up
  ↓
当前数字人可用的伸展类动作
```

若没有对应 KA：

```text
fallback
├─ 语言反馈
├─ 通用动作
└─ Widget / 示范视频
```

---

## 验收标准

Milestone 1 PASS 必须满足：

- [ ] 能从当前 App ID 获取真实 KA 列表；
- [ ] 页面能展示动作总数；
- [ ] 能看到动作 semantic / 名称 / 类型；
- [ ] 有预览资源时可以查看；
- [ ] 可以点击某个动作让当前数字人真实执行；
- [ ] 记录至少 5 个可用于 HealthCompanion 的动作；
- [ ] 生成 `Action Registry`；
- [ ] 不再使用未验证的虚构 KA 名称；
- [ ] 明确“视觉共练”是否有可用示范动作。

---

# Milestone 2：Camera → Pose → Xmov Feedback

## 目标

只做**一个肩部动作**，跑通完整具身闭环。

不要第一阶段做完整健身操。

推荐动作：

> 双臂抬至肩部高度 / 简单肩部伸展

理由：

- 上半身 Webcam 即可；
- 关键点清晰；
- 角度规则容易实现；
- 演示效果直观；
- 适合久坐肩颈场景；
- 医疗风险相对较低。

---

## 最小数据流

```text
Camera
  ↓
MediaPipe Pose / MoveNet
  ↓
肩 / 肘 / 腕关键点
  ↓
Pose Rule Engine
  ↓
PerceptionEvent
  ↓
反馈逻辑
  ↓
XmovAvatar Speech / KA
  +
Pose Widget
```

---

## 浏览器摄像头

使用：

```ts
navigator.mediaDevices.getUserMedia({
  video: true,
  audio: false
})
```

要求：

- 用户显式点击后才申请权限；
- 页面显示摄像头状态；
- 随时可以关闭；
- 默认不录制；
- 默认不上传原始视频。

---

## Pose 推理

优先评估：

- MediaPipe Pose；
- MoveNet。

第一阶段只输出必要关键点：

- left_shoulder
- right_shoulder
- left_elbow
- right_elbow
- left_wrist
- right_wrist
- hip / torso reference

不要把每一帧发给 LLM。

---

## Pose Rule Engine

例如：

```json
{
  "exercise": "shoulder_raise",
  "phase": "hold",
  "body_visible": true,
  "left_arm_angle": 76,
  "right_arm_angle": 93,
  "torso_lean": 4.2,
  "issues": [
    "left_arm_too_low"
  ]
}
```

第一阶段规则只需要：

1. 是否检测到上半身；
2. 是否离摄像头太近 / 太远；
3. 左臂角度；
4. 右臂角度；
5. 是否进入目标范围；
6. 是否保持指定时间。

---

## PerceptionEvent

统一定义结构化感知事件：

```ts
interface PerceptionEvent {
  source: 'pose' | 'vision';
  event: string;
  confidence?: number;
  payload: Record<string, unknown>;
}
```

示例：

```json
{
  "source": "pose",
  "event": "exercise_feedback",
  "confidence": 0.96,
  "payload": {
    "exercise": "shoulder_raise",
    "left_arm_angle": 76,
    "right_arm_angle": 93,
    "issues": ["left_arm_too_low"]
  }
}
```

---

## 数字人反馈

第一阶段不用让 LLM 每帧生成。

规则可以直接映射：

```text
body_not_visible
→ “往后一点，让我能看到你的上半身。”

left_arm_too_low
→ “右边很好，左手再抬高一点。”

pose_correct
→ “对，就是这里，保持三秒。”

completed
→ KA 鼓励动作 + “很好，这一组完成了。”
```

Widget 同时显示：

```text
左臂 76°
右臂 93°

目标：85° ~ 100°

左臂 ↑
右臂 ✓
```

---

## 打断

必须保留现有 Xmov interrupt 能力。

例如训练中：

用户：

> “这里有点不舒服。”

系统：

```text
用户输入 / ASR
→ interrupt
→ 暂停 pose session
→ 数字人停止当前播报
→ 回到对话
```

不要为了“动作完成”强迫用户继续。

---

## 验收标准

Milestone 2 PASS：

- [ ] 浏览器可以申请并关闭摄像头；
- [ ] 页面可看到 Camera Preview；
- [ ] 本地 Pose 模型可运行；
- [ ] 能识别上半身关键点；
- [ ] 能判断用户距离 / 可见性；
- [ ] 能计算左右臂目标角度；
- [ ] 用户姿势错误时数字人给对应反馈；
- [ ] 用户调整正确后反馈发生变化；
- [ ] Widget 实时显示关键数据；
- [ ] 能倒计时保持；
- [ ] 用户可随时打断；
- [ ] 完成一次完整肩部动作流程；
- [ ] 原始视频默认不上传服务器。

---

# Milestone 3：Tool Calling 接入 LangGraph

## 目标

把 Milestone 1 与 Milestone 2 中已经验证的能力，从“前端写死逻辑”升级成：

> **LangGraph Agent 可以根据上下文自主决定调用哪个工具。**

重点工具：

```text
pose_monitor
avatar_action
show_widget
```

后续再加入：

```text
camera_observe
start_timer
save_memory
```

---

## 建议 LangGraph 结构

```text
START
  ↓
Context Loader
  ↓
Orchestrator
  ↓
Safety Gate
  ↓
Embodied Planner
  ↓
Tool Decision
  ↓
Tool Executor
  ├─ pose_monitor
  ├─ avatar_action
  └─ show_widget
  ↓
Observation
  ↓
Next Decision
  ↓
END / Continue
```

---

## Tool 1：pose_monitor

用途：

- 启动指定动作监测；
- 停止监测；
- 获取当前动作状态。

示例：

```json
{
  "name": "pose_monitor",
  "arguments": {
    "exercise": "shoulder_raise",
    "mode": "start"
  }
}
```

Tool Result：

```json
{
  "status": "monitoring",
  "body_visible": true,
  "left_arm_angle": 76,
  "right_arm_angle": 93,
  "issues": ["left_arm_too_low"]
}
```

---

## Tool 2：avatar_action

用途：

- 执行已验证的 KA；
- 与播报文本组合。

参数只能从 Action Registry 选择。

示例：

```json
{
  "name": "avatar_action",
  "arguments": {
    "semantic": "真实已验证 KA",
    "speech": "对，就是这样。"
  }
}
```

禁止模型自行发明不存在的 KA。

---

## Tool 3：show_widget

用途：

显示实时精确信息。

示例：

```json
{
  "name": "show_widget",
  "arguments": {
    "type": "pose_feedback",
    "data": {
      "left_arm_angle": 76,
      "right_arm_angle": 93,
      "target_min": 85,
      "target_max": 100
    }
  }
}
```

---

## 前后端执行模型

LLM 不应该直接操作浏览器 API。

应该：

```text
LangGraph
  ↓
Tool Call
  ↓
NestJS / SSE Tool Event
  ↓
Browser Tool Executor
  ↓
Camera / Pose / Xmov / Widget
  ↓
Tool Result
  ↓
LangGraph
```

也就是说：

- Agent 做决策；
- 浏览器做真实设备动作；
- 结果再返回 Agent。

---

## Embodied Behavior Planner

Milestone 3 后，把现有 `Expression Planner` 逐步升级为：

```text
Embodied Behavior Planner
```

输入：

- intent；
- emotion；
- dialogue_stage；
- PerceptionEvent；
- pose session state；
- risk level；
- available actions；
- current widget；
- user memory。

输出：

```json
{
  "speech": "右边很好，左手再抬高一点。",
  "tone": "encouraging",
  "avatar_state": "speaking",
  "ka_semantic": "真实已验证 KA",
  "widget": {
    "type": "pose_feedback"
  },
  "next_action": "continue_monitoring"
}
```

---

## Tool Calling 验收 Demo

最终必须至少出现一次真实闭环：

```text
用户：
“陪我活动一下肩膀。”

Agent
→ pose_monitor(start)

浏览器
→ 开启 Camera
→ Pose Tracking

Tool Result
→ left_arm_too_low

Agent
→ avatar_action(...)
→ show_widget(...)

数字人：
“右边很好，左手再高一点。”

用户调整

Pose Result
→ pose_correct

Agent
→ avatar_action(...)
→ show_widget(...)

数字人：
“对，就是这样，保持三秒。”
```

---

## 验收标准

Milestone 3 PASS：

- [ ] LangGraph 中存在正式 Tool 定义；
- [ ] `pose_monitor` 可被 Agent 调用；
- [ ] `avatar_action` 只能使用真实 Action Registry；
- [ ] `show_widget` 可以由 Agent 调用；
- [ ] Tool Call 可通过 SSE 到达浏览器；
- [ ] 浏览器执行后可以返回 Tool Result；
- [ ] Agent 能根据 Tool Result 决定下一步；
- [ ] 至少完成一次两轮以上的“观察 → 行动 → 再观察”循环；
- [ ] 训练中用户可以打断；
- [ ] Tool Trace 可用于 Demo / 调试。

---

# 三个里程碑之间的依赖关系

```text
Milestone 1
Xmov Action Lab
确认数字人真实能力
        ↓
Milestone 2
Camera → Pose → Xmov Feedback
确认现实动作闭环
        ↓
Milestone 3
Tool Calling
让 Agent 自主编排以上能力
```

顺序不能反。

如果 Milestone 1 没完成：

> Agent 不知道真实有哪些数字人动作。

如果 Milestone 2 没完成：

> Tool Calling 只是调用了一堆未验证能力。

所以必须：

> **先能力摸底 → 再最小闭环 → 最后 Agent 化。**

---

# 当前完成后应达到的比赛形态

三个里程碑全部完成后，HealthCompanion 的比赛主链路应变成：

```text
用户现实状态
   ↓
Camera / Pose
   ↓
PerceptionEvent
   ↓
LangGraph
   ↓
Tool Calling
   ├─ pose_monitor
   ├─ avatar_action
   └─ show_widget
   ↓
XmovAvatar + Widget
   ↓
用户行动
   ↓
再次感知
```

这时作品才真正从：

> “会说话的 AI 健康助手”

升级为：

> **“能看见你、陪你一起做、实时纠正你的具身健康陪伴 Agent。”**
