# Xmov Milestone 1.2 Action Normalizer + Stable API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 M1.1 获取到的 Xmov KA 原始响应转换为稳定的 `XmovAction[]`，并通过 `GET /api/v1/xmov/actions` 暴露给后续 Action Lab 使用。

**Architecture:** `XmovActionsClient` 继续只负责官方协议；新增纯函数 Normalizer 负责 raw payload → 内部动作模型；`XmovActionsService` 组合 client + normalizer；Controller 只返回 `{ actions }`。H5、动作试播和 Action Registry 仍不在本迭代范围内。

**Tech Stack:** NestJS 10, TypeScript 5.3, Jest 29, existing Xmov M1.1 client.

**Spec:** `docs/superpowers/specs/2026-09-29-xmov-action-lab-design.md`

## Global Constraints

- 只实现 M1.2：Action Normalizer + stable read API。
- 复用 M1.1 的 `XmovActionsClient.fetchRawActions()`，不重复实现签名或官方 HTTP 请求。
- 稳定接口固定为 `GET /api/v1/xmov/actions`。
- Controller 返回 `{ actions: XmovAction[] }`；全局 `ResponseInterceptor` 负责外层 `{ code, message, data, requestId }` 包装。
- `XmovAction` 字段固定为 `semantic / name / cnName / type / imageUrl? / movieUrl? / rawName?`。
- `semantic` 取官方 `name` 最后一个 `__` 分段；例如 `M_CN03_show03__PointingSelf -> PointingSelf`。
- `name` 使用提取后的可读英文动作名（与 `semantic` 相同）；`rawName` 保留官方完整 `name`。
- `cn_name` 缺失时 `cnName = ''`；`ka_type` 缺失时 `type = 'unknown'`。
- 空字符串/缺失的 `render_image_oss`、`render_movie_oss` 不生成 URL 字段。
- `data=[]` 合法返回 `{ actions: [] }`，绝不生成示例/fallback 动作。
- Normalizer 只接受当前有证据的最小 payload 形态：动作数组，或单个包含有效 `name` 的动作对象；不猜测 `list/items/ka_list` 等未证实包装字段。
- 无法提取有效动作名/semantic 时抛出可诊断 `XmovActionsNormalizationError`，不静默跳过、不伪造 semantic。
- 不修改 H5、不新增 `xmov-action-lab.html`、不做预览/试播、不创建 Action Registry、不接 LangGraph。

## Review Focus

1. **官方完整名称到 semantic**：最后一个 `__` 段必须稳定提取，前缀不进入业务 semantic。
2. **最小字段缺失**：中文名、类型、预览资源缺失必须有明确 fallback，不能出现字符串 `"undefined"`。
3. **坏动作不能污染清单**：空 `name`、末尾为 `__`、非对象条目必须明确报 normalization error。
4. **空动作清单**：`data=[]` 必须返回空数组，service/controller 不注入 fallback。
5. **稳定 API 边界**：Controller 不能泄露 `error_code/error_reason` 或 raw payload，只返回内部动作模型。

---

### Task 1: Internal action model and pure normalizer

**Files:**
- Modify: `yhzk-mvp-backend/src/modules/xmov-actions/xmov-actions.types.ts`
- Create: `yhzk-mvp-backend/src/modules/xmov-actions/xmov-actions.normalizer.ts`
- Create: `yhzk-mvp-backend/src/modules/xmov-actions/xmov-actions.normalizer.spec.ts`

**Interfaces:**
- Consumes: `XmovKaSummaryRawResponse`.
- Produces:
  - `XmovAction`
  - `XmovActionsNormalizationError extends Error`
  - `normalizeXmovActions(raw: XmovKaSummaryRawResponse): XmovAction[]`

- [ ] **Step 1: Write the failing complete-action fixture test**

Use this exact raw fixture:

```ts
const raw = {
  error_code: 0,
  error_reason: '',
  data: [{
    name: 'M_CN03_show03__PointingSelf',
    cn_name: '指向自己',
    ka_type: 'body_action',
    render_image_oss: 'https://example.test/pointing.png',
    render_movie_oss: 'https://example.test/pointing.mp4',
  }],
};
```

Assert:

