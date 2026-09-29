import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import {
  assertPortsAvailable,
  createAiDemoEnv,
  createNestDemoEnv,
  DEMO_ENDPOINTS,
  validateRuntimeVersions,
} from './start-demo.mjs';

test('requires Node.js 24+ and Python 3.11+', () => {
  assert.doesNotThrow(() => validateRuntimeVersions('v24.0.0', '3.11.0'));
  assert.doesNotThrow(() => validateRuntimeVersions('v25.1.0', '3.12.0'));
  assert.throws(() => validateRuntimeVersions('v23.9.0', '3.11.0'), /Node\.js 24 or newer/);
  assert.throws(() => validateRuntimeVersions('v24.0.0', '3.10.9'), /Python 3\.11 or newer/);
});

test('rejects an occupied required port and leaves its listener running', async () => {
  const server = createServer((socket) => socket.end('alive'));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const { port } = server.address();
    await assert.rejects(assertPortsAvailable([port]), new RegExp(String(port)));
    assert.equal(server.listening, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('pins the local service addresses and safe process environments', () => {
  assert.deepEqual(DEMO_ENDPOINTS, {
    h5: { host: '127.0.0.1', port: 5273, url: 'http://localhost:5273' },
    nest: { host: '127.0.0.1', port: 3000, healthUrl: 'http://127.0.0.1:3000/api/v1/health' },
    ai: { host: '127.0.0.1', port: 8000, healthUrl: 'http://127.0.0.1:8000/healthz' },
  });

  const nest = createNestDemoEnv({
    PORT: '9000',
    DB_LIGHTWEIGHT: 'false',
    AI_BACKEND: 'legacy',
    AI_SERVICE_URL: 'http://remote.invalid',
    TRUST_PROXY_HOPS: '1',
    DIGITAL_HUMAN_MEDIA_SECRET: 'inherited-secret-must-not-be-used',
  });
  assert.equal(nest.NODE_ENV, 'development');
  assert.equal(nest.HOST, '127.0.0.1');
  assert.equal(nest.PORT, '3000');
  assert.equal(nest.DB_LIGHTWEIGHT, 'true');
  assert.equal(nest.AI_BACKEND, 'python');
  assert.equal(nest.AI_SERVICE_URL, 'http://127.0.0.1:8000');
  assert.equal('TRUST_PROXY_HOPS' in nest, false);
  assert.match(nest.DIGITAL_HUMAN_MEDIA_SECRET, /^[a-f0-9]{64}$/);
  assert.notEqual(nest.DIGITAL_HUMAN_MEDIA_SECRET, 'inherited-secret-must-not-be-used');
  for (const name of ['DIGITAL_HUMAN_INTERNAL_TOKEN', 'ADMIN_JWT_SECRET', 'AVATAR_INTERNAL_TOKEN', 'AVATAR_UPLOAD_TICKET_SECRET']) {
    assert.match(nest[name], /^[a-f0-9]{64}$/);
  }

  const ai = createAiDemoEnv({ PORT: '9000', RAG_ENABLED: 'true', DEEPSEEK_API_KEY: 'local-key' });
  assert.equal(ai.PORT, '8000');
  assert.equal(ai.RAG_ENABLED, 'false');
  assert.equal(ai.DEEPSEEK_API_KEY, 'local-key');
});
