# Xmov Milestone 1.4 Preview + Real Playback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Xmov Action Lab 显示真实 KA 的图片/视频预览，并把用户点击的真实 `semantic` 通过官方 KA SSML 格式交给当前 XmovAvatar 实例执行。

**Architecture:** 新增纯函数负责生成官方 KA SSML；`XmovAvatarProvider.playAction()` 是唯一直接调用 LiteSDK `speak()` 的动作播放原语；现有 `xmovAvatar` bridge 暴露 readiness-aware 的 `playAction()` 给 Action Lab。页面继续消费 M1.2 的真实动作清单，展示 `imageUrl/movieUrl`，并通过 bridge 执行选中的真实 semantic。

**Tech Stack:** React 18, TypeScript 5.3, Vite 5.4, Vitest 2.1.9, XmovAvatar JS LiteSDK.

**Spec:** `docs/superpowers/specs/2026-09-29-xmov-action-lab-design.md`

**Official references:**
- `https://xingyun3d.com/developers/52-192` — KA query + full name → last semantic segment.
- `https://xingyun3d.com/developers/52-183` — JS SDK `speak()` + `<ue4event><type>ka</type>...` KA instruction.

## Global Constraints

- 只实现 M1.4：预览 + 真实 KA 试播。
- 只能执行 M1.2 从真实账号接口返回的 `XmovAction.semantic`；不新增硬编码/虚构 KA 名称。
- 官方技能 KA SSML 固定使用：
  `<ue4event><type>ka</type><data><action_semantic>...</action_semantic></data></ue4event>`。
- Action Lab 试播不使用 Task 3 的 `xmov_action` extra hint；M1.4 使用官方已确认的 SSML KA 指令。
- `XmovAvatarProvider.playAction()` 必须直接调用底层 SDK `speak(ssml, true, true, extra)`，避免被 Expression Planner 改写。
- semantic 必须 trim、不能为空，并进行 XML 文本转义。
- Action Lab 页面复用现有 `XmovAvatarPlayer`，不创建第二套 SDK 初始化实现。
- `xmovAvatar.playAction()` 在 provider 未 ready 时明确 reject，不静默成功。
- 图片预览仅在 `imageUrl` 存在时渲染；视频预览仅在 `movieUrl` 存在时渲染。
- 视频不得 autoplay；使用用户主动 controls。
- M1.4 不创建 Action Registry、不做业务语义映射、不接 LangGraph、不修改 backend。
- SDK Promise resolve 只表示“KA 指令已成功提交给 SDK”；视觉效果是否符合预期仍需真实账号人工确认，并在 M1.6 记录。

## Review Focus

1. **SSML 注入/坏 semantic**：空 semantic 必须拒绝；XML 特殊字符必须转义，不能破坏 `ue4event`。
2. **未初始化/未 ready**：Action Lab 点击执行时必须显示失败，不能把 no-op 当成功。
3. **重复快速点击**：同一时间只允许一个 Action Lab 试播，按钮在执行中禁用。
4. **无预览资源**：动作仍可执行且正常显示元数据，不因为缺图/缺视频消失。
5. **预览资源安全行为**：视频必须 controls + preload metadata、不得 autoplay；图片使用 lazy loading。

---

### Task 1: Official KA playback primitive

**Files:**
- Create: `yhzk-demo-h5/src/avatar/xmovKa.ts`
- Create: `yhzk-demo-h5/src/avatar/xmovKa.spec.ts`
- Modify: `yhzk-demo-h5/src/avatar/XmovAvatarProvider.ts`
- Create: `yhzk-demo-h5/src/avatar/XmovAvatarProvider.playAction.spec.ts`
- Modify: `yhzk-demo-h5/package.json`

**Interfaces:**
- Produces:
  - `buildXmovKaSsml(semantic: string): string`
  - `XmovAvatarProvider.playAction(semantic: string, clientSpeakId?: string): Promise<void>`

