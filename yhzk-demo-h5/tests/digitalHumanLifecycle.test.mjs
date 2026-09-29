import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { exitAuthenticatedSession } from '../src/appSession.ts';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('digital human connects only for an authenticated, onboarded LiveTalking user', () => {
  assert.match(app, /if \(useXmovAvatar\) \{\s*digitalHuman\.invalidate\(\);[\s\S]*?return;\s*\}/);
  assert.match(app, /if \(!loggedIn \|\| !onboardingDone\) \{[\s\S]*?digitalHuman\.invalidate\(\)/);
  assert.match(app, /digitalHuman\.connect\(\)\.then/);
  assert.match(app, /\}, \[loggedIn, onboardingDone, useXmovAvatar\]\);/);
});

test('logout stops the digital human before clearing authentication', () => {
  const calls = [];
  exitAuthenticatedSession({
    interruptDigitalHuman: () => calls.push('disconnect'),
    clearAuthentication: () => calls.push('logout'),
    refreshView: () => calls.push('refresh'),
    showLogin: () => calls.push('login'),
  });
  assert.deepEqual(calls, ['disconnect', 'logout', 'refresh', 'login']);
  assert.match(app, /clearAuthentication: doLogout/);
  assert.match(
    app,
    /interruptDigitalHuman: \(\) => \{\s*if \(useXmovAvatar\) void xmovAvatar\.interrupt\(\);\s*else void digitalHuman\.disconnect\(\);/,
  );
});

test('login restores the saved chat session and initializes the newest session otherwise', () => {
  assert.match(app, /if \(!currentSessionId && items\.length > 0\) \{\s*setCurrentSessionId\(items\[0\]\.sessionId\);/);
  assert.match(app, /if \(lastSid\) \{ switchSession\(lastSid\); \}/);
});
