import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import Anthropic from '@anthropic-ai/sdk';
import { createSeed, getBudgets, proposeTransfer, confirmTransfer } from '../src/lib/budget.js';
import { buildTools, runAgent } from './agent.mjs';
import { splitSms, toSmsAscii } from './sms-text.mjs';
import { categoryForKind } from './place.mjs';
import { createDemoServer } from './index.mjs';

process.env.POCKET_WEB_SEARCH = 'off';
const remaining = (state, id) => getBudgets(state).find(b => b.id === id).remaining;

// Minimal in-memory version of the server's ops, for tool-level tests.
function memoryOps() {
  let state = createSeed(); let pending = null; let lastChange = null; const history = []; const paid = [];
  return {
    paid, get stateNow() { return state; },
    // Stands in for a budget change made outside the agent (e.g. in the app).
    changeOutsideAgent: () => { state = { ...state, budgets: { ...state.budgets, groceries: state.budgets.groceries - 100 } }; },
    state: () => state, pending: () => pending, history: () => history,
    setPending: async action => { if (action.kind === 'transfer') proposeTransfer(state, { ...action, id: 'check' }); return (pending = { ...action, id: `act-${history.length}${Math.random()}` }); },
    clearPending: async () => { pending = null; },
    appendHistory: async (...m) => { history.push(...m); },
    applyPending: async id => {
      if (pending?.id !== id) throw new Error('not pending');
      if (pending.kind === 'transfer') state = confirmTransfer(state, proposeTransfer(state, pending));
      else paid.push(pending);
      pending = null;
    },
    moveBudget: async ({ from, to, amountCents }) => {
      state = confirmTransfer(state, proposeTransfer(state, { from, to, amountCents, id: `move-${Math.random()}` }));
      lastChange = { undo: { from: to, to: from, amountCents }, after: JSON.stringify(state.budgets) };
    },
    undoLast: async () => {
      if (!lastChange) throw new Error('There is no recent change to undo.');
      if (JSON.stringify(state.budgets) !== lastChange.after) throw new Error('Your budget changed after that.');
      state = confirmTransfer(state, proposeTransfer(state, { ...lastChange.undo, id: `undo-${Math.random()}` }));
      lastChange = null;
    },
    updateProfileNow: async () => { throw new Error('not used in these tests'); },
  };
}
const tool = (tools, name) => tools.find(t => t.name === name);

test('budget moves from the user apply at once and can be undone', async t => {
  await t.test('a user request moves budget without a confirmation step', async () => {
    const ops = memoryOps();
    const tools = buildTools(ops, { turnId: 't1', userInitiated: true, bankFresh: true });
    const result = await tool(tools, 'move_budget').run({ from: 'shopping', to: 'dining', amount_dollars: 17 });
    assert.match(result, /^Done: moved \$17\.00/);
    assert.equal(remaining(ops.stateNow, 'dining'), 5500);
    assert.equal(ops.pending(), null);
  });
  await t.test('undo reverses the last move by text', async () => {
    const ops = memoryOps();
    const tools = buildTools(ops, { turnId: 't1', userInitiated: true, bankFresh: true });
    await tool(tools, 'move_budget').run({ from: 'shopping', to: 'dining', amount_dollars: 17 });
    assert.match(await tool(buildTools(ops, { turnId: 't2', userInitiated: true, bankFresh: true }), 'undo_last_change').run({}), /^Undone/);
    assert.equal(remaining(ops.stateNow, 'dining'), 3800);
    assert.equal(remaining(ops.stateNow, 'shopping'), 6000);
    assert.match(await tool(buildTools(ops, { turnId: 't3', userInitiated: true, bankFresh: true }), 'undo_last_change').run({}), /no recent change/);
  });
  await t.test('undo refuses once the budget has changed since the move', async () => {
    const ops = memoryOps();
    await tool(buildTools(ops, { turnId: 't1', userInitiated: true, bankFresh: true }), 'move_budget').run({ from: 'shopping', to: 'dining', amount_dollars: 17 });
    ops.changeOutsideAgent();
    assert.match(await tool(buildTools(ops, { turnId: 't3', userInitiated: true, bankFresh: true }), 'undo_last_change').run({}), /Error: Your budget changed/);
    assert.equal(remaining(ops.stateNow, 'dining'), 5500);
  });
  await t.test('location turns and stale bank data cannot move budget', async () => {
    const ops = memoryOps();
    assert.match(await tool(buildTools(ops, { turnId: 't2', userInitiated: false, bankFresh: true }), 'move_budget').run({ from: 'shopping', to: 'dining', amount_dollars: 17 }), /Refused/);
    assert.match(await tool(buildTools(ops, { turnId: 't3', userInitiated: true, bankFresh: false }), 'move_budget').run({ from: 'shopping', to: 'dining', amount_dollars: 17 }), /Nessie/);
    assert.equal(remaining(ops.stateNow, 'dining'), 3800);
  });
  await t.test('impossible moves are explained, not applied', async () => {
    const ops = memoryOps();
    const result = await tool(buildTools(ops, { turnId: 't1', userInitiated: true, bankFresh: true }), 'move_budget').run({ from: 'shopping', to: 'dining', amount_dollars: 500 });
    assert.match(result, /Only \$60 is available/);
    assert.equal(remaining(ops.stateNow, 'dining'), 3800);
  });
});