- [ ] **Step 1: Write failing SSML builder tests**

Pin:
- `PointingSelf` produces a `<speak>...` document containing exactly `<type>ka</type>` and `<action_semantic>PointingSelf</action_semantic>`;
- surrounding whitespace is trimmed;
- `A&B<1>` is XML-escaped inside `action_semantic`;
- blank/whitespace semantic throws with a message containing `semantic`.

- [ ] **Step 2: Run builder spec and confirm RED**

Expected: FAIL because `xmovKa.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure SSML builder**

No React, SDK, ConfigService or business mapping.

- [ ] **Step 4: Run builder spec and confirm GREEN**

Expected: all builder tests PASS.

- [ ] **Step 5: Write failing provider playback tests**

Create a provider, inject a fake `XmovAvatarInstance` into its private runtime field only from the test, and assert:

```ts
await provider.playAction('PointingSelf', 'lab-test');
```

calls SDK `speak` exactly once with:
- SSML from `buildXmovKaSsml('PointingSelf')`;
- `true`;
- `true`;
- `{ client_speak_id: 'lab-test' }`.

Also assert provider without an initialized instance rejects with the existing `XmovAvatar has not been initialized` error.

- [ ] **Step 6: Run provider playback spec and confirm RED**

Expected: FAIL because `playAction` does not exist.

- [ ] **Step 7: Implement `XmovAvatarProvider.playAction()`**

Rules:
- `requireInstance()`;
- validate/build SSML via `buildXmovKaSsml`;
- set provider state to `speaking`;
- call bottom SDK `speak(ssml, true, true, { client_speak_id })`;
- default speak id: `xmov_ka_${Date.now()}`;
- do not call `renderSsml()` and do not attach Expression Planner action hints.

- [ ] **Step 8: Expand Action Lab test script and verify Task 1 GREEN**

`test:xmov-action-lab` must include:
- `xmovActions.spec.ts`
- `XmovActionLabPage.spec.tsx`
- `xmovKa.spec.ts`
- `XmovAvatarProvider.playAction.spec.ts`

Run it and expect all tests PASS.

- [ ] **Step 9: Commit Task 1**

Commit message: `feat(xmov): add official KA playback primitive`.

---

### Task 2: Bridge readiness + Action Lab playback command

**Files:**
- Modify: `yhzk-demo-h5/src/services/xmovAvatar.ts`
- Create: `yhzk-demo-h5/src/services/xmovAvatar.playAction.spec.ts`

**Interfaces:**
- Consumes: `XmovAvatarProvider.playAction(semantic): Promise<void>`.
- Produces: `xmovAvatar.playAction(semantic: string): Promise<void>`.

- [ ] **Step 1: Write failing bridge tests**

Use a fake provider with `playAction = vi.fn()`.

Pin:
- after `attach(provider)` + `markReady(provider)`, `await xmovAvatar.playAction('PointingSelf')` calls provider exactly once with `PointingSelf`;
- attached but not marked ready → rejects with message containing `not ready`, provider method not called;
- detached/no provider → same rejection;
- provider rejection propagates to caller so Action Lab can show a real error;
- cleanup detaches provider after every test.

- [ ] **Step 2: Run bridge spec and confirm RED**

Expected: FAIL because bridge has no public `playAction`.

- [ ] **Step 3: Implement minimal bridge `playAction`**

No queue, no round mutation, no error swallowing:
- capture current provider;
- require provider + ready;
- `await provider.playAction(semantic)`.

M1.4 manual Action Lab actions are independent of chat round sequencing.

- [ ] **Step 4: Run bridge + all Action Lab tests and confirm GREEN**

Expected: all tests PASS.

- [ ] **Step 5: Commit Task 2**

Commit message: `feat(xmov): expose KA playback through avatar bridge`.

---

### Task 3: Preview media + actual Action Lab execution UI

**Files:**
- Modify: `yhzk-demo-h5/src/components/XmovActionLabPage.tsx`
- Modify: `yhzk-demo-h5/src/components/XmovActionLabPage.spec.tsx`
- Modify: `yhzk-demo-h5/src/xmov-action-lab.scss`

**Interfaces:**
- Consumes:
  - `XmovAction.imageUrl/movieUrl`
  - `xmovAvatar.playAction(semantic)`
  - existing `XmovAvatarPlayer`
- Produces:
  - preview cards;
  - one-click real KA execution;
  - visible playback result state.

Define UI playback state:

```ts
interface ActionPlaybackState {
  semantic: string;
  status: 'running' | 'success' | 'error';
  message: string;
}
```

- [ ] **Step 1: Extend pure view tests and confirm RED**

For a ready action with both preview URLs, static markup must contain:
- one `<img` with `loading="lazy"`;
- one `<video` with `controls` and `preload="metadata"`;
- no `autoplay`;
- button text `执行动作`.

For no preview URLs:
- still renders action metadata + execute button;
- contains `暂无预览资源`.

For `playback.status='running'` on that semantic:
- execute button disabled;
- text contains `执行中`.

For success/error:
- visible text contains respectively `已提交给 Xmov SDK` / supplied error.

- [ ] **Step 2: Implement preview and playback props in pure view**

Extend `XmovActionLabView` props:
- `playback: ActionPlaybackState | null`;
- `onExecuteAction: (semantic: string) => void`.

No SDK calls inside the pure view.

- [ ] **Step 3: Run view spec and confirm GREEN**

Expected: preview + status markup tests PASS.

- [ ] **Step 4: Wire the state-owning page**

The default `XmovActionLabPage` must:
- render `XmovAvatarPlayer` in an Action Lab stage;
- keep one `playback` state;
- ignore a new click while any playback is `running`;
- on execute:
  1. set running;
  2. `await xmovAvatar.playAction(semantic)`;
  3. set success message `已提交给 Xmov SDK，请观察数字人实际动作`;
  4. on rejection, set error with the real message.

Do not hardcode any semantic.

- [ ] **Step 5: Style preview/player/action controls**

Desktop: avatar stage + action list side-by-side when space allows.
Narrow width: stack vertically.

Media requirements:
- image max width 100%, object-fit cover/contain;
- video width 100%;
- execution button and status visually clear.

- [ ] **Step 6: Run all Action Lab tests + frontend build**

Run:
- `npm run test:xmov-action-lab`
- `npm run build`

Expected: all M1.3/M1.4 tests pass and build exits 0.

- [ ] **Step 7: Verify production page output**

Require:
- `dist/xmov-action-lab.html`;
- no `App.tsx` changes;
- no backend changes;
- no Registry/LangGraph changes.

- [ ] **Step 8: Commit Task 3**

Commit message: `feat(xmov): add Action Lab preview and real KA playback`.

---

## M1.4 Completion Check

M1.4 code is complete when:

- official KA SSML is generated deterministically and safely;
- Provider sends it via LiteSDK `speak(..., true, true, ...)`;
- bridge rejects when avatar is not ready and propagates SDK failures;
- Action Lab renders real image/video previews when available;
- Action Lab embeds the existing XmovAvatar player;
- execute buttons use the selected real `XmovAction.semantic`, never invented names;
- one action at a time can be submitted;
- success/error is visible;
- all Action Lab tests pass;
- frontend production build passes.

**Manual real-account acceptance completed:** seven distinct semantics were visually confirmed in `/xmov-action-lab.html`. The 94 returned KA entries had no image/video preview resources. Final observations, limitations, and known issues are recorded in [M1.6 Final Verification](../specs/2026-09-30-xmov-m1-6-final-verification.md). SDK promise resolution was not treated as proof of the visible animation.

M1.5 Action Registry is complete and M1.6 has formally closed Milestone 1. The next milestone is **M2 — Camera → Pose → Xmov Feedback**, beginning with one shoulder movement loop.
