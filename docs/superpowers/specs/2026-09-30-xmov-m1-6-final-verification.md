# Xmov Milestone 1.6 最终验收

**日期：** 2026-09-30

**状态：** PASS，Milestone 1 正式关闭

**分支：** `feat/xmov-m1-action-lab`

## 当前账号已验证能力

当前比赛账号真实返回 **94 个 KA**，其中没有任何动作带图片或视频预览资源。Action Lab 展示了动作总数，以及每个动作的 semantic、名称和类型；本次账号没有可供预览的媒体资源。

通过实际观看数字人执行画面，确认以下 **7 个互不相同的 KA semantic** 能产生可见动作：

| Semantic | 画面观察 | Registry 状态 |
| --- | --- | --- |
| `Nod` | 低头并抬手至胸前；不是单纯点头 | `acknowledge` 和 `confirm` 共用 |
| `skill_like` | 抬手竖拇指 | 映射到 `encourage` |
| `LeftSide` | 向数字人左侧伸手指示 | 映射到 `show_direction` |
| `daoyou_Hello01` | 双手抬起打招呼 | 映射到 `warm_up`，仅作为互动引导 |
| `Bow` | 可见鞠躬动作 | 记录在已验证能力目录 |
| `Surprise` | 可见惊讶动作 | 记录在已验证能力目录 |
| `daoyou_ClapHands02` | 可见拍手动作 | 记录在已验证能力目录 |

初始 HealthCompanion Registry 有 5 个业务 key，但只有 **4 个唯一的非空 semantic**，因为 `acknowledge` 与 `confirm` 都映射到已验证的 `Nod`。`fallback` 的 semantic 为 `null`，不会发送虚构 KA。额外的 `Bow`、`Surprise` 和 `daoyou_ClapHands02` 记录在能力目录中，没有强行塞进初始业务映射。

## 能力边界

当前账号已验证的动作可用于确认、鼓励、方向指示、打招呼和一般互动。尚未通过视觉验证真正的肩部伸展或健身示范 KA。特别是，`daoyou_Hello01` 是打招呼动作，可作为热身环节的互动引导，不能描述成运动示范。视觉共练所需的真实示范动作能力目前仍是**未确认 / 不足**。

Milestone 1 的动作发现与 Registry 范围已完成；这不代表账号已具备经过验证的运动示范动作。

## 非阻塞已知问题

以下观察没有阻止这 7 个 KA 动画实际呈现，但仍是待处理的运行时或可观测性问题：

- Provider 的 `onMessage` 对非 `Error` 对象调用 `String(message)`，因此 UI 可能显示 `[object Object]`，而不是可读的错误详情。
- 浏览器控制台报告 WebSocket 在成功建立前关闭。
- 浏览器控制台报告涉及已关闭 `VideoFrame` 的 WebGL 警告。

这些告警不能证明相关系统完全正常。本次将它们单独记录，没有用它们推断 KA 是否可见执行。

## Milestone 1 验收清单

- [x] 使用当前 App ID 获取真实 KA 列表：返回 94 个动作。
- [x] 展示动作总数。
- [x] 展示 semantic、名称和类型。
- [x] 当 KA 有图片或视频资源时支持预览；本账号此次没有预览资源。
- [x] 点击动作并确认数字人实际呈现对应动画。
- [x] 记录至少 5 个可用于 HealthCompanion 的真实动作：7 个互不相同的 semantic 已视觉确认，其中 4 个进入初始 Registry，另 3 个作为一般互动能力单独记录。
- [x] 建立 HealthCompanion Action Registry，包含 4 个唯一映射 semantic。
- [x] 所有非空 Registry semantic 均已视觉验证；回退项使用 `null`。
- [x] 记录运动示范能力未确认，同时说明鼓励、确认等能力已验证。
- [x] 记录当前账号能力边界和非阻塞已知问题。

## 最终自动化验证

在 `yhzk-demo-h5/` 目录执行：

- `npm run test:xmov-action-lab`：**6 个 spec、26 个测试全部通过**。
- `npm run build`：**通过**；Vite 生成生产构建及 `dist/xmov-action-lab.html`。

真实账号的视觉验收在 Action Lab 中使用 srvctl 管理的 Xmov 凭据完成。本文没有记录凭据或凭据内容。本地录屏位于 `output/playwright/xmov-action-lab/actual-actions.webm`，作为本机验收材料保留，没有提交到仓库。

## 下一阶段

进入 **Milestone 2：Camera → Pose → Xmov Feedback**，先完成一个肩部动作反馈闭环。以上已验证动作目录可作为 Xmov 侧证据；在另一项真实 KA 经视觉验证之前，运动示范能力继续标记为未确认。
