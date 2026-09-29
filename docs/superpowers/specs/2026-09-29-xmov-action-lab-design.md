# Xmov Action Lab / Milestone 1 Design

> Date: 2026-09-29  
> Repository: `wulisususu/HealthCompanion`  
> Branch: `feat/xmov-m1-action-lab`

## 1. Goal

Milestone 1 的目标不是一次性完成整个具身训练能力，而是先把 XmovAvatar 的真实 KA 动作能力摸清，并形成后续 Milestone 2/3 可以稳定复用的动作数据入口与 Action Registry。

本里程碑完成后，系统应能够：

1. 从当前比赛 App ID 对应的官方接口读取真实 KA 列表；
2. 将官方返回转换为仓库内部稳定的数据模型；
3. 在独立 Xmov Action Lab 页面中查看动作、预览动作资源；
4. 对真实动作进行试播验证；
5. 从验证通过的真实动作中生成 HealthCompanion Action Registry；
6. 让业务语义与具体 KA semantic 解耦，不再依赖未验证动作名。

本设计不包含 Camera / Pose、LangGraph Tool Calling、完整健身流程、Android 迁移或环境 VLM。这些属于后续里程碑。

## 2. Current State

仓库当前已完成 XmovAvatar Task 1～3：

- Task 1：初始化、idle、listen、think、speak、interrupt、interactive idle；
- Task 2：SSE 流式回答驱动 XmovAvatar；
- Task 3：`intent + emotion -> Expression Planner`，并通过 SSML / extra 传递表达提示。

当前缺口是：仓库并不知道比赛账号下真实存在多少 KA、它们的实际 semantic 是什么、哪些可以用于健康陪伴、哪些能够真实执行。

因此 Milestone 1 的第一原则是：

> 先验证真实能力，再让业务依赖它。

## 3. Architecture Decision

采用：

```text
Xmov official KA API
        ↓
NestJS Xmov Actions Client
        ↓
normalized XmovAction[]
        ↓
/api/v1/xmov/actions
        ↓
Xmov Action Lab
        ↓
manual verification
        ↓
Action Registry
        ↓
Milestone 2 / Milestone 3
```

### Why backend-first

KA 列表查询和签名逻辑放在 `yhzk-mvp-backend`，而不是 H5 直接调用官方接口。

原因：

- 签名与上游协议集中在服务端；
- H5 只消费稳定的内部模型；
- 后续 LangGraph Tool Calling 可以复用同一动作目录；
- 官方字段变化时只需调整 adapter；
- 避免在多个前端入口重复实现签名、请求和兼容逻辑。

Action Lab 仍作为独立 H5 开发入口，不改主应用对话流程。

## 4. Internal Data Model

内部统一动作模型：

```ts
export interface XmovAction {
  semantic: string;
  name: string;
  cnName: string;
  type: string;
  imageUrl?: string;
  movieUrl?: string;
  rawName?: string;
}
```

约束：

- `semantic` 是业务真正用于动作触发与 Registry 的稳定标识；
- `name` 为可读英文/官方名称；
- `cnName` 为中文展示名，缺失时可为空字符串；
- `type` 保留官方分类，未知时使用 `unknown`；
- 图片、视频没有时不伪造；
- `rawName` 可保留官方原始动作名，便于调试 semantic 提取。

标准化代码必须独立于 HTTP client，可单测。

## 5. Iteration Breakdown

Milestone 1 分六次完成，每次都能单独验收。

### M1.1 — KA Client

目标：只解决“能否可靠调用真实 KA API”，不提前定义 H5 稳定数据契约。

范围：

- 新增 Xmov Actions client 与上游 raw 类型；
- 实现官方请求签名；
- 调用真实 KA 列表接口；
- 返回原始响应给后续 service/normalizer 使用；
- 单测固定时间戳下的签名与请求头；
- 单测成功、上游非 2xx、超时、空响应；
- 缺少必要配置时给出明确错误。

M1.1 不新增 Action Lab UI，也不暴露给 H5 的正式 `/api/v1/xmov/actions` 稳定接口。

### M1.2 — Action Normalizer + Stable API

目标：把官方字段变成稳定内部模型，并在这一轮第一次确定前端可依赖的接口契约。

范围：

- 标准化 `semantic / name / cnName / type / imageUrl / movieUrl`；
- 对官方命名中的前缀/后缀进行确定性 semantic 提取；
- 保留 `rawName`；
- 对缺字段和未知类型做可预测 fallback；
- 使用 fixture 测试真实/近真实样例；
- service 组合 client + normalizer；
- 暴露内部只读接口 `GET /api/v1/xmov/actions`；
- 接口只返回标准化 `XmovAction[]`，不向 H5 暴露官方 raw payload；
- 空动作列表返回 `{ "actions": [] }`，不制造 fallback 动作。

完成后 H5 仍可以没有页面。

### M1.3 — Xmov Action Lab Page

目标：建立只读动作实验页。

新增独立入口：

```text
/xmov-action-lab.html
```

页面只包含：

- 加载状态；
- 动作总数；
- 动作列表；
- semantic；
- 中英文名称；
- 类型；
- API 错误状态。

不改 `App.tsx`，不影响生产入口。

### M1.4 — Preview + Real Playback

目标：从“看到动作列表”升级为“验证动作真的能用”。

范围：

- 有 `imageUrl` 时显示图片；
- 有 `movieUrl` 时提供视频预览；
- 复用现有 `XmovAvatarProvider`；
- 用官方支持的 KA 触发格式试播指定 semantic；
- 明确记录成功 / 失败 / 无法验证；
- 不新增假想本地骨骼 API。

