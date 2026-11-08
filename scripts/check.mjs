import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';

fs.mkdirSync('test-output', { recursive: true });
let lock;
try { lock = fs.openSync('test-output/check.lock', 'wx'); }
catch { throw new Error('Another check may be running. Inspect the process before removing a stale test-output/check.lock.'); }
fs.writeSync(lock, String(process.pid));
const startedAt = new Date().toISOString();
const steps = [];
try {
  for (const args of [
    ['node_modules/typescript/bin/tsc', '-b'],
    ['node_modules/vite/bin/vite.js', 'build'],
    ['--test', 'tests/api.test.mjs'],
    ['verify.mjs'], ['verify-extra.mjs'], ['verify-workspace.mjs'],
  ]) {
    const name = args.join(' ');
    const logPath = `test-output/check-${steps.length + 1}.log`;
    fs.writeFileSync(logPath, `node ${name}\n`);
    console.log(`\nCHECK: ${name}`);
    const code = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
      for (const [stream, destination] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
        stream.on('data', chunk => { fs.appendFileSync(logPath, chunk); destination.write(chunk); });
      }
      const timeout = setTimeout(() => {
        if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        else { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
        steps.push({ command: `node ${name}`, logPath, exitCode: null, error: 'timeout' });
        reject(new Error(`Timeout: ${name}. Inspect diagnostics before retrying.`));
      }, 300_000);
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', code => { clearTimeout(timeout); resolve(code); });
    });
    steps.push({ command: `node ${name}`, logPath, exitCode: code });
    if (code !== 0) { process.exitCode = 1; break; }
  }
} finally {
  fs.writeFileSync('test-output/check-summary.json', JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), steps, complete: steps.length === 6 && steps.every(step => step.exitCode === 0) }, null, 2));
  fs.closeSync(lock);
  fs.unlinkSync('test-output/check.lock');
}
