import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createDemoServer } from './index.mjs';
import { createLocalIndex } from './memory.mjs';

async function start(t, env) {
  const dir = mkdtempSync(join(tmpdir(), 'lila-login-'));
  const app = createDemoServer({ file: join(dir, 'state.json'), env, token: 'pair', sync: async s => s, send: async () => 'id', memoryIndex: createLocalIndex() });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  t.after(async () => { await new Promise(r => app.server.close(r)); rmSync(dir, { recursive: true, force: true }); });
  return `http://127.0.0.1:${app.server.address().port}`;
}

test('with DEMO_PASSWORD, the app and API need the password; the right one issues a cookie', async t => {
  const base = await start(t, { DEMO_PASSWORD: 'let-me-in' });
  const noRedirect = { redirect: 'manual' };
  assert.equal((await fetch(base + '/', noRedirect)).status, 303);
  assert.equal((await fetch(base + '/api/state')).status, 401);
  assert.equal((await fetch(base + '/health')).status, 200);

  const wrong = await fetch(base + '/login', { method: 'POST', body: 'password=nope', ...noRedirect });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.headers.get('set-cookie'), null);

  const right = await fetch(base + '/login', { method: 'POST', body: 'password=let-me-in', ...noRedirect });
  assert.equal(right.status, 303);
  const cookie = right.headers.get('set-cookie').split(';')[0];
  assert.match(cookie, /^pocket=[0-9a-f]{64}$/);
  assert.equal((await fetch(base + '/api/state', { headers: { Cookie: cookie } })).status, 200);
  assert.equal((await fetch(base + '/', { headers: { Cookie: cookie }, ...noRedirect })).status, 200);
});

test('without DEMO_PASSWORD, the login page is off and pairing still works', async t => {
  const base = await start(t, {});
  assert.equal((await fetch(base + '/login', { redirect: 'manual' })).status, 303);
  assert.equal((await fetch(base + '/login', { method: 'POST', body: 'password=x', redirect: 'manual' })).status, 404);
  const pair = await fetch(base + '/pair/pair', { redirect: 'manual' });
  assert.equal(pair.status, 303);
});