```ts
expect(normalizeXmovActions(raw)).toEqual([{
  semantic: 'PointingSelf',
  name: 'PointingSelf',
  cnName: '指向自己',
  type: 'body_action',
  imageUrl: 'https://example.test/pointing.png',
  movieUrl: 'https://example.test/pointing.mp4',
  rawName: 'M_CN03_show03__PointingSelf',
}]);
```

- [ ] **Step 2: Add failing fallback-shape tests**

Pin all of these:

- `data: []` → `[]`.
- single action object in `data` → one normalized action.
- `name: 'Welcome'` → semantic/name `Welcome`.
- missing `cn_name` → `cnName: ''`.
- missing `ka_type` → `type: 'unknown'`.
- empty preview strings → omit `imageUrl/movieUrl`.

- [ ] **Step 3: Run normalizer spec and confirm RED**

Run:

```bash
cd yhzk-mvp-backend
npx jest src/modules/xmov-actions/xmov-actions.normalizer.spec.ts \
  --runInBand \
  --config='{"moduleFileExtensions":["js","json","ts"],"rootDir":".","testRegex":".*\\.spec\\.ts$","transform":{"^.+\\.(t|j)s$":"ts-jest"},"testEnvironment":"node"}'
```

Expected: FAIL because normalizer/model do not exist.

- [ ] **Step 4: Define `XmovAction` in `xmov-actions.types.ts`**

Exact interface:

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

Do not add registry/business-key fields yet.

- [ ] **Step 5: Implement the minimal pure normalizer**

Implement:

```ts
normalizeXmovActions(raw: XmovKaSummaryRawResponse): XmovAction[]
```

Rules are exactly those in Global Constraints; do not perform HTTP or ConfigService access here.

- [ ] **Step 6: Add failing malformed-action tests**

Tests must reject with `XmovActionsNormalizationError` for:

- `data: null`;
- `data: ['not-an-object']`;
- action `name: ''`;
- action `name: 'prefix__'`;
- object payload without `name`.

Error message must include the item index for array payloads when applicable.

- [ ] **Step 7: Implement only the malformed-input diagnostics**

No silent filtering. If one entry is malformed, the normalization call fails with a diagnostic error.

- [ ] **Step 8: Run normalizer spec and confirm GREEN**

Expected: all normalizer tests PASS.

- [ ] **Step 9: Commit Task 1**

```bash
git add yhzk-mvp-backend/src/modules/xmov-actions/xmov-actions.types.ts \
        yhzk-mvp-backend/src/modules/xmov-actions/xmov-actions.normalizer.ts \
        yhzk-mvp-backend/src/modules/xmov-actions/xmov-actions.normalizer.spec.ts
git commit -m "feat(xmov): normalize KA action metadata"
```

---

### Task 2: Service boundary

**Files:**
- Create: `yhzk-mvp-backend/src/modules/xmov-actions/xmov-actions.service.ts`
- Create: `yhzk-mvp-backend/src/modules/xmov-actions/xmov-actions.service.spec.ts`
- Modify: `yhzk-mvp-backend/src/modules/xmov-actions/xmov-actions.module.ts`

**Interfaces:**
- Consumes:
  - `XmovActionsClient.fetchRawActions(): Promise<XmovKaSummaryRawResponse>`
  - `normalizeXmovActions(raw): XmovAction[]`
- Produces:
  - `XmovActionsService.listActions(): Promise<{ actions: XmovAction[] }>`

- [ ] **Step 1: Write failing service tests**

Mock only the client.

Test A:
- client returns two raw actions;
- service returns `{ actions: [normalized...] }`;
- client called exactly once.

Test B:
- client returns `{ error_code: 0, data: [] }`;
- service returns exactly `{ actions: [] }`.

Test C:
- client rejects with `XmovActionsClientError('UPSTREAM', ...)`;
- service rejects with the same error instance; it must not rewrite client failure classes.

- [ ] **Step 2: Run service spec and confirm RED**

Expected: FAIL because service does not exist.

- [ ] **Step 3: Implement `XmovActionsService`**

The body should only:
1. await `client.fetchRawActions()`;
2. normalize;
3. return `{ actions }`.

No caching, database persistence, registry mapping, or fallback generation in M1.2.

