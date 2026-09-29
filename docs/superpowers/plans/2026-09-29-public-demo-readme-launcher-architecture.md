# HealthCompanion Public Demo, README, Launcher, and Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an isolated anonymous text-chat Demo build, a Windows one-command local launcher, accurate Chinese project documentation, and a current architecture diagram; publish an online URL only after HTTPS and end-to-end checks pass.

**Architecture:** Add a Vite `demo` mode that has its own env directory, creates a per-tab demo identity, bypasses login/onboarding without touching production entry behavior, and never connects LiveTalking. A Node launcher invoked by PowerShell starts the existing H5, NestJS SQLite mode, and FastAPI services, while the README and Mermaid diagram explain actual capabilities and deployment gates.

**Tech Stack:** React 18, Vite 5, TypeScript, Node.js 24, NestJS 10, Python 3.11, FastAPI, SQLite, PowerShell, Node built-in test runner, Mermaid.

**Spec:** `docs/superpowers/specs/2026-09-29-public-demo-readme-launcher-architecture-design.md`

## Global Constraints

- Develop only in this repository; do not inspect or edit unrelated local directories.
- Keep production `production` mode login and onboarding behavior unchanged.
- Demo runs on H5 `127.0.0.1:5273`, NestJS `127.0.0.1:3000`, and AI service `127.0.0.1:8000`.
- Use `DB_LIGHTWEIGHT=true`, `AI_BACKEND=python`, `AI_SERVICE_URL=http://127.0.0.1:8000`; local database is SQLite.
- Demo mode must use a random `demo_` token per browser tab, ignore any stored production token, and must not call LiveTalking/TTS.
- For a reverse-proxied public Demo, NestJS may trust exactly one proxy hop only when explicitly configured; Nginx must replace `X-Forwarded-For` with `$remote_addr` so clients cannot spoof the rate-limit IP.
- Never place Xmov credentials in source, documentation, or browser output; isolate Vite Demo env loading and remove inherited `VITE_XMOV_*` variables from Demo child processes.
- Public chat content is persisted by the backend and sent to the configured AI/LLM service; warn visitors not to enter real personal or health information.
- README must not label the candidate URL as online until publicly trusted HTTPS, TCP 443 reachability, same-origin API, and text chat have all been verified. Do not change the cloud security group or overwrite an unidentified TLS service.
- Keep RAG/citations conditional on `RAG_ENABLED=true` and a configured, populated Milvus instance. LiveTalking, TTS, SRS, and model weights remain external requirements for the authenticated production avatar path.

## Review Focus

- Existing browser auth/profile data is present when opening the Demo build — Demo uses a demo-scoped storage key and never selects the real user's profile. Pin in Task 1 tests.
- Browser `sessionStorage` is unavailable or corrupt — Demo keeps a stable in-memory identity for the page lifetime and never falls back to a shared constant. Pin in Task 1 tests.
- Parent environment contains Xmov Secret or selects Xmov — Demo child/build environment strips the credentials and forces the static fallback. Pin in Task 2 tests and scan the built assets.
- A required port is already occupied or one service fails during startup — launcher exits with a clear message and leaves the existing listener untouched; on a clean launch, Ctrl+C stops only its own children. Pin the port preflight in Task 3 tests and manually verify cleanup.
- A public request traverses Nginx — rate limiting uses the visitor address only when the deployment opts into one trusted proxy hop; untrusted forwarded headers stay ignored. Pin the config parser in Task 1 tests and verify proxy-header overwrite before any deploy.
- Optional LLM keys, PostgreSQL, Redis, Milvus, or avatar model services are absent — local lightweight mode still starts without those services and docs state the available fallback. Pin with Task 3 smoke checks and Task 4 documentation review.

---

### Task 1: Demo identity, safe entry, and privacy notice

**Files:**
- Create: `yhzk-demo-h5/src/services/demoIdentity.ts`
- Create: `yhzk-demo-h5/tests/demoIdentity.test.mjs`
- Modify: `yhzk-demo-h5/tests/digitalHumanLifecycle.test.mjs`
- Modify: `yhzk-demo-h5/src/config.ts`
- Modify: `yhzk-demo-h5/src/App.tsx`
- Modify: `yhzk-demo-h5/src/services/chat.ts`
- Modify: `yhzk-demo-h5/src/services/user.ts`
- Modify: `yhzk-demo-h5/src/index.scss`
- Create: `yhzk-mvp-backend/src/common/trusted-proxy.ts`
- Create: `yhzk-mvp-backend/src/common/trusted-proxy.spec.ts`
- Modify: `yhzk-mvp-backend/src/main.ts`

