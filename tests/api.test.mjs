import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import Database from 'better-sqlite3';
import { isolatedTestEnv } from '../scripts/test-env.mjs';

test('local API: health, auth boundary, persistence across restart and SQLite backup restore', { timeout: 45_000 }, async () => {
  fs.mkdirSync('test-output', { recursive: true });
  const dir = fs.mkdtempSync(path.resolve('test-output', 'api-'));
  const dbPath = path.join(dir, 'fixture.db');
  let activeDb = dbPath;
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function stop() {
    if (child && child.exitCode === null && child.signalCode === null) {
      const stopped = once(child, 'exit');
      child.kill();
      await stopped;
    }
  }
  async function start() {
    child = spawn(process.execPath, ['server.mjs'], { env: isolatedTestEnv({ PORT: String(port), DATABASE_PATH: activeDb, MEDIA_PATH: path.join(dir, 'uploads') }), stdio: 'ignore' });
    child.on('error', () => {});
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error(`API process exited: ${child.exitCode}`);
      try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Local API did not start');
  }
  try {
    await start();
    assert.equal((await fetch(`${base}/api/health`)).status, 200);
    assert.equal((await fetch(`${base}/api/admin/orders`)).status, 401);
    const created = await fetch(`${base}/api/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ variant: 'B' }) });
    assert.equal(created.status, 200);
    const project = await created.json();
    assert.ok(project.id);
    await stop();
    await start();
    const saved = await (await fetch(`${base}/api/projects/${project.id}`)).json();
    assert.equal(saved.id, project.id);
    await stop();
    const db = new Database(dbPath);
    const snapshot = path.join(dir, 'backup.db');
    try { await db.backup(snapshot); } finally { db.close(); }
    const restored = new Database(snapshot, { readonly: true });
    try {
      assert.equal(restored.pragma('integrity_check', { simple: true }), 'ok');
      assert.equal(restored.prepare('SELECT id FROM projects WHERE id = ?').get(project.id).id, project.id);
    } finally { restored.close(); }
    activeDb = snapshot;
    await start();
    const recovered = await (await fetch(`${base}/api/projects/${project.id}`)).json();
    assert.equal(recovered.id, project.id, 'Application must read the project from the restored database');
  } finally {
    await stop();
    // Keep this run's isolated fixtures as local diagnostics; never touch wedding.db.
  }
});
