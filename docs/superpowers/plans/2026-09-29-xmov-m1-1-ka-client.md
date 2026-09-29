# Xmov Milestone 1.1 KA Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 NestJS 后端建立一个经过单测验证的 Xmov KA 原始查询客户端，可靠完成官方签名、真实请求和上游错误分类，但暂不暴露 H5 稳定 API、暂不做动作标准化。

**Architecture:** 将签名算法做成纯函数，将 Xmov 官方响应保留为 raw contract，由 `XmovActionsClient` 负责配置读取、Axios 请求、超时和上游错误转换。M1.1 只产出后续 M1.2 可复用的 `fetchRawActions()`；Normalizer、Controller 和 Action Lab 全部留到后续迭代。

**Tech Stack:** NestJS 10, TypeScript 5.3, Axios 1.6, Node `crypto`, Jest 29.

**Spec:** `docs/superpowers/specs/2026-09-29-xmov-action-lab-design.md`

## Global Constraints

- 只实现 M1.1：签名、配置、真实 KA 查询和 raw response contract。
- 官方 KA endpoint 固定为 `GET /user/v1/external/lite_ka_summary`。
- 签名数据固定为空对象 `{}`；签名串为 `lower(apiPath) + lower(method) + sortedCompactJson(data) + appSecret + timestampSeconds`，再做 UTF-8 MD5。
- 请求头必须是 `X-APP-ID`、`X-TOKEN`、`X-TIMESTAMP`。
- 后端配置使用 `XMOV_APP_ID`、`XMOV_APP_SECRET`，可选 `XMOV_API_BASE_URL`；默认 host 为 `https://nebula-agent.xingyun3d.com`。
- 不创建 `/api/v1/xmov/actions` Controller；该稳定接口属于 M1.2。
- 不创建 normalizer，不提取 semantic，不制造任何 fallback 动作。
- 不修改 H5、`App.tsx`、现有 `XmovAvatarProvider`、LiveTalking fallback。
- 缺少 Xmov 配置不得导致 NestJS 应用启动失败；只有调用 `fetchRawActions()` 时才返回 CONFIG 错误。
- Xmov 官方 HTTP 200 但 `error_code != 0` 视为上游失败，不当作成功数据返回。

## Review Focus

1. **GET + 空对象签名一致性**：请求 body/签名均按 `{}` 处理，避免签名时是 `{}`、实际请求却变成别的 payload。
2. **秒级时间戳**：必须使用 `Math.floor(Date.now() / 1000)`，不能误用毫秒。
3. **HTTP 成功但业务失败**：`error_code != 0` 必须映射为 `UPSTREAM`。
4. **空动作列表**：`error_code=0, data=[]` 或空数据集合是合法 raw 响应，M1.1 不伪造动作。
5. **配置缺失与超时可区分**：CONFIG、TIMEOUT、UPSTREAM、PROTOCOL 四类错误必须可以通过 `code` 稳定判断。

---

### Task 1: Xmov signing contract

**Files:**
- Create: `yhzk-mvp-backend/src/modules/xmov-actions/xmov-actions.signature.ts`
- Create: `yhzk-mvp-backend/src/modules/xmov-actions/xmov-actions.signature.spec.ts`

**Interfaces:**
- Consumes: Node `crypto.createHash`.
- Produces:
  - `XMOV_KA_SUMMARY_PATH: '/user/v1/external/lite_ka_summary'`
  - `XmovSignInput { appId: string; appSecret: string; method: 'GET'; apiPath: string; data: Record<string, unknown>; timestamp: number }`
  - `buildXmovAuthHeaders(input: XmovSignInput): Record<'X-APP-ID' | 'X-TOKEN' | 'X-TIMESTAMP', string>`

- [ ] **Step 1: Write the deterministic signature test**

Use this exact fixture:

```ts
const headers = buildXmovAuthHeaders({
  appId: 'app-test',
  appSecret: 'secret-test',
  method: 'GET',
  apiPath: XMOV_KA_SUMMARY_PATH,
  data: {},
  timestamp: 1790690000,
});

expect(headers).toEqual({
  'X-APP-ID': 'app-test',
  'X-TIMESTAMP': '1790690000',
  'X-TOKEN': '3be711ca225b4418d8acf75203dbeab7',
});
```

Also add one test proving object keys are sorted and compact JSON is used before hashing.

- [ ] **Step 2: Run the signature spec and confirm RED**

