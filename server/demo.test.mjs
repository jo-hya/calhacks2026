import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createSeed, getBudgets } from '../src/lib/budget.js';
import { respond, INVITATION } from './conversation.mjs';
import { importPurchases } from './nessie.mjs';
import { createDemoServer } from './index.mjs';
import { pairedCookie } from './test-helpers.mjs';
const fresh = () => ({ state: createSeed(), proposals: {}, messages: [], inbox: {}, outbox: [] });

test('scripted invitation, approval and replay change budget exactly once', () => {
  let d = respond(fresh(), INVITATION);
  assert.equal(d.state.adjustments.length, 0);
  assert.match(d.reply, /\$17 over/);
  const yes = `YES ${d.proposals.simulation.code}`;
  d = respond(d, yes);
  assert.equal(getBudgets(d.state)[0].remaining, 5800);
  assert.equal(getBudgets(d.state)[1].remaining, 4000);
  d = respond(d, yes);
  assert.equal(d.state.adjustments.length, 1);
});
test('cancel, wrong code, cross-channel and stale approvals do not transfer', () => {
  const d = respond(fresh(), 'DINNER');
  assert.equal(respond(d, 'YES WRONG').state.adjustments.length, 0);
  assert.equal(respond(d, `YES ${d.proposals.simulation.code}`, 'sms').state.adjustments.length, 0);
  assert.equal(respond(d, 'CANCEL').proposals.simulation, null);
  const stale = { ...d, state: { ...d.state, revision: 1 } };
  assert.equal(respond(stale, `YES ${d.proposals.simulation.code}`).state.adjustments.length, 0);
  d.proposals.simulation.expiresAt = 0;
  assert.equal(respond(d, `YES ${d.proposals.simulation.code}`).state.adjustments.length, 0);
});
test('Nessie is authoritative, deduplicated and stable on repeat import', () => {
  const merchants = [{ _id: 'm', name: 'Dinner', category: ['dining'] }];
  const p = { _id: 'p', merchant_id: 'm', amount: 82, purchase_date: '2026-10-23', status: 'completed' };
  const first = importPurchases(createSeed(), [p, p, { ...p, _id: 'pending', status: 'pending' }], merchants, 'a');
  assert.equal(first.transactions.length, 1);
  assert.equal(getBudgets(first)[0].remaining, 3800);
  const second = importPurchases(first, [p], merchants, 'a');
  assert.equal(second.revision, first.revision);
  const changed = importPurchases(first, [{ ...p, amount: 90 }], merchants, 'a');
  assert.equal(getBudgets(changed)[0].remaining, 3000);
  assert.equal(changed.revision, first.revision + 1);
  assert.throws(() => importPurchases(first, [p], [], 'a'), /merchant category/);
});
test('all scripted replies meet Build ASCII and length constraints', () => {
  for (const amount of [0, 8200, 9000, 20000]) {
    const d = fresh(); d.state.transactions = [{ id: 'p', merchant: 'M', category: 'dining', amountCents: amount, date: '2026-10-24' }];
    const next = respond(d, 'DINNER');
    assert.ok(next.reply.length <= 129);
    assert.ok(!/[^\x20-\x7E]/.test(next.reply));
  }
});
test('HTTP auth, webhook sender checks, duplicate delivery and persistent SMS action', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'pocket-test-'));
  const sent = [];
  const env = { BANDWIDTH_WEBHOOK_TOKEN: 'hook', BANDWIDTH_APPLICATION_ID: 'app', BANDWIDTH_PHONE_NUMBER: '+12025550100', BANDWIDTH_VERIFIED_PHONE_NUMBER: '+12025550101' };
  const app = createDemoServer({ file: join(dir, 'state.json'), initial: fresh(), env, token: 'pair', sync: async s => s, send: async text => { sent.push(text); return `sent-${sent.length}`; } });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  t.after(async () => { await new Promise(r => app.server.close(r)); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const cookie = await pairedCookie(base, 'pair');
  const api = (path, value) => fetch(base + path, { method: value ? 'POST' : 'GET', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: value && JSON.stringify(value) });
  assert.equal((await fetch(base + '/api/state')).status, 401);
  // The printed pairing token is not a session: only the cookie issued by pairing works.
  assert.equal((await fetch(base + '/api/state', { headers: { Cookie: 'pocket=pair' } })).status, 401);
  assert.equal((await api('/api/transfer', { id: 'forged' })).status, 400);
  const event = (id, text, from = env.BANDWIDTH_VERIFIED_PHONE_NUMBER) => ({ type: 'message-received', message: { id, text, from, to: [env.BANDWIDTH_PHONE_NUMBER], applicationId: 'app' } });
  const post = events => fetch(base + '/webhooks/bandwidth?token=hook', { method: 'POST', body: JSON.stringify(events) });
  await post([event('wrong', 'DINNER', '+12025550999')]); await app.resume(); assert.equal(sent.length, 0);
  assert.equal((await post([event('invite', 'DINNER')])).status, 204); await app.resume();
  assert.equal(sent.length, 1);
  const code = sent[0].match(/YES ([A-F0-9]+)/)[1];
  await post([event('yes', `YES ${code}`), event('yes', `YES ${code}`)]); await app.resume();
  assert.equal(sent.length, 2);
  let state = await (await api('/api/state')).json();
  assert.equal(state.adjustments.length, 1);
  assert.equal(getBudgets(state)[0].remaining, 5800);
  await post([event('yes', `YES ${code}`)]); await app.resume();
  state = await (await api('/api/state')).json(); assert.equal(state.adjustments.length, 1); assert.equal(sent.length, 2);
  await api('/api/reset', {});
  await post([event('yes', `YES ${code}`)]); await app.resume();
  assert.equal(sent.length, 2);
});