- [ ] **Step 4: Register/export service in `XmovActionsModule`**

Module must provide/export both:
- `XmovActionsClient`;
- `XmovActionsService`.

- [ ] **Step 5: Run service + existing Xmov specs and confirm GREEN**

Run all `src/modules/xmov-actions` specs.

- [ ] **Step 6: Commit Task 2**

```bash
git add yhzk-mvp-backend/src/modules/xmov-actions/xmov-actions.service.ts \
        yhzk-mvp-backend/src/modules/xmov-actions/xmov-actions.service.spec.ts \
        yhzk-mvp-backend/src/modules/xmov-actions/xmov-actions.module.ts
git commit -m "feat(xmov): add normalized KA actions service"
```

---

### Task 3: Stable GET /api/v1/xmov/actions endpoint

**Files:**
- Create: `yhzk-mvp-backend/src/modules/xmov-actions/xmov-actions.controller.ts`
- Create: `yhzk-mvp-backend/src/modules/xmov-actions/xmov-actions.controller.spec.ts`
- Modify: `yhzk-mvp-backend/src/modules/xmov-actions/xmov-actions.module.ts`
- Modify: `yhzk-mvp-backend/src/modules/xmov-actions/xmov-actions.module.spec.ts`

**Interfaces:**
- Consumes: `XmovActionsService.listActions()`.
- Produces: controller route `GET /api/v1/xmov/actions`.

- [ ] **Step 1: Write failing controller contract test**

Instantiate controller with a mocked service returning:

```ts
{
  actions: [{
    semantic: 'PointingSelf',
    name: 'PointingSelf',
    cnName: '指向自己',
    type: 'body_action',
    rawName: 'M_CN03_show03__PointingSelf',
  }],
}
```

Assert controller returns exactly that stable object and does not add `error_code/error_reason`.

- [ ] **Step 2: Write failing route/module metadata tests**

Assert:

- class controller path metadata is `xmov`;
- method GET path metadata is `actions`;
- `XmovActionsModule` registers `XmovActionsController`;
- existing AppModule registration test still passes.

- [ ] **Step 3: Run controller/module specs and confirm RED**

Expected: FAIL because controller is absent/unregistered.

- [ ] **Step 4: Implement thin `XmovActionsController`**

Use:

```ts
@Controller('xmov')
export class XmovActionsController {
  constructor(private readonly actions: XmovActionsService) {}

  @Get('actions')
  listActions() {
    return this.actions.listActions();
  }
}
```

No direct client access and no normalization in Controller.

- [ ] **Step 5: Register controller in `XmovActionsModule`**

Do not create any H5 code.

- [ ] **Step 6: Run all Xmov M1.1 + M1.2 specs**

Run:

```bash
npx jest src/modules/xmov-actions \
  --runInBand \
  --config='{"moduleFileExtensions":["js","json","ts"],"rootDir":".","testRegex":".*\\.spec\\.ts$","transform":{"^.+\\.(t|j)s$":"ts-jest"},"testEnvironment":"node"}'
```

Expected: all Xmov suites PASS.

- [ ] **Step 7: Run backend build**

```bash
npm run build
```

Expected: exit 0.

- [ ] **Step 8: Scope verification**

Diff must show:
- normalizer/service/controller + tests;
- no H5 changes;
- no Action Registry;
- no preview/playback;
- no LangGraph changes;
- no real credentials.

- [ ] **Step 9: Commit Task 3**

```bash
git add yhzk-mvp-backend/src/modules/xmov-actions
git commit -m "feat(xmov): expose normalized KA actions API"
```

---

## M1.2 Completion Check

M1.2 is complete only when:

- raw official action names normalize deterministically to stable `XmovAction` records;
- malformed payloads fail diagnostically instead of producing invented actions;
- empty upstream list remains empty;
- `XmovActionsService` preserves M1.1 client error semantics;
- `GET /api/v1/xmov/actions` exposes only normalized data;
- all Xmov M1.1 + M1.2 tests pass;
- backend build passes;
- no M1.3+ frontend, playback, Registry, or Tool Calling work is implemented early.

Repository-wide pre-existing failures in unrelated AdminUser/AvatarAdmin tests are tracked as baseline state and are not part of M1.2 unless this branch changes those modules.