**Interfaces:**
- Produces `getDemoToken(storage, createId) -> string`, `getRequestToken(mode, storage, authToken) -> string | null`, `getStorageUserId(mode, demoId, authenticatedUserId) -> string`, `resolveEntryScreen(mode, loggedIn, onboardingDone) -> 'login' | 'onboarding' | 'app'`, and `canConnectDigitalHuman(mode, loggedIn, onboardingDone) -> boolean`.
- `getRequestToken` returns `demo_<crypto.randomUUID()>` persisted in `sessionStorage` in Demo mode; if storage throws, it reuses a module-local token. Production returns only the real auth token and has no fixed demo-token fallback.
- `resolveEntryScreen` skips gates only when mode is `demo`.
- `canConnectDigitalHuman` is always false in Demo mode even if stale auth/onboarding state is present; use it for both session setup and the message send path so anonymous Demo cannot create a LiveTalking session or send TTS speech.
- NestJS `parseTrustedProxyHops(value) -> false | number` defaults to `false`, accepts only a positive integer, and `main.ts` sets Express `trust proxy` from `TRUST_PROXY_HOPS`; local/normal environments remain unchanged unless explicitly configured.
- Task 2 supplies `VITE_API_BASE=/api/v1` and Vite mode `demo`; production env behavior remains as-is.

- [ ] **Step 1: Write tests for `demoIdentity`**

  Test stable reuse from one storage object, distinct tokens for separate tab storage objects, use of the Demo token even when a real auth token exists, production token selection, stable fallback when storage throws, Demo-scoped storage ids that never select a real user id, production login/onboarding gate decisions, and Demo's avatar-connect veto even when auth/onboarding flags are true.

  Update the existing digital-human lifecycle assertion to verify that both the connection effect and send path use `canConnectDigitalHuman`, preserving its production authentication/onboarding coverage.

  Also add NestJS tests for `TRUST_PROXY_HOPS`: unset returns `false`, `1` returns `1`, and zero/fractional/non-numeric values are rejected.

- [ ] **Step 2: Run tests and verify they fail for the missing module/behavior**

  Run from `yhzk-demo-h5`: `node --experimental-strip-types --test tests/demoIdentity.test.mjs`
  Expected: FAIL because the new exports are not implemented.

  Run from `yhzk-mvp-backend`: `npm test -- --runInBand --runTestsByPath src/common/trusted-proxy.spec.ts`
  Expected: FAIL because the validated trust-hop parser is not implemented.

- [ ] **Step 3: Implement Demo identity and entry behavior**

  Add `DEMO_MODE` from `import.meta.env.MODE`; update chat and user request headers to use `getRequestToken`. In `App.tsx`, use `getStorageUserId` for all user-scoped localStorage keys, initialize Demo as unauthenticated, resolve entry through `resolveEntryScreen`, still load Demo chat sessions, and gate both digital-human session setup and `handleSend` capability acquisition with `canConnectDigitalHuman`. This prevents LiveTalking connect/speak calls even when the browser had a stale logged-in user. Hide the logout action in Demo so the visitor cannot clear a stored production login. Add a visible Chinese privacy notice that chat is stored/sent for AI processing and that real health data must not be entered.

  Add the validated opt-in proxy-hop parser and set NestJS Express `trust proxy` from `TRUST_PROXY_HOPS`; do not enable proxy trust by default.

- [ ] **Step 4: Run focused and complete H5 tests**

  Run: `node --experimental-strip-types --test tests/demoIdentity.test.mjs`
  Expected: all identity and gate assertions pass.

  Run: `npm test`
  Expected: all existing H5 tests and the new identity tests pass.

  Run from `yhzk-mvp-backend`: `npm test -- --runInBand` and `npm run build`.
  Expected: all backend tests pass and NestJS compiles.

- [ ] **Step 5: Commit Task 1**

  Commit only the Task 1 files with message `feat: add isolated anonymous demo entry`.

### Task 2: Isolated Vite Demo environment and secret-safe build