test('callbacks arriving during provider work are acknowledged and retained', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'pocket-concurrent-'));
  let release; const gate = new Promise(r => { release = r; });
  let started; const inFlight = new Promise(r => { started = r; });
  let reads = 0;
  const env = { BANDWIDTH_WEBHOOK_TOKEN: 'hook', BANDWIDTH_APPLICATION_ID: 'app', BANDWIDTH_PHONE_NUMBER: '+12025550100', BANDWIDTH_VERIFIED_PHONE_NUMBER: '+12025550101' };
  const app = createDemoServer({ file: join(dir, 'state.json'), initial: fresh(), env, sync: async s => { if (++reads === 1) { started(); await gate; } return s; }, send: async () => { throw new Error('Provider unavailable'); } });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  t.after(async () => { release(); await new Promise(r => app.server.close(r)); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const post = id => fetch(base + '/webhooks/bandwidth?token=hook', { method: 'POST', body: JSON.stringify([{ type: 'message-received', message: { id, text: 'DINNER', from: env.BANDWIDTH_VERIFIED_PHONE_NUMBER, to: [env.BANDWIDTH_PHONE_NUMBER], applicationId: 'app' } }]), signal: AbortSignal.timeout(2000) });
  assert.equal((await post('first')).status, 204);
  await inFlight;
  assert.equal((await post('second')).status, 204);
  release(); await app.resume();
  const state = await (await fetch(base + '/api/state', { headers: { Cookie: await pairedCookie(base, app.token) } })).json();
  assert.equal(state.conversation.length, 4);
  assert.equal(state.smsStatus.filter(s => s.status === 'failed').length, 2);
});

test('Nessie failure shows a warning and cannot confirm a prepared transfer', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'pocket-offline-'));
  const app = createDemoServer({ file: join(dir, 'state.json'), initial: fresh(), token: 'pair', sync: async () => { throw new Error('Provider unavailable'); } });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  t.after(async () => { await new Promise(r => app.server.close(r)); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const headers = { Cookie: await pairedCookie(base, 'pair'), 'Content-Type': 'application/json' };
  const proposal = await (await fetch(base + '/api/proposal', { method: 'POST', headers, body: JSON.stringify({ id: 'offline-review', from: 'shopping', to: 'dining', amountCents: 2000 }) })).json();
  const confirmation = await fetch(base + '/api/transfer', { method: 'POST', headers, body: JSON.stringify({ id: proposal.id }) });
  assert.equal(confirmation.status, 400);
  const state = await (await fetch(base + '/api/state', { headers })).json();
  assert.equal(state.adjustments.length, 0);
  assert.match(state.connectionWarning, /last saved purchases/);
});
