import { createHash, randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { existsSync } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const DEMO_ENDPOINTS = Object.freeze({
  h5: Object.freeze({ host: '127.0.0.1', port: 5273, url: 'http://localhost:5273' }),
  nest: Object.freeze({ host: '127.0.0.1', port: 3000, healthUrl: 'http://127.0.0.1:3000/api/v1/health' }),
  ai: Object.freeze({ host: '127.0.0.1', port: 8000, healthUrl: 'http://127.0.0.1:8000/healthz' }),
});

export function validateRuntimeVersions(nodeVersion, pythonVersion) {
  const nodeMajor = Number(String(nodeVersion).replace(/^v/, '').split('.')[0]);
  if (!Number.isInteger(nodeMajor) || nodeMajor < 24) {
    throw new Error('Node.js 24 or newer is required.');
  }

  const pythonParts = String(pythonVersion).split('.').map(Number);
  if (pythonParts.length < 2 || !Number.isInteger(pythonParts[0]) || !Number.isInteger(pythonParts[1])
    || pythonParts[0] < 3 || (pythonParts[0] === 3 && pythonParts[1] < 11)) {
    throw new Error('Python 3.11 or newer is required.');
  }
}

export async function assertPortsAvailable(ports) {
  const occupied = [];
  for (const port of ports) {
    const result = await probePort(port);
    if (result === 'occupied') occupied.push(port);
    else if (result !== 'available') throw new Error(`Could not verify whether 127.0.0.1:${port} is available.`);
  }
  if (occupied.length) {
    throw new Error(`Required Demo port(s) already in use: ${occupied.join(', ')}. Close the application using the port(s), then try again.`);
  }
}

export function createNestDemoEnv(env = process.env) {
  const next = {
    ...env,
    NODE_ENV: 'development',
    HOST: DEMO_ENDPOINTS.nest.host,
    PORT: String(DEMO_ENDPOINTS.nest.port),
    DB_LIGHTWEIGHT: 'true',
    AI_BACKEND: 'python',
    AI_SERVICE_URL: `http://${DEMO_ENDPOINTS.ai.host}:${DEMO_ENDPOINTS.ai.port}`,
    DIGITAL_HUMAN_MEDIA_SECRET: randomBytes(32).toString('hex'),
    DIGITAL_HUMAN_INTERNAL_TOKEN: randomBytes(32).toString('hex'),
    ADMIN_JWT_SECRET: randomBytes(32).toString('hex'),
    AVATAR_INTERNAL_TOKEN: randomBytes(32).toString('hex'),
    AVATAR_UPLOAD_TICKET_SECRET: randomBytes(32).toString('hex'),
  };
  delete next.TRUST_PROXY_HOPS;
  return next;
}

export function createAiDemoEnv(env = process.env) {
  return {
    ...env,
    PORT: String(DEMO_ENDPOINTS.ai.port),
    RAG_ENABLED: 'false',
  };
}

function probePort(port) {
  return new Promise((resolveProbe) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (result === 'occupied') socket.end();
      else socket.destroy();
      resolveProbe(result);
    };
    socket.setTimeout(800, () => finish('unknown'));
    socket.once('connect', () => finish('occupied'));
    socket.once('error', (error) => finish(error.code === 'ECONNREFUSED' ? 'available' : 'unknown'));
  });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: options.env ?? process.env,
    encoding: 'utf8',
    shell: process.platform === 'win32' && /\.cmd$/i.test(command),
    stdio: options.stdio ?? 'pipe',
    windowsHide: true,
  });
  if (result.error) throw new Error(`${command} could not be started: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`${command} failed${detail ? `: ${detail}` : '.'}`);
  }
  return (result.stdout ?? '').trim();
}

function findPython() {
  const candidates = process.platform === 'win32'
    ? [['py.exe', ['-3']], ['python.exe', []], ['python', []]]
    : [['python3', []], ['python', []]];
  for (const [command, prefix] of candidates) {
    const result = spawnSync(command, [...prefix, '-c', 'import json,sys; print(json.dumps({"executable":sys.executable,"version":".".join(map(str,sys.version_info[:3]))}))'], {
      encoding: 'utf8', windowsHide: true,
    });
    if (result.status !== 0 || !result.stdout) continue;
    try {
      const details = JSON.parse(result.stdout.trim());
      validateRuntimeVersions(process.version, details.version);
      return { executable: details.executable, version: details.version };
    } catch (error) {
      if (String(error).includes('Python 3.11')) continue;
      throw error;
    }
  }
  throw new Error('Python 3.11 or newer was not found. Install Python and try again.');
}

function exists(path) {
  return access(path).then(() => true, () => false);
}

function installNpmDependencies(packagePath, requiredEntry) {
  if (existsSync(requiredEntry)) return;
  console.log(`Installing Node.js dependencies in ${packagePath} (npm ci)...`);
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci'], { cwd: packagePath, stdio: 'inherit' });
  if (!existsSync(requiredEntry)) throw new Error(`npm ci completed but ${requiredEntry} is still missing.`);
}

async function prepareAiEnvironment(python) {
  const serviceDir = resolve(root, 'ai-service');
  const venvDir = resolve(serviceDir, '.venv');
  const venvPython = resolve(venvDir, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const requirements = resolve(serviceDir, 'requirements.txt');
  const marker = resolve(venvDir, '.demo-requirements.sha256');

  if (!(await exists(venvPython))) {
    console.log('Creating ai-service/.venv...');
    run(python.executable, ['-m', 'venv', venvDir], { cwd: serviceDir, stdio: 'inherit' });
  }

  const digest = createHash('sha256').update(await readFile(requirements)).digest('hex');
  const savedDigest = await readFile(marker, 'utf8').catch(() => '');
  const importsAvailable = spawnSync(venvPython, ['-c', 'import fastapi,uvicorn'], { cwd: serviceDir, stdio: 'ignore', windowsHide: true }).status === 0;
  if (!importsAvailable || savedDigest.trim() !== digest) {
    console.log('Installing AI service dependencies from requirements.txt...');
    run(venvPython, ['-m', 'pip', 'install', '-r', requirements], { cwd: serviceDir, stdio: 'inherit' });
    await writeFile(marker, `${digest}\n`, 'utf8');
  }
  return { venvPython, serviceDir };
}

function spawnOwned(label, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? root,
    env: options.env ?? process.env,
    stdio: 'inherit',
    windowsHide: true,
    detached: process.platform !== 'win32',
  });
  const record = { label, child };
  child.once('error', (error) => options.onFailure(new Error(`${label} could not start: ${error.message}`)));
  child.once('exit', (code, signal) => {
    if (!options.isStopping()) {
      options.onFailure(new Error(`${label} exited before the Demo was stopped (code ${code ?? 'none'}, signal ${signal ?? 'none'}).`));
    }
  });
  return record;
}

async function waitForHttp(url, record, timeoutMs, isStopping) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'no response';
  while (Date.now() < deadline) {
    if (isStopping()) throw new Error('Startup interrupted.');
    if (record.child.exitCode !== null || record.child.signalCode !== null) {
      throw new Error(`${record.label} exited before becoming ready.`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 400));
  }
  throw new Error(`${record.label} did not become ready at ${url} within ${Math.round(timeoutMs / 1000)}s (${lastError}).`);
}

function openBrowser(url) {
  if (process.platform === 'win32') {
    spawn('cmd.exe', ['/d', '/c', 'start', '""', url], { stdio: 'ignore', windowsHide: true, detached: true }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
  } else {
    spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
  }
}

async function stopOwned(records) {
  const reverse = [...records].reverse();
  await Promise.all(reverse.map(async ({ label, child }) => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    if (process.platform === 'win32') {
      spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      await Promise.race([
        new Promise((resolveExit) => child.once('exit', resolveExit)),
        new Promise((resolveDelay) => setTimeout(resolveDelay, 3000)),
      ]);
      console.log(`Stopped ${label}.`);
      return;
    }
    try { process.kill(-child.pid, 'SIGTERM'); } catch { return; }
    await Promise.race([
      new Promise((resolveExit) => child.once('exit', resolveExit)),
      new Promise((resolveDelay) => setTimeout(resolveDelay, 2500)),
    ]);
    if (child.exitCode === null && child.signalCode === null) {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* the process group already stopped */ }
    }
    console.log(`Stopped ${label}.`);
  }));
}

async function waitForStopSignal(failure) {
  return Promise.race([
    new Promise((resolveSignal) => {
      const cleanups = [];
      for (const signal of ['SIGINT', 'SIGTERM']) {
        const handler = () => {
          for (const [name, listener] of cleanups) process.removeListener(name, listener);
          resolveSignal(signal);
        };
        cleanups.push([signal, handler]);
        process.once(signal, handler);
      }
    }),
    failure,
  ]);
}

async function main() {
  validateRuntimeVersions(process.version, '3.11.0');
  const python = findPython();
  console.log(`Using Node ${process.version} and Python ${python.version}.`);

  const ports = [DEMO_ENDPOINTS.h5.port, DEMO_ENDPOINTS.nest.port, DEMO_ENDPOINTS.ai.port];
  await assertPortsAvailable(ports);

  installNpmDependencies(resolve(root, 'yhzk-demo-h5'), resolve(root, 'yhzk-demo-h5/node_modules/vite/bin/vite.js'));
  installNpmDependencies(resolve(root, 'yhzk-mvp-backend'), resolve(root, 'yhzk-mvp-backend/node_modules/@nestjs/cli/bin/nest.js'));
  const ai = await prepareAiEnvironment(python);
  await mkdir(resolve(root, 'yhzk-mvp-backend/data'), { recursive: true });

  const records = [];
  let stopping = false;
  let rejectFailure;
  const failure = new Promise((_, reject) => { rejectFailure = reject; });
  failure.catch(() => {});
  const onFailure = (error) => { if (!stopping) rejectFailure(error); };
  const isStopping = () => stopping;
  const add = (record) => records.push(record);

  try {
    const aiRecord = spawnOwned('FastAPI', ai.venvPython, ['-m', 'uvicorn', 'app.main:app', '--host', DEMO_ENDPOINTS.ai.host, '--port', String(DEMO_ENDPOINTS.ai.port)], {
      cwd: ai.serviceDir,
      env: createAiDemoEnv(process.env),
      onFailure,
      isStopping,
    });
    add(aiRecord);
    await Promise.race([waitForHttp(DEMO_ENDPOINTS.ai.healthUrl, aiRecord, 180000, isStopping), failure]);
    console.log('FastAPI is ready.');

    const backendDir = resolve(root, 'yhzk-mvp-backend');
    const nestRecord = spawnOwned('NestJS', process.execPath, [resolve(backendDir, 'node_modules/@nestjs/cli/bin/nest.js'), 'start', '--watch'], {
      cwd: backendDir,
      env: createNestDemoEnv(process.env),
      onFailure,
      isStopping,
    });
    add(nestRecord);
    await Promise.race([waitForHttp(DEMO_ENDPOINTS.nest.healthUrl, nestRecord, 180000, isStopping), failure]);
    console.log('NestJS is ready.');

    const h5Record = spawnOwned('H5 Demo', process.execPath, [
      resolve(root, 'yhzk-demo-h5/scripts/run-vite-demo.mjs'), 'dev', '--host', DEMO_ENDPOINTS.h5.host, '--strictPort',
    ], { cwd: resolve(root, 'yhzk-demo-h5'), env: process.env, onFailure, isStopping });
    add(h5Record);
    await Promise.race([waitForHttp(DEMO_ENDPOINTS.h5.url, h5Record, 60000, isStopping), failure]);

    console.log(`HealthCompanion Demo is ready: ${DEMO_ENDPOINTS.h5.url}`);
    console.log('Use Ctrl+C in this window to stop the Demo services.');
    openBrowser(DEMO_ENDPOINTS.h5.url);
    await waitForStopSignal(failure);
  } finally {
    stopping = true;
    await stopOwned(records);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Demo launcher: ${error.message}`);
    process.exitCode = 1;
  });
}