Run:

```bash
cd yhzk-mvp-backend
npm test -- --runInBand src/modules/xmov-actions/xmov-actions.signature.spec.ts
```

Expected: FAIL because the signature module/functions do not exist.

- [ ] **Step 3: Implement the minimal signature helper**

Implement `buildXmovAuthHeaders()` in `xmov-actions.signature.ts`.

Exact rules:
- lowercase `apiPath`;
- lowercase method;
- stable JSON object key ordering;
- compact JSON without spaces;
- concatenate path + method + JSON + secret + timestamp;
- MD5 UTF-8 to lowercase hex;
- stringify timestamp in the header.

Do not read environment variables in this file.

- [ ] **Step 4: Run the signature spec and confirm GREEN**

Run the same Jest command.

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add yhzk-mvp-backend/src/modules/xmov-actions/xmov-actions.signature.ts \
        yhzk-mvp-backend/src/modules/xmov-actions/xmov-actions.signature.spec.ts
git commit -m "feat(xmov): add KA request signing"
```

---

### Task 2: Raw KA client and typed failures

**Files:**
- Create: `yhzk-mvp-backend/src/modules/xmov-actions/xmov-actions.types.ts`
- Create: `yhzk-mvp-backend/src/modules/xmov-actions/xmov-actions.client.ts`
- Create: `yhzk-mvp-backend/src/modules/xmov-actions/xmov-actions.client.spec.ts`

**Interfaces:**
- Consumes:
  - `buildXmovAuthHeaders()`
  - `XMOV_KA_SUMMARY_PATH`
  - NestJS `ConfigService`
  - Axios
- Produces:
  - `XmovKaSummaryRawResponse { error_code: number; error_reason?: string; data: unknown }`
  - `XmovActionsClientErrorCode = 'CONFIG' | 'TIMEOUT' | 'UPSTREAM' | 'PROTOCOL'`
  - `XmovActionsClientError extends Error { code: XmovActionsClientErrorCode }`
  - `XmovActionsClient.fetchRawActions(): Promise<XmovKaSummaryRawResponse>`

- [ ] **Step 1: Write failing client tests for the success path**

Pin `Date.now()` to `1790690000000`.

Mock Axios so the test verifies one request with:

```ts
expect(http.request).toHaveBeenCalledWith(expect.objectContaining({
  method: 'GET',
  url: '/user/v1/external/lite_ka_summary',
  data: {},
  headers: {
    'X-APP-ID': 'app-test',
    'X-TIMESTAMP': '1790690000',
    'X-TOKEN': '3be711ca225b4418d8acf75203dbeab7',
  },
}));
```

Use ConfigService values:
- `XMOV_APP_ID=app-test`
- `XMOV_APP_SECRET=secret-test`
- `XMOV_API_BASE_URL=https://nebula-agent.xingyun3d.com`

Assert `fetchRawActions()` returns the raw object unchanged when `error_code === 0`.

Add a success case for `data: []` and assert it remains an empty array.

- [ ] **Step 2: Run the client spec and confirm RED**

Run:

```bash
cd yhzk-mvp-backend
npm test -- --runInBand src/modules/xmov-actions/xmov-actions.client.spec.ts
```

Expected: FAIL because the client/types do not exist.

- [ ] **Step 3: Define raw response and typed error contracts**

In `xmov-actions.types.ts`, define the four error codes, `XmovActionsClientError`, and the minimal raw response interface.

Do not type action fields yet; raw `data` remains `unknown` until M1.2.

- [ ] **Step 4: Implement the minimal success-path client**

In `xmov-actions.client.ts`:

- create an Axios instance with `baseURL = XMOV_API_BASE_URL ?? 'https://nebula-agent.xingyun3d.com'`;
- use `timeout: 10_000`;
- read `XMOV_APP_ID` and `XMOV_APP_SECRET` inside `fetchRawActions()`, not in a way that throws during application bootstrap;
- compute `timestamp = Math.floor(Date.now() / 1000)`;
- call `buildXmovAuthHeaders(... data: {})`;
- send `GET` to `XMOV_KA_SUMMARY_PATH` with `data: {}`;
- return only a valid raw success response.

- [ ] **Step 5: Add failing tests for CONFIG, TIMEOUT, UPSTREAM and PROTOCOL**

Tests must assert:

