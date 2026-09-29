# M1.5 Xmov Action Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a frontend registry that maps approved HealthCompanion action keys only to Xmov KA semantics visually verified on the real account.

**Architecture:** Keep the registry as a pure TypeScript module under `src/avatar`; expose one resolver that returns a documented entry for a known key and `null` for unknown keys. Do not wire it to LangGraph, chat rounds, the Expression Planner, or backend code in M1.5.

**Tech Stack:** TypeScript, Vitest, Vite.

---

## Decisions and verified source data

- `acknowledge` and `confirm` map to `Nod` (visible head dip with a hand-to-chest gesture).
- `encourage` maps to `skill_like` (visible thumbs-up).
- `show_direction` maps to `LeftSide` (visible side-pointing gesture).
- `warm_up` maps to `daoyou_Hello01` (visible two-hand greeting pose).
- `fallback` has `semantic: null` and `verified: false`; unknown keys resolve to `null`.
- `Bow`, `Surprise`, and `daoyou_ClapHands02` were visibly animated but are not part of the initial business map.
- M1.4 screenshots and recording are local QA artifacts; no credentials or response URLs enter source control.

## Files

- Create `yhzk-demo-h5/src/avatar/actionRegistry.ts` for the key type, immutable entry shape, verified entries, fallback entry, and resolver.
- Create `yhzk-demo-h5/src/avatar/actionRegistry.spec.ts` for verified mappings, fallback, and unknown-key behavior.
- Modify `yhzk-demo-h5/package.json` so `test:xmov-action-lab` includes the registry spec.
- Update `docs/superpowers/specs/2026-09-29-xmov-action-lab-design.md` with the real-account validation and chosen mappings.

### Task 1: Add the verified Action Registry

**Files:**
- Create: `yhzk-demo-h5/src/avatar/actionRegistry.spec.ts`
- Create: `yhzk-demo-h5/src/avatar/actionRegistry.ts`
- Modify: `yhzk-demo-h5/package.json`
- Modify: `docs/superpowers/specs/2026-09-29-xmov-action-lab-design.md`

- [x] **Step 1: Write the failing registry spec**

```typescript
import { describe, expect, it } from 'vitest';
import { resolveHealthAction } from './actionRegistry';

describe('resolveHealthAction', () => {
  it('maps business keys to real-account visually verified KA semantics', () => {
    const mappings = [
      ['acknowledge', 'Nod'],
      ['encourage', 'skill_like'],
      ['show_direction', 'LeftSide'],
      ['warm_up', 'daoyou_Hello01'],
      ['confirm', 'Nod'],
    ] as const;

    for (const [businessKey, semantic] of mappings) {
      expect(resolveHealthAction(businessKey)).toMatchObject({
        businessKey,
        semantic,
        verified: true,
      });
    }
  });

  it('keeps fallback explicitly unmapped', () => {
    expect(resolveHealthAction('fallback')).toMatchObject({
      businessKey: 'fallback',
      semantic: null,
      verified: false,
    });
  });

  it('returns null for an unknown business key', () => {
    expect(resolveHealthAction('unreviewed_action')).toBeNull();
  });
});
```

- [x] **Step 2: Run the registry spec and confirm RED**

Run from `yhzk-demo-h5`:

```powershell
npx vitest run src/avatar/actionRegistry.spec.ts
```

Expected: FAIL because `src/avatar/actionRegistry.ts` does not exist yet.

- [x] **Step 3: Add the minimal registry implementation**

```typescript
export type HealthActionKey =
  | 'acknowledge'
  | 'encourage'
  | 'show_direction'
  | 'warm_up'
  | 'confirm'
  | 'fallback';

export interface ActionRegistryEntry {
  readonly businessKey: HealthActionKey;
  readonly semantic: string | null;
  readonly verified: boolean;
  readonly note?: string;
}

const ACTION_REGISTRY: Readonly<Record<HealthActionKey, ActionRegistryEntry>> = {
  acknowledge: {
    businessKey: 'acknowledge',
    semantic: 'Nod',
    verified: true,
    note: '真实画面可见低头并抬手至胸前。',
  },
  encourage: {
    businessKey: 'encourage',
    semantic: 'skill_like',
    verified: true,
    note: '真实画面可见竖拇指。',
  },
  show_direction: {
    businessKey: 'show_direction',
    semantic: 'LeftSide',
    verified: true,
    note: '真实画面可见向数字人左侧伸手指示。',
  },
  warm_up: {
    businessKey: 'warm_up',
    semantic: 'daoyou_Hello01',
    verified: true,
    note: '真实画面可见双手抬起的打招呼动作。',
  },
  confirm: {
    businessKey: 'confirm',
    semantic: 'Nod',
    verified: true,
    note: '复用真实画面确认过的肯定动作。',
  },
  fallback: {
    businessKey: 'fallback',
    semantic: null,
    verified: false,
    note: '没有匹配 KA；使用语音或互动待机回退。',
  },
};

export function resolveHealthAction(key: string): ActionRegistryEntry | null {
  if (!Object.prototype.hasOwnProperty.call(ACTION_REGISTRY, key)) return null;
  return ACTION_REGISTRY[key as HealthActionKey];
}
```

- [x] **Step 4: Run registry, existing Action Lab specs, and frontend build**

Add `src/avatar/actionRegistry.spec.ts` to the `test:xmov-action-lab` script, then run:

```powershell
npm run test:xmov-action-lab
npm run build
```

Expected: all Action Lab specs pass and Vite/TypeScript build exits 0.

- [x] **Step 5: Review scope and whitespace**

From the repository root, run:

```powershell
git diff --check
git diff --stat
```

Confirm only the registry, its tests, the H5 test script, and the M1 design record changed. No backend, LangGraph, or chat runtime files should change.

- [x] **Step 6: Commit M1.5**

```powershell
git add docs/superpowers/specs/2026-09-29-xmov-action-lab-design.md docs/superpowers/plans/2026-09-30-xmov-m1-5-action-registry.md yhzk-demo-h5/package.json yhzk-demo-h5/src/avatar/actionRegistry.ts yhzk-demo-h5/src/avatar/actionRegistry.spec.ts
git commit -m "feat(xmov): add visually verified action registry"
```
