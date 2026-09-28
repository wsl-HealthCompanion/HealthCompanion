import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const service = readFileSync(
  new URL('../src/services/digitalHuman.ts', import.meta.url),
  'utf8',
);

test('digital human connects only for an authenticated user', () => {
  assert.match(app, /useEffect\(\(\) => \{\s*if \(!loggedIn\) return;\s*digitalHuman\.connect/);
  assert.match(app, /\}, \[loggedIn\]\);/);
});

test('logout releases the digital human before clearing authentication', () => {
  const disconnect = app.indexOf('await digitalHuman.disconnect()');
  const logout = app.indexOf('doLogout();', disconnect);
  assert.ok(disconnect >= 0);
  assert.ok(logout > disconnect);
  assert.match(service, /async disconnect\(\): Promise<void>/);
  assert.match(service, /postDH\('\/api\/digital-human\/disconnect'/);
});

test('login restores the saved or newest server-side chat session', () => {
  assert.match(app, /const restoreSid = lastSid \|\| items\[0\]\?\.sessionId;/);
  assert.match(app, /if \(restoreSid\) \{ switchSession\(restoreSid\); \}/);
});