- missing `XMOV_APP_ID` → throws `XmovActionsClientError` with `code === 'CONFIG'`, Axios is not called;
- missing `XMOV_APP_SECRET` → same;
- Axios timeout (`code: 'ECONNABORTED'`) → `TIMEOUT`;
- Axios HTTP 502 → `UPSTREAM`;
- HTTP 200 with `{ error_code: 1001, error_reason: 'bad token', data: null }` → `UPSTREAM` and message includes `bad token`;
- empty/undefined HTTP body → `PROTOCOL`;
- object without numeric `error_code` → `PROTOCOL`.

- [ ] **Step 6: Run the failure tests and confirm RED**

Run the client spec.

Expected: the new error cases fail until classification is implemented.

- [ ] **Step 7: Implement error classification**

Implement only the behavior pinned by Step 5.

Rules:
- config check happens before HTTP;
- Axios timeout is `TIMEOUT`;
- Axios response errors are `UPSTREAM`;
- official nonzero `error_code` is `UPSTREAM`;
- malformed/empty successful body is `PROTOCOL`;
- do not catch and re-wrap an existing `XmovActionsClientError` into another code.

- [ ] **Step 8: Run the full client spec and confirm GREEN**

Run:

```bash
npm test -- --runInBand src/modules/xmov-actions/xmov-actions.client.spec.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 2**

```bash
git add yhzk-mvp-backend/src/modules/xmov-actions/xmov-actions.types.ts \
        yhzk-mvp-backend/src/modules/xmov-actions/xmov-actions.client.ts \
        yhzk-mvp-backend/src/modules/xmov-actions/xmov-actions.client.spec.ts
git commit -m "feat(xmov): add raw KA actions client"
```

---

### Task 3: Nest module wiring and configuration contract

**Files:**
- Create: `yhzk-mvp-backend/src/modules/xmov-actions/xmov-actions.module.ts`
- Modify: `yhzk-mvp-backend/src/app.module.ts`
- Modify: `yhzk-mvp-backend/.env.example`
- Test: existing TypeScript/Nest build plus M1.1 specs

**Interfaces:**
- Consumes: `XmovActionsClient`.
- Produces: `XmovActionsModule` exporting `XmovActionsClient` for M1.2.

- [ ] **Step 1: Create the module**

`XmovActionsModule` must:
- import `ConfigModule`;
- provide `XmovActionsClient`;
- export `XmovActionsClient`;
- expose no Controller in M1.1.

- [ ] **Step 2: Register the module without introducing startup-time credential requirements**

Add `XmovActionsModule` to `AppModule.imports`.

This is allowed only because missing Xmov credentials are checked lazily when `fetchRawActions()` is called.

- [ ] **Step 3: Document backend configuration**

Append to `yhzk-mvp-backend/.env.example`:

```env
# XmovAvatar / 魔珐星云
XMOV_APP_ID=your_xmov_app_id
XMOV_APP_SECRET=your_xmov_app_secret
XMOV_API_BASE_URL=https://nebula-agent.xingyun3d.com
```

Do not add real credentials.

- [ ] **Step 4: Run all M1.1 tests**

Run:

```bash
cd yhzk-mvp-backend
npm test -- --runInBand src/modules/xmov-actions
```

Expected: all Xmov M1.1 specs PASS.

- [ ] **Step 5: Run the backend build**

Run:

```bash
npm run build
```

Expected: Nest/TypeScript build exits 0.

- [ ] **Step 6: Verify no stable API or normalizer leaked into M1.1**

Check the M1.1 diff and assert:
- no `xmov-actions.controller.ts`;
- no `xmov-actions.normalizer.ts`;
- no H5 files changed;
- no real Xmov credentials committed.

- [ ] **Step 7: Commit Task 3**

```bash
git add yhzk-mvp-backend/src/modules/xmov-actions/xmov-actions.module.ts \
        yhzk-mvp-backend/src/app.module.ts \
        yhzk-mvp-backend/.env.example
git commit -m "feat(xmov): wire KA client module"
```

---

## M1.1 Completion Check

M1.1 is complete only when all of the following are true:

- deterministic official-signature test passes;
- raw KA client success and empty-list tests pass;
- CONFIG/TIMEOUT/UPSTREAM/PROTOCOL tests pass;
- backend build passes;
- module can exist with missing Xmov credentials until the client is actually called;
- no H5 stable API, normalizer, semantic extraction, Action Registry, or UI has been implemented early.

The next iteration is **M1.2 — Action Normalizer + Stable API**.