**Files:**
- Create: `yhzk-demo-h5/demo-env/.env.demo`
- Create: `yhzk-demo-h5/scripts/demo-env.mjs`
- Create: `yhzk-demo-h5/scripts/run-vite-demo.mjs`
- Create: `yhzk-demo-h5/tests/demoBuild.test.mjs`
- Modify: `yhzk-demo-h5/package.json`
- Modify: `yhzk-demo-h5/vite.config.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes Task 1 `DEMO_MODE` and relative API base `/api/v1`.
- Produces `createDemoViteEnv(sourceEnv) -> NodeJS.ProcessEnv` for the demo Vite child; it removes inherited `VITE_*` values, then sets only `VITE_API_BASE=/api/v1`, `VITE_AVATAR_PROVIDER=livetalking`, and `VITE_XMOV_SHOW_DEV_CONTROLS=false`.
- Produces H5 commands `npm run dev:demo` and `npm run build:demo`; both use mode `demo` and env directory `demo-env`.

- [ ] **Step 1: Write tests for Demo env sanitization**

  Add tests that pass sentinel Xmov app id/secret, Xmov dev controls, and `VITE_AVATAR_PROVIDER=xmov` into `createDemoViteEnv`; assert that secrets/provider are absent, controls are false, and API base is `/api/v1`.

- [ ] **Step 2: Run tests and verify the expected failure**

  Run from `yhzk-demo-h5`: `node --test tests/demoBuild.test.mjs`
  Expected: FAIL because the sanitizer is missing.

- [ ] **Step 3: Add isolated Demo Vite mode**

  Implement env sanitizer and CLI wrapper. Change Vite config to use `demo-env` only for mode `demo`, use `loadEnv` to read `DEMO_API_PROXY_TARGET`, bind the Demo dev server to `127.0.0.1:5273` without `basicSsl`, and keep existing HTTPS/basicSsl and proxy behavior for normal development/production builds. Add only non-secret `VITE_API_BASE=/api/v1` and `DEMO_API_PROXY_TARGET=http://127.0.0.1:3000` to `.env.demo`; allowlist this file through `.gitignore`.

- [ ] **Step 4: Verify sanitization, builds, and browser artifact**

  Run: `node --test tests/demoBuild.test.mjs`
  Expected: all environment-sanitization assertions pass.

  Run from `yhzk-demo-h5`: `npm run build:demo` and `npm run build`
  Expected: both builds exit 0.

  Rebuild Demo with sentinel Xmov credentials in the parent environment, then scan `yhzk-demo-h5/dist` for both sentinel strings.
  Expected: neither sentinel appears in any browser asset.

- [ ] **Step 5: Commit Task 2**

  Commit only the Task 2 files with message `build: isolate public demo environment`.

### Task 3: Windows one-command local launcher

**Files:**
- Create: `start-demo.ps1`
- Create: `scripts/start-demo.mjs`
- Create: `scripts/start-demo.test.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Consumes Task 2 command `yhzk-demo-h5/scripts/run-vite-demo.mjs dev --host 127.0.0.1 --strictPort`.
- Produces root command `.\start-demo.ps1`; the script delegates orchestration to Node, requires Node.js 24 and Python 3.11, and starts H5 `5273`, NestJS `3000`, and FastAPI `8000`.
- Nest child env sets `PORT=3000`, `DB_LIGHTWEIGHT=true`, `AI_BACKEND=python`, `AI_SERVICE_URL=http://127.0.0.1:8000`; AI uses `ai-service/.env` for optional credentials and its current fallback when keys are blank.
- Launcher creates/uses `ai-service/.venv`, runs `npm ci` only when each package's dependencies are absent, installs `ai-service/requirements.txt` into the venv only when needed, checks all three ports before starting, waits for AI `/healthz`, NestJS `/api/v1/health`, and H5 HTTP readiness, opens `http://localhost:5273`, and on Ctrl+C stops only child processes it created.

- [ ] **Step 1: Write tests for launcher preflight and child env**

  Test runtime version rejection below the documented floors, rejection of occupied ports without killing the listener, and exact service env values/loopback bindings.

- [ ] **Step 2: Run tests and verify the expected failure**

  Run from repository root: `node --test scripts/start-demo.test.mjs`
  Expected: FAIL because the launcher helpers are missing.