### M1.5 — Action Registry

目标：建立业务语义与真实 KA 的映射。

初始业务语义候选：

```text
acknowledge
encourage
show_direction
warm_up
confirm
fallback
```

Registry 只允许引用已经从真实列表中发现并人工验证过的 semantic。

示例：

```ts
type HealthActionKey =
  | 'acknowledge'
  | 'encourage'
  | 'show_direction'
  | 'warm_up'
  | 'confirm'
  | 'fallback';

interface ActionRegistryEntry {
  businessKey: HealthActionKey;
  semantic: string | null;
  verified: boolean;
  note?: string;
}
```

如果没有匹配 KA：

- `semantic = null`；
- 走 speech / idle 等 fallback；
- 不虚构动作。

### M1.6 — Final Verification

Milestone 1 PASS 需要满足：

- 能从当前 App ID 获取真实 KA 列表；
- 页面能展示动作总数；
- 能看到 semantic / 名称 / 类型；
- 有预览资源时可以查看；
- 可以点击动作让当前数字人真实执行；
- 至少记录 5 个适用于 HealthCompanion 的真实动作；若账号真实可用动作不足 5 个，则记录实际数量并明确上游限制，不伪造；
- 生成 Action Registry；
- Registry 中没有未验证 semantic；
- 明确视觉共练是否存在可用于示范/鼓励/确认的动作；
- 文档记录当前比赛账号的真实能力边界。

## 6. Backend Components

建议新增：

```text
yhzk-mvp-backend/src/modules/xmov-actions/
├── xmov-actions.module.ts
├── xmov-actions.controller.ts
├── xmov-actions.service.ts
├── xmov-actions.client.ts
├── xmov-actions.types.ts
├── xmov-actions.normalizer.ts
├── xmov-actions.client.spec.ts
└── xmov-actions.normalizer.spec.ts
```

职责：

- `client`：只负责官方 HTTP 请求、签名、超时和协议错误；
- `normalizer`：纯函数，负责官方 payload → `XmovAction[]`；
- `service`：协调 client + normalizer；
- `controller`：只暴露内部只读接口；
- `types`：存放边界类型。

不把签名逻辑塞进 Controller。

## 7. H5 Components

M1.3 开始新增：

```text
yhzk-demo-h5/
├── xmov-action-lab.html
└── src/
    ├── xmov-action-lab.tsx
    ├── xmov-action-lab.scss
    └── avatar/
        ├── actionRegistry.ts
        └── xmovActions.ts
```

其中：

- `xmovActions.ts`：H5 对内部 API 的轻量 client；
- `actionRegistry.ts`：M1.5 才加入，不提前塞假动作；
- Action Lab 是开发页，不改主业务页面。

## 8. Data Flow

### Read flow

```text
Action Lab
  → GET /api/v1/xmov/actions
  → XmovActionsService
  → XmovActionsClient
  → official lite_ka_summary
  → XmovActionsNormalizer
  → XmovAction[]
  → Action Lab
```

### Playback flow

```text
user clicks verified candidate
  → selected XmovAction.semantic
  → existing XmovAvatarProvider
  → official KA trigger format
  → avatar runtime
  → user manually confirms result
```

### Registry flow

```text
real XmovAction[]
  + manual verification
  ↓
Action Registry
  ↓
business action key
  ↓
real semantic or null
```

## 9. Error Handling

### Official API unavailable

内部接口返回明确失败，不返回伪造动作列表。

### Credentials missing

返回配置错误，Action Lab 显示“Xmov credentials unavailable”。

### Empty action list

视为合法结果：

```json
{ "actions": [] }
```

页面显示 0 条，不自动填充示例动作。

### Unknown payload shape

Normalizer 尽量提取已知字段；完全无法识别时让该条进入可诊断错误，而不是静默制造 semantic。

### Preview unavailable

动作仍可显示；Preview UI 标记“无预览资源”。

### Playback failed

只将该动作标记为试播失败，不影响列表中的其他动作。

## 10. Testing Strategy

### M1.1

必须先测试：

- 固定 appId/appSecret/timestamp 时签名结果稳定；
- 请求携带官方要求的身份/时间/签名头；
- 上游非 2xx 转成明确错误；
- 超时可识别；
- 缺少配置时不发起上游请求。

### M1.2

fixture 与接口测试：

- 完整动作；
- 缺中文名；
- 缺预览资源；
- 动作名含官方前缀；
- 无法提取 semantic；
- 空数组；
- service 不伪造 fallback 动作；
- `GET /api/v1/xmov/actions` 只返回标准化字段。

### M1.3+

前端至少验证：

- loading；
- success；
- empty；
- API error；
- 预览资源有/无；
- 选择动作不会改主应用状态。

## 11. Compatibility Constraints

- 保留现有 XmovAvatar Task 1～3；
- 不重写 `XmovAvatarProvider`；
- 不改 `App.tsx` 主聊天链路；
- 不删除 LiveTalking fallback；
- 不把 M1 变成 Camera / Pose 项目；
- 不提前把 Action Registry 接入 LangGraph；
- 不假设存在任意骨骼控制；
- 不把文档候选动作名当成真实 KA。

## 12. Completion Boundary

Milestone 1 完成时，项目仍然不需要理解用户姿态。

它只需要可靠回答两个问题：

1. 当前比赛账号的数字人实际拥有哪些动作？
2. HealthCompanion 业务需要动作时，应该映射到哪个已经验证的真实 semantic？

当这两个问题可以稳定回答后，Milestone 2 才开始 Camera → Pose → Xmov Feedback。
