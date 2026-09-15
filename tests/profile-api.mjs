// Run after npm run build. Uses an isolated temporary SQLite database.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';

const temp = await mkdtemp(join(tmpdir(), 'sunc-api-'));
const port = process.env.TEST_PORT || '3199';
const env = { ...process.env, DATABASE_URL: `file:${join(temp, 'test.db')}`, ADMIN_KEY: 'integration-test-key', PORT: port, HOSTNAME: '127.0.0.1' };
let server;
let output = '';
try {
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate', '--schema', 'prisma/schema.prisma'], { env, stdio: 'pipe' });
  server = spawn(process.execPath, [resolve('.next/standalone/server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', chunk => { output += chunk; });
  server.stderr.on('data', chunk => { output += chunk; });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Server exited: ${output}`);
    // Match the spawned server's own readiness; never probe an unrelated listener.
    if (output.includes('Ready in')) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'standalone server starts');
  async function post(path, body, key) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { 'X-Admin-Key': key } : {}) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
    });
    return { status: response.status, body: await response.json() };
  }
  const key = env.ADMIN_KEY;
  assert.equal((await post('/api/users/telegram', { id: 123 })).status, 401);
  assert.equal((await post(`/api/users/telegram?adminKey=${key}`, { id: 123 })).status, 401);
  assert.equal((await post('/api/users/telegram', { id: 123, subgroup: 3 }, key)).status, 400);
  const simultaneous = await Promise.all(Array.from({ length: 8 }, () => post('/api/users/telegram', { id: 123, username: 'student', className: '10-4', isPremium: true }, key)));
  assert.ok(simultaneous.every(result => result.status === 200), JSON.stringify(simultaneous));
  assert.equal(simultaneous.filter(result => result.body.isNew).length, 1);
  let result = await post('/api/users/telegram', { id: 123, action: 'sync' }, key);
  assert.equal(result.body.user.actionsCount, 9);
  assert.equal(result.body.user.isPremium, true);
  assert.equal(result.body.user.className, '10-4');
  result = await post('/api/users/telegram', { id: 123, username: null, className: null, isPremium: false }, key);
  assert.equal(result.body.user.username, null);
  assert.equal(result.body.user.className, null);
  assert.equal(result.body.user.isPremium, false);
  const visits = await Promise.all(Array.from({ length: 8 }, () => post('/api/users/web', { clientId: 'web_test', className: '10-4' })));
  assert.ok(visits.every(result => result.status === 200), JSON.stringify(visits));
  assert.equal(visits.filter(result => result.body.isNew).length, 1);
  assert.ok(visits.every(result => !('visitor' in result.body)));
  assert.equal((await post('/api/users/web', { clientId: 123 })).status, 400);
  assert.equal((await post('/api/feedback', { name: [], contact: 'test', message: 'test' })).status, 400);
  assert.equal((await post('/api/feedback', { name: 'Student', contact: '@student', message: 'Hello' })).status, 200);
  console.log('PASS: standalone profile APIs, concurrent registrations, partial updates, clears, validation, feedback, authorization.');
} catch (error) {
  if (output) console.error(output);
  throw error;
} finally {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await once(server, 'exit');
  }
  await rm(temp, { recursive: true, force: true });
}