- [ ] **Step 3: Implement PowerShell entry and Node orchestrator**

  Keep orchestration in Node for explicit child-process ownership and cleanup. Run package install only when the corresponding dependency tree is absent. Use loopback-only binds, stream service logs to the invoking terminal, stop children in a `finally`/signal handler, and ignore the generated SQLite database and launcher logs in `.gitignore`.

- [ ] **Step 4: Verify launcher tests and real local startup/cleanup**

  Run from repository root: `node --test scripts/start-demo.test.mjs`
  Expected: preflight and env tests pass.

  First occupy one required port and verify the launcher exits without stopping that listener. Then run `..\start-demo.ps1` from repository root, verify H5 returns HTTP 200, AI `/healthz` returns `status=ok`, NestJS `/api/v1/health` returns HTTP 200, press Ctrl+C, and verify all three launcher-owned child processes exit.

- [ ] **Step 5: Commit Task 3**

  Commit only the Task 3 files with message `feat: add Windows local demo launcher`.

### Task 4: README and current architecture documentation

**Files:**
- Create: `README.md`
- Modify: `系统架构图.md`

**Interfaces:**
- Consumes Tasks 1–3 behavior and commands exactly as implemented.
- Produces a root Chinese project entry with local quick start, public Demo status/link only if the release gate passes, CI workflow summary, conditional RAG/citations, privacy disclosure, and external LiveTalking/TTS/SRS/model requirements.
- Architecture diagram distinguishes public HTTPS deployment from Windows SQLite local mode and draws optional Milvus/RAG and authenticated-only LiveTalking paths.

- [ ] **Step 1: Draft docs against implementation and existing CI**

  Write the quick start using `.\start-demo.ps1`; make no unverified capability claims. State that chats are stored and forwarded to configured AI services, that no real health data should be entered, and that online Demo is pending until all HTTPS/API/chat gates pass.

- [ ] **Step 2: Review links, commands, and Mermaid against repository files**

  Verify every README link resolves to a file or an actually validated URL, all command/port/env values match Tasks 1–3, and the architecture includes the actual H5 → NestJS → FastAPI → LLM path plus local SQLite.

- [ ] **Step 3: Commit Task 4**

  Run `git diff --check`, inspect the Mermaid graph and README claims, then commit only documentation files with message `docs: add project readme and current architecture`.

### Task 5: Public Demo release-gate verification

**Files:**
- Modify only if observed runtime state requires a documentation status correction: `README.md`

**Interfaces:**
- Consumes final `yhzk-demo-h5/dist` from Task 2 and the service behavior documented in Task 4.
- A public release is valid only if `https://115.190.225.138.nip.io/` has a publicly trusted certificate, TCP 443 is reachable, H5 and `/api/v1` are same-origin, and a text chat completes.
- Cloud firewall changes are out of scope. Do not alter an unidentified TLS listener or publish a URL if any release gate fails.

- [ ] **Step 1: Recheck live host and public HTTPS read-only**

  Use the registered `srvctl` full path to inspect the existing H5/API/TLS listener and an external HTTPS request to check certificate trust and TCP reachability.

- [ ] **Step 2: Deploy only if an isolated vhost and valid certificate already exist**

  Confirm the active Git commit matches this branch, the API supports the Demo token/auth path, an isolated Demo API/database is available, the Nginx proxy overwrites `X-Forwarded-For` with `$remote_addr`, and `TRUST_PROXY_HOPS=1` is applied only to that listener. If every release gate is satisfied without changing the cloud security group or replacing another service, publish the H5 and same-origin API route and run the text-chat smoke check. Otherwise leave deployment untouched and keep README explicitly marked “暂未开放在线体验”, with each failed prerequisite recorded.

- [ ] **Step 3: Final whole-branch review and verification**

  Re-read the spec, run `git diff --check`; in `yhzk-demo-h5`, run `npm test`, `npm run build`, and `npm run build:demo`; in `yhzk-mvp-backend`, run `npm test -- --runInBand` and `npm run build`; in `ai-service`, run `python -m pytest -q` after installing the CI dev extra. Inspect the final diff for leaked sentinel secrets and untracked user files.

- [ ] **Step 4: Commit any gate-status correction**

  If Task 5 changed README status, commit only `README.md` as `docs: report public demo release gate`; otherwise make no extra commit.
