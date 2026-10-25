import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createDemoServer } from './index.mjs';
import { pairedCookie } from './test-helpers.mjs';
import { createAgentPurchase, deleteAgentPurchases } from './nessie.mjs';

test('uncertain Nessie payments reconcile after restart without another POST', async t => {
  const oldKey = process.env.NESSIE_API_KEY, oldAccount = process.env.NESSIE_ACCOUNT_ID;
  process.env.NESSIE_API_KEY = 'test'; process.env.NESSIE_ACCOUNT_ID = 'account';
  const dir = mkdtempSync(join(tmpdir(), 'lila-payment-'));
  let app, posts = 0, visible = false;
  const purchases = [], deleted = [];
  t.after(async () => {
    if (app) await new Promise(r => app.server.close(r));
    rmSync(dir, { recursive: true, force: true });
    if (oldKey === undefined) delete process.env.NESSIE_API_KEY; else process.env.NESSIE_API_KEY = oldKey;
    if (oldAccount === undefined) delete process.env.NESSIE_ACCOUNT_ID; else process.env.NESSIE_ACCOUNT_ID = oldAccount;
  });
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const path = new URL(url).pathname;
    if (options.method === 'DELETE') { deleted.push(path); return new Response('{}'); }
    if (path === '/accounts') return Response.json([{ _id: 'account' }]);
    if (path === '/merchants') return Response.json([{ _id: 'merchant', name: 'Pocket demo - Cafe', category: 'dining' }]);
    assert.equal(path, '/accounts/account/purchases');
    if (options.method === 'POST') {
      posts++;
      purchases.push({ ...JSON.parse(options.body), _id: 'purchase' });
      throw new Error('Response lost after commit');
    }
    return Response.json(visible ? purchases : []);
  });
  let ops;
  const start = async () => {
    app = createDemoServer({ file: join(dir, 'state.json'), env: {}, sync: async s => s,
      agent: async args => { ops = args.ops; return 'Ready'; } });
    // Capture the real persistent operations without calling any external service.
    const initial = app;
    app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
    const { request } = await import('node:http');
    const cookie = await pairedCookie(`http://127.0.0.1:${initial.server.address().port}`, initial.token);
    await new Promise((resolve, reject) => {
      const req = request(`http://127.0.0.1:${initial.server.address().port}/api/message`, {
        method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      }, res => { res.resume(); res.on('end', resolve); });
      req.on('error', reject); req.end(JSON.stringify({ text: 'hello' }));
    });
  };
  await start();
  const action = await ops.setPending({ kind: 'purchase', merchant: 'Cafe', category: 'dining', amountCents: 1500, turn: 'a' });
  await assert.rejects(ops.applyPending(action.id), /Response lost/);
  assert.equal(ops.pending().attempted, true);
  await new Promise(r => app.server.close(r)); app = null;
  await start();
  await assert.rejects(ops.applyPending(action.id), /outcome is still unknown/);
  await assert.rejects(ops.setPending({ ...action, id: 'another' }), /outcome is uncertain/);
  await assert.rejects(ops.clearPending(), /cannot be cancelled/);
  assert.equal(posts, 1);
  visible = true;
  await ops.applyPending(action.id);
  assert.equal(ops.pending(), null);
  assert.equal(posts, 1);
  assert.equal(purchases[0].description, `pocket-agent:${action.id}`);
  assert.equal(await createAgentPurchase(action), 'purchase');
  assert.equal(posts, 1);
  purchases.push({ _id: 'seed', description: 'pocket-demo-v1:t01' });
  await deleteAgentPurchases();
  assert.deepEqual(deleted, ['/purchase/purchase']);
});