test('model tool calls cannot approve negative, forwarded, or replaced actions', async () => {
  for (const [text, replace, expected] of [
    ['NO, do not move any money', false, 0], ['Friends: YES', false, 0],
    ['yes', false, 1], ['YES', true, 0],
  ]) {
    const ops = memoryOps();
    const proposal = { kind: 'transfer', from: 'shopping', to: 'dining', amountCents: 1700, turn: 'earlier' };
    await ops.setPending(proposal);
    const client = { beta: { messages: { toolRunner: ({ tools }) => (async function* () {
      if (replace) await ops.setPending(proposal);
      const reply = await tool(tools, 'confirm_pending_action').run({ action_id: ops.pending().id });
      yield { stop_reason: 'end_turn', content: [{ type: 'text', text: reply }] };
    })() } } };
    await runAgent({ ops, text, client });
    assert.equal(ops.stateNow.adjustments.length, expected, text + (replace ? ' with replacement' : ''));
  }
});

test('runAgent drives the tool loop and keeps text history', async () => {
  const requests = [];
  const replies = [
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu1', name: 'get_budget_overview', input: {} }] },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'You have $38 left for Dining.' }] },
  ];
  const fetch = async (url, init) => {
    requests.push(JSON.parse(init.body));
    const body = { id: `msg${requests.length}`, type: 'message', role: 'assistant', model: 'claude-opus-5-5', usage: { input_tokens: 1, output_tokens: 1 }, ...replies[requests.length - 1] };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const ops = memoryOps();
  const reply = await runAgent({ ops, text: 'How much for dinner?', client: new Anthropic({ apiKey: 'test', fetch, maxRetries: 0 }) });
  assert.equal(reply, 'You have $38 left for Dining.');
  assert.match(JSON.stringify(requests[1].messages.at(-1).content[0].content), /\$38\.00/);
  assert.deepEqual(ops.history().map(m => m.role), ['user', 'assistant']);
});

test('SMS text fits the Bandwidth trial limits', () => {
  assert.equal(toSmsAscii('It’s “fine” — café 😀'), 'It\'s "fine" - cafe');
  const parts = splitSms('Almost! You have $38 left in Dining, so a $55 dinner puts you $17 over. Two options:\nKEEP: I move $17 from Groceries to Dining\nALT: I find a cheaper spot nearby.');
  assert.ok(parts.length === 2 && parts.every(p => p.length <= 129 && !/[^\x20-\x7E]/.test(p)));
  assert.ok(splitSms('x'.repeat(300)).every(p => p.length <= 129));
});

test('place kinds map to budget categories', () => {
  assert.equal(categoryForKind('restaurant'), 'dining');
  assert.equal(categoryForKind('supermarket'), 'groceries');
  assert.equal(categoryForKind('house'), null);
});

// A server wired to a fake agent that drives ops the way Claude's tools would.
async function agentServer(t, { agent, locate, geocode = async () => null, pay = async () => 'p1', send, sync: syncOverride } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'pocket-agent-'));
  const sent = [];
  const env = { BANDWIDTH_WEBHOOK_TOKEN: 'hook', BANDWIDTH_APPLICATION_ID: 'app', BANDWIDTH_PHONE_NUMBER: '+12025550100', BANDWIDTH_VERIFIED_PHONE_NUMBER: '+12025550101' };
  let syncs = 0;
  const app = createDemoServer({ file: join(dir, 'state.json'), env, token: 'pair', sync: async s => { syncs++; return syncOverride ? syncOverride(s, syncs) : s; }, send: send || (async text => { sent.push(text); return `sent-${sent.length}`; }), agent, pay, locate, geocode });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  t.after(async () => { await new Promise(r => app.server.close(r)); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const api = (path, value) => fetch(base + path, { method: value ? 'POST' : 'GET', headers: { Cookie: 'pocket=pair', 'Content-Type': 'application/json' }, body: value && JSON.stringify(value) }).then(r => r.json());
  const text = (id, body) => fetch(base + '/webhooks/bandwidth?token=hook', { method: 'POST', body: JSON.stringify([{ type: 'message-received', message: { id, text: body, from: env.BANDWIDTH_VERIFIED_PHONE_NUMBER, to: [env.BANDWIDTH_PHONE_NUMBER], applicationId: 'app' } }]) }).then(() => app.resume());
  return { app, api, text, sent, syncs: () => syncs };
}

test('texts are answered by the agent and split for SMS', async t => {
  const agent = async ({ ops, text }) => {
    if (text === 'DINNER') { await ops.setPending({ kind: 'transfer', from: 'shopping', to: 'dining', amountCents: 1700, turn: 'a' }); return `${'Long reply. '.repeat(15)}Reply YES.`; }
    if (text === 'YES') { await ops.applyPending(ops.pending().id); return 'Done!'; }
    return '?';
  };
  const { api, text, sent } = await agentServer(t, { agent });
  await text('m1', 'DINNER');
  assert.ok(sent.length >= 2 && sent.every(s => s.length <= 129));
  assert.equal((await api('/api/state')).pendingReply, 'YES');
  await text('m2', 'YES');
  const state = await api('/api/state');
  assert.equal(remaining(state, 'dining'), 5500);
  assert.equal(state.adjustments.length, 1);
  assert.equal(state.conversation.at(-1).text, 'Done!');
});

test('a changed budget invalidates a Claude transfer review', async t => {
  const agent = async ({ ops, text }) => {
    if (text === 'DINNER') {
      await ops.setPending({ kind: 'transfer', from: 'shopping', to: 'dining', amountCents: 1700, turn: 'a' });
      return 'Move $17?';
    }
    await ops.applyPending(ops.pending().id);
    return 'Done.';
  };
  const { api } = await agentServer(t, {
    agent,
    sync: (state, count) => count > 1 ? { ...state, revision: state.revision + 1 } : state,
  });
  await api('/api/message', { text: 'DINNER' });
  const state = await api('/api/message', { text: 'YES' });
  assert.equal(state.adjustments.length, 0);
  assert.match(state.conversation.at(-1).text, /trouble connecting/);
});

test('approved ALT payments go through Nessie and are re-imported', async t => {
  const paid = [];
  const agent = async ({ ops, text }) => {
    if (text === 'ALT') { await ops.setPending({ kind: 'purchase', merchant: 'Taqueria', category: 'dining', amountCents: 1500, turn: 'a' }); return 'Pay $15?'; }
    await ops.applyPending(ops.pending().id); return 'Paid.';
  };
  const { api, syncs } = await agentServer(t, { agent, pay: async p => { paid.push(p); return 'p9'; } });
  await api('/api/message', { text: 'ALT' });
  const before = syncs();
  await api('/api/message', { text: 'yes' });
  assert.equal(paid[0].merchant, 'Taqueria');
  assert.ok(syncs() > before + 1, 'purchase is imported from Nessie after paying');

  // A failed payment remains available for reconciliation, not a second submission.
  const failing = await agentServer(t, { agent, pay: async () => { throw new Error('Nessie down'); } });
  await failing.api('/api/message', { text: 'ALT' });
  const state = await failing.api('/api/message', { text: 'yes' });
  assert.equal(state.pendingReply, 'YES');
  assert.match(state.conversation.at(-1).text, /trouble connecting/);
});

test('agent failures still get a reply text', async t => {
  const { text, sent } = await agentServer(t, { agent: async () => { throw new Error('Request timed out.'); } });
  await text('m1', 'hello');
  assert.match(sent[0], /trouble connecting/);
});

test('failure after a committed transfer does not claim nothing changed', async t => {
  const { api } = await agentServer(t, { agent: async ({ ops, text }) => {
    if (text === 'KEEP') {
      await ops.setPending({ kind: 'transfer', from: 'shopping', to: 'dining', amountCents: 1700, turn: 'a' });
      return 'Move $17?';
    }
    await ops.applyPending(ops.pending().id);
    throw new Error('Final response timed out');
  } });
  await api('/api/message', { text: 'KEEP' });
  const state = await api('/api/message', { text: 'YES' });
  assert.equal(state.adjustments.length, 1);
  assert.doesNotMatch(state.conversation.at(-1).text, /Nothing changed/i);
  assert.match(state.conversation.at(-1).text, /may have completed/);
});

test('location nudges', async t => {
  const calls = [];
  const agent = async args => { calls.push(args); return args.location.place === 'Library Cafe' ? 'SKIP' : 'Heads up: $38 left for Dining.'; };
  const places = { 1: { place: 'Gather', kind: 'restaurant', category: 'dining', city: 'Berkeley' }, 2: { place: 'Home', kind: 'house', category: null } };
  const { api, sent } = await agentServer(t, { agent, locate: async lat => places[lat] });

  assert.equal((await api('/api/location', { lat: 2, lng: 0 })).location.sent, false); // not a spending place
  assert.equal(calls.length, 0);
  const nudge = (await api('/api/location', { lat: 1, lng: 0 })).location;
  assert.equal(nudge.sent, true);
  assert.equal(calls[0].trigger, 'location');
  assert.equal(sent.at(-1), 'Heads up: $38 left for Dining.');
  assert.match((await api('/api/location', { lat: 1, lng: 0 })).location.reason, /recently/);
  assert.equal((await api('/api/location', { lat: 3, lng: 0, place: 'Library Cafe', category: 'dining' })).location.sent, false); // agent says SKIP
  assert.equal(sent.length, 1);
});

test('demo arrival runs the real location turn, even right after a nudge there', async t => {
  const calls = [];
  const agent = async args => { calls.push(args); return 'Heads up: $38 left for Dining.'; };
  const { api, sent } = await agentServer(t, { agent, locate: async () => ({ place: 'Gather', category: 'dining' }) });
  await api('/api/location', { lat: 1, lng: 0 }); // recent nudge at Gather
  assert.equal((await api('/api/demo-arrival', { delaySeconds: 0 })).scheduledInSeconds, 0);
  for (let i = 0; i < 50 && sent.length < 2; i++) await new Promise(r => setTimeout(r, 10));
  assert.equal(sent.length, 2);
  assert.equal(calls.at(-1).trigger, 'location');
  assert.equal(calls.at(-1).location.place, 'Gather');
});

test('a text move applies at once and a text undo reverses it on the server', async t => {
  const agent = async ({ ops, text }) => {
    if (text === 'MOVE') { await ops.moveBudget({ from: 'shopping', to: 'dining', amountCents: 2000 }); return 'Moved $20.'; }
    if (text === 'UNDO') { await ops.undoLast(); return 'Undone.'; }
    return '?';
  };
  const { api } = await agentServer(t, { agent });
  let state = await api('/api/message', { text: 'MOVE' });
  assert.equal(remaining(state, 'dining'), 5800);
  assert.equal(state.adjustments.length, 1);
  assert.equal(state.pendingReply, null);
  state = await api('/api/message', { text: 'UNDO' });
  assert.equal(remaining(state, 'dining'), 3800);
  assert.equal(remaining(state, 'shopping'), 6000);
  assert.equal(state.adjustments.length, 2);
  assert.equal(state.conversation.at(-1).text, 'Undone.');
});

test('saved recommendations carry map coordinates when a place can be found', async t => {
  const places = { Gather: { lat: 37.8697, lng: -122.2668 } };
  const agent = async ({ ops }) => {
    await ops.recommendations([
      { name: 'Gather', area: 'Berkeley', description: 'Cozy.', estimatedPrice: 25, sourceUrl: 'https://example.com/gather' },
      { name: 'Unmapped Cafe', area: 'Berkeley', description: 'Cheap.', estimatedPrice: 9, sourceUrl: 'https://example.com/cafe' },
    ]);
    return 'Saved.';
  };
  const { api } = await agentServer(t, { agent, geocode: async ({ name }) => places[name] ?? null });
  const state = await api('/api/message', { text: 'NEARBY' });
  assert.deepEqual(state.recommendations.map(p => [p.name, p.lat ?? null]), [['Gather', 37.8697], ['Unmapped Cafe', null]]);
});

test('a purchase approved after the budget changed is refused and not paid', async t => {
  const paid = [];
  const agent = async ({ ops, text }) => {
    if (text === 'ALT') { await ops.setPending({ kind: 'purchase', merchant: 'Taqueria', category: 'dining', amountCents: 1500, turn: 'a' }); return 'Pay $15?'; }
    await ops.applyPending(ops.pending().id); return 'Paid.';
  };
  const { api } = await agentServer(t, { agent, pay: async p => { paid.push(p); return 'p9'; },
    sync: (state, count) => count > 1 ? { ...state, revision: state.revision + 1 } : state });
  await api('/api/message', { text: 'ALT' });
  const state = await api('/api/message', { text: 'yes' });
  assert.equal(paid.length, 0);
  assert.match(state.conversation.at(-1).text, /trouble connecting|changed/);
});

test('two approvals that arrive together pay once', async t => {
  const paid = [];
  const agent = async ({ ops, text }) => {
    if (text === 'ALT') { await ops.setPending({ kind: 'purchase', merchant: 'Taqueria', category: 'dining', amountCents: 1500, turn: 'a' }); return 'Pay $15?'; }
    try { await ops.applyPending(ops.pending().id); return 'Paid.'; } catch (error) { return error.message; }
  };
  const { api } = await agentServer(t, { agent, pay: async p => { paid.push(p); await new Promise(r => setTimeout(r, 150)); return 'p9'; } });
  await api('/api/message', { text: 'ALT' });
  await Promise.all([api('/api/message', { text: 'yes' }), api('/api/message', { text: 'yes' })]);
  assert.equal(paid.length, 1);
});
