import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canConnectDigitalHuman,
  getDemoToken,
  getRequestToken,
  getStorageUserId,
  resolveEntryScreen,
} from '../src/services/demoIdentity.ts';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('reuses the demo identity within one tab storage', () => {
  const storage = createStorage();
  let generated = 0;
  const createId = () => `00000000-0000-4000-8000-${String(++generated).padStart(12, '0')}`;

  const first = getDemoToken(storage, createId);
  const second = getDemoToken(storage, createId);

  assert.equal(first, 'demo_00000000-0000-4000-8000-000000000001');
  assert.equal(second, first);
  assert.equal(generated, 1);
});

test('gives separate tab storage objects different demo identities', () => {
  let generated = 0;
  const createId = () => `00000000-0000-4000-8000-${String(++generated).padStart(12, '0')}`;

  assert.notEqual(getDemoToken(createStorage(), createId), getDemoToken(createStorage(), createId));
});

test('Demo requests ignore a stored production auth token', () => {
  assert.match(getRequestToken('demo', createStorage(), 'real-user-jwt'), /^demo_/);
});

test('production requests return only the authenticated token', () => {
  assert.equal(getRequestToken('production', createStorage(), 'real-user-jwt'), 'real-user-jwt');
  assert.equal(getRequestToken('production', createStorage(), null), null);
});

test('keeps a stable in-memory identity if session storage throws', () => {
  const blockedStorage = {
    getItem() { throw new Error('storage blocked'); },
    setItem() { throw new Error('storage blocked'); },
  };
  let generated = 0;
  const createId = () => `00000000-0000-4000-8000-${String(++generated).padStart(12, '0')}`;

  const first = getDemoToken(blockedStorage, createId);
  const second = getDemoToken(blockedStorage, createId);

  assert.equal(first, 'demo_00000000-0000-4000-8000-000000000001');
  assert.equal(second, first);
  assert.equal(generated, 1);
});

test('replaces a corrupt stored value with a valid random demo identity', () => {
  const storage = createStorage();
  storage.setItem('yhzk_demo_identity_v1', 'real-user-jwt');

  const token = getDemoToken(storage, () => '00000000-0000-4000-8000-000000000002');

  assert.equal(token, 'demo_00000000-0000-4000-8000-000000000002');
  assert.equal(getDemoToken(storage), token);
});

test('uses a Demo-scoped local storage user id instead of the authenticated user id', () => {
  assert.equal(getStorageUserId('demo', 'demo_tab-id', 'real-user-id'), 'demo_tab-id');
  assert.equal(getStorageUserId('production', 'demo_tab-id', 'real-user-id'), 'real-user-id');
});

test('skips login and onboarding only in Demo mode', () => {
  assert.equal(resolveEntryScreen('demo', false, false), 'app');
  assert.equal(resolveEntryScreen('production', false, false), 'login');
  assert.equal(resolveEntryScreen('production', true, false), 'onboarding');
  assert.equal(resolveEntryScreen('production', true, true), 'app');
});

test('never connects a digital human in Demo mode', () => {
  assert.equal(canConnectDigitalHuman('demo', true, true), false);
  assert.equal(canConnectDigitalHuman('production', true, true), true);
  assert.equal(canConnectDigitalHuman('production', false, true), false);
  assert.equal(canConnectDigitalHuman('production', true, false), false);
});

test('App gates both avatar setup and speech acquisition and shows the Demo privacy notice', () => {
  assert.match(app, /canConnectDigitalHuman\(DEMO_MODE \? 'demo' : 'production', loggedIn, onboardingDone\)/);
  assert.match(app, /useXmovAvatar \|\| !canUseDigitalHuman\s*\? Promise\.resolve\(null\)/);
  assert.match(app, /!DEMO_MODE && <button className="app-btn" onClick=\{\(\) => setActiveTab\(activeTab==='profile'\?'dh':'profile'\)\}>👤 我的<\/button>/);
  assert.match(app, /useState<Tab>\(DEMO_MODE \? 'chat' : 'dh'\)/);
  assert.match(app, /const modes = DEMO_MODE \? \{ isElderly: false, careMode: false \} : loadUserModes\(\)/);
  assert.match(app, /对话会保存到演示服务，并发送给所配置的 AI 服务处理/);
});
