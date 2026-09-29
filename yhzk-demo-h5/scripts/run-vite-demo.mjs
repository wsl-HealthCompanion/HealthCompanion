import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDemoViteEnv } from './demo-env.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const viteCli = resolve(packageRoot, 'node_modules/vite/bin/vite.js');
const args = process.argv.slice(2);
if (args.length === 0) args.push('dev');

const vite = spawn(process.execPath, [viteCli, ...args, '--mode', 'demo'], {
  cwd: packageRoot,
  env: createDemoViteEnv(process.env),
  stdio: 'inherit',
});

let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    vite.kill(signal);
  });
}

vite.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1);
});

vite.on('error', (error) => {
  console.error(`[demo-vite] ${error.message}`);
  process.exitCode = 1;
});
