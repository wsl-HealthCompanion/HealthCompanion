import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoViteEnv } from '../scripts/demo-env.mjs';

test('removes inherited Vite values and pins the Demo environment', () => {
  const result = createDemoViteEnv({
    PATH: 'system-path',
    NODE_ENV: 'production',
    VITE_XMOV_APP_ID: 'SENTINEL_XMOV_APP_ID',
    VITE_XMOV_APP_SECRET: 'SENTINEL_XMOV_SECRET',
    VITE_XMOV_SHOW_DEV_CONTROLS: 'true',
    VITE_AVATAR_PROVIDER: 'xmov',
    VITE_API_BASE: 'https://attacker.invalid/api',
    VITE_UNRELATED_PUBLIC_VALUE: 'also removed',
  });

  assert.equal(result.PATH, 'system-path');
  assert.equal(result.NODE_ENV, 'production');
  assert.equal(result.VITE_API_BASE, '/api/v1');
  assert.equal(result.VITE_AVATAR_PROVIDER, 'livetalking');
  assert.equal(result.VITE_XMOV_SHOW_DEV_CONTROLS, 'false');
  assert.equal('VITE_XMOV_APP_ID' in result, false);
  assert.equal('VITE_XMOV_APP_SECRET' in result, false);
  assert.equal('VITE_UNRELATED_PUBLIC_VALUE' in result, false);
});
