# XmovAvatar Task 3 — Expression Planner（具身表达）

Task 3 在不改动聊天主链路（App.tsx / LangGraph / RAG）的前提下，把后端已有的
`intent + emotion` 信号变成数字人的**表达计划**：面部情感、动作提示、说话风格
与共情停顿，使"康伴智生"从会说话的数字人进入具身表达阶段。

## 数据流

```text
LangGraph (SSE: intent / emotion / speech_chunk)
      ↓  （Task 2 既有链路，未改动）
XmovAvatarBridge  setIntent(roundId, intent, emotion)
      ↓
Expression Planner  planExpression(intent, emotion)
      ├─ facialEmotion   neutral / happy / concerned / sad
      ├─ action          acknowledge_explain / medication_guidance /
      │                  friendly_respond / alert_acknowledge
      ├─ style           <prosody rate/pitch/volume>
      └─ leadBeatMs      think 之后、首个语音片段之前的共情停顿 (≤900ms)
      ↓
XmovAvatarProvider.applyExpression(plan)
      ├─ 本地记录 + onExpressionChange 事件（Player 状态条显示表达徽标）
      └─ speak() 时渲染 SSML / extra 提示透传网关
      ↓
XmovAvatar (LiteSDK speak(ssml, is_start, is_end, extra))
```

## 映射表

### emotion → 基线表达

| emotion | facialEmotion | style | leadBeatMs |
|---|---|---|---|
| neutral | neutral | — | 0 |
| happy | happy | pitch +5% | 0 |
| concerned | concerned | rate -8%, pitch -2% | 300ms |
| anxious | concerned（安抚） | rate -12%, pitch -4% | 500ms |
| sad | sad | rate -10%, pitch -6%, volume -10% | 400ms |

### intent → 动作与覆盖（与 ai-service orchestrator 枚举对齐）

| intent | action | 覆盖 |
|---|---|---|
| health_question | acknowledge_explain | — |
| medication_query | medication_guidance | — |
| general_chat | friendly_respond | — |
| emergency | alert_acknowledge | rate -5%, beat 200ms |

合并规则：intent 的 style 覆盖 emotion 的同名项；leadBeat 取两者较大值，上限 900ms。

## 安全边界（与 SDK 能力对齐）

对 Xmov LiteSDK 2.4.1 的实际分析结论：本地没有独立的表情/动作 API
（可用命令只有 speak/think/idle/listen/interactiveidle/interrupt/setVolume），
风格信息只能经 `speak()` 的 SSML 字符串与 `extra` 参数透传网关。因此：

1. **SSML 渲染默认关闭**（`VITE_XMOV_EXPRESSION_SSML=true` 开启）。
   关闭时 speak() 收到的 SSML 与 Task 2 逐字节一致，行为零变化；
   开启时只使用 W3C 标准 `<prosody>`，不发明私有标签，文本已转义，
   且文本本身已是 SSML 时原样透传。
2. `extra` 仅在开关开启时附带 `xmov_facial_emotion` / `xmov_action` 提示字段
   （网关未知字段按约定忽略）。
3. **共情停顿不依赖 SDK**：bridge 在首个 speech_chunk 前延时，
   只延迟语音首段，文字流式与字幕不受影响。
4. Provider 表达失败不影响聊天：所有表达动作走 Task 2 的串行队列，
   单个动作异常被捕获后队列继续（Task 2 验收 11 语义保持）。

## 改动清单

- 新增 `src/avatar/expressionPlanner.ts`：纯函数规划器（可单测）
- `src/services/xmovAvatar.ts`：round 增加 plan；setIntent 重算计划；
  beginRound 以中性计划重置（与 interrupt 串行，避免互相覆盖）；
  首个语音片段前应用共情停顿
- `src/avatar/XmovAvatarProvider.ts`：applyExpression / getExpression /
  onExpressionChange 事件；speak() 接入 renderSsml 与 extra 提示
- `src/components/XmovAvatarPlayer.tsx`：状态条表达徽标（中性不显示）
- `src/components/XmovAvatarPlayer.scss`：徽标样式
- **未改动**：App.tsx、chat.ts、ai-service、LiveTalking、LiveTalking fallback

## 本地验证

```bash
cd yhzk-demo-h5
npm run build
# 表达 SSML 开启（可选）：
VITE_XMOV_EXPRESSION_SSML=true npm run dev
```

验收问题示例（情感链路）：

```text
用户：我最近血压有点高，很担心。
预期：intent=health_question, emotion=anxious
      → 表达徽标"关切 · acknowledge_explain"
      → 首段语音前约 500ms 共情停顿（文字先流式显示，不受影响）
      → 开启 SSML 时首段语音以 <prosody rate="-12%" pitch="-4%"> 渲染
```
