import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createLocalIndex, createMossIndex, transactionDoc } from './memory.mjs';
import { buildTools } from './agent.mjs';
import { createDemoServer } from './index.mjs';
import { pairedCookie } from './test-helpers.mjs';

process.env.POCKET_WEB_SEARCH = 'off';
const quiet = { log() {}, warn() {}, error() {} };

test('local memory search ranks by shared words', async () => {
  const index = createLocalIndex();
  await index.upsert([{ id: 'mem:a', text: 'Vegetarian' }, { id: 'tx:1', text: 'Spent $6.50 at Boba Guys (dining) on 2026-10-20' }, { id: 'mem:b', text: 'Saving for a Tahoe trip' }]);
  assert.equal((await index.search('how much on boba'))[0].id, 'tx:1');
  assert.equal((await index.search('vegetarian food'))[0].id, 'mem:a');
  await index.remove(['mem:a']);
  assert.equal((await index.search('vegetarian')).length, 0);
});

test('Moss index: creates and loads the index, applies changes, queries locally', async () => {
  const calls = [];
  const client = {
    getIndex: async () => { calls.push('getIndex'); throw new Error('not found'); },
    createIndex: async (name, docs) => { calls.push(`createIndex:${name}:${docs.length}`); },
    loadIndex: async () => { calls.push('loadIndex'); },
    getDocs: async () => [],
    addDocs: async (name, docs) => { calls.push(`addDocs:${docs.map(d => d.id).join(',')}`); },
    deleteDocs: async (name, ids) => { calls.push(`deleteDocs:${ids.join(',')}`); },
    query: async (name, q) => ({ docs: [{ id: 'about', text: 'x', metadata: { kind: 'about' } }, { id: 'mem:a', text: 'Vegetarian', metadata: { kind: 'memory' }, score: 0.9 }], query: q }),
  };
  const index = createMossIndex({ projectId: 'p', projectKey: 'k', client, logger: quiet });
  await index.ready;
  await index.upsert([{ id: 'mem:a', text: 'Vegetarian', metadata: { kind: 'memory' } }]);
  await index.remove(['mem:z']);
  await new Promise(r => setTimeout(r, 10));
  assert.deepEqual(calls.slice(0, 3), ['getIndex', 'createIndex:lila-memory:1', 'loadIndex']);
  assert.ok(calls.includes('addDocs:mem:a') && calls.includes('deleteDocs:mem:z'));
  assert.deepEqual((await index.search('food')).map(d => d.id), ['mem:a']); // placeholder doc filtered out
});

test('transactions become searchable text', () => {
  assert.equal(transactionDoc({ id: 'n1', merchant: 'Sweetgreen', category: 'dining', amountCents: 1850, date: '2026-10-23' }).text, 'Spent $18.50 at Sweetgreen (dining) on 2026-10-23');
});

test('memory tools only save what the user said', async () => {
  const saved = [];
  const ops = { remember: async fact => { saved.push(fact); return { id: 'm1', text: fact }; }, forget: async () => true, recall: async () => [] };
  const tool = (ctx, name) => buildTools(ops, ctx).find(t => t.name === name);
  assert.match(await tool({ userInitiated: true, canEditMemory: true }, 'remember_about_user').run({ fact: 'Vegetarian' }), /Remembered/);
  assert.match(await tool({ userInitiated: false, canEditMemory: false }, 'remember_about_user').run({ fact: 'Likes steak' }), /Refused/);
  // A text can teach Lila a preference, but a forwarded text must not delete memories.
  assert.match(await tool({ userInitiated: true, canEditMemory: false }, 'remember_about_user').run({ fact: 'Likes tacos' }), /Remembered/);
  assert.match(await tool({ userInitiated: true, canEditMemory: false }, 'forget_about_user').run({ memory_id: 'm1' }), /Refused/);
  assert.deepEqual(saved, ['Vegetarian', 'Likes tacos']);
});

test('local index mirrors the saved data: evicted and reset docs are removed', async () => {
  const index = createLocalIndex();
  const memory = (id, text) => ({ id: `mem:${id}`, text, metadata: { kind: 'memory' } });
  index.sync([memory('a', 'Vegetarian'), memory('b', 'Tahoe trip')]);
  assert.equal((await index.search('vegetarian'))[0].id, 'mem:a');
  index.sync([memory('b', 'Tahoe trip')]); // 'a' was evicted or forgotten
  assert.equal(index.has('mem:a'), false);
  assert.equal((await index.search('vegetarian')).length, 0);
  index.sync([]); // reset
  assert.deepEqual(index.ids(), []);
});

test('Moss search drops docs no longer saved and weak matches', async () => {
  const client = {
    getIndex: async () => ({}),
    loadIndex: async () => {},
    getDocs: async () => [],
    addDocs: async () => {},
    deleteDocs: async () => {},
    query: async () => ({ docs: [
      { id: 'mem:gone', text: 'Old', metadata: { kind: 'memory' }, score: 0.9 },
      { id: 'mem:weak', text: 'Unrelated', metadata: { kind: 'memory' }, score: 0.05 },
      { id: 'mem:a', text: 'Vegetarian', metadata: { kind: 'memory' }, score: 0.8 },
    ] }),
  };
  const index = createMossIndex({ projectId: 'p', projectKey: 'k', client, logger: quiet });
  await index.ready;
  index.sync([{ id: 'mem:a', text: 'Vegetarian', metadata: { kind: 'memory' } }]);
  assert.deepEqual((await index.search('food')).map(d => d.id), ['mem:a']);
});

test('a fact from a text is labelled and stays out of replies until confirmed', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'lila-provenance-'));
  const app = createDemoServer({ file: join(dir, 'state.json'), env: {}, token: 'pair', sync: async s => s, send: async () => 'id', memoryIndex: createLocalIndex() });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  t.after(async () => { await new Promise(r => app.server.close(r)); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const cookie = await pairedCookie(base, 'pair');
  const post = (path, body) => fetch(base + path, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
  await app.ops.remember('Vegetarian', 'text');
  await app.ops.remember('Saving for Tahoe', 'app');
  assert.equal((await app.ops.recall('vegetarian')).length, 0);
  assert.equal((await app.ops.recall('tahoe')).length, 1);
  const state = await (await fetch(base + '/api/state', { headers: { Cookie: cookie } })).json();
  assert.deepEqual(state.memories.map(m => [m.text, m.source, m.confirmed]), [['Vegetarian', 'text', false], ['Saving for Tahoe', 'app', true]]);
  await post('/api/memories/confirm', { id: state.memories[0].id });
  assert.equal((await app.ops.recall('vegetarian')).length, 1);
});

test('the agent tells the model that a text-sourced fact is pending confirmation', async () => {
  const ops = { remember: async (fact, source) => ({ id: 'm1', text: fact, source }), forget: async () => true, recall: async () => [] };
  const result = await buildTools(ops, { userInitiated: true, canEditMemory: false, source: 'text' }).find(t => t.name === 'remember_about_user').run({ fact: 'Likes tacos' });
  assert.match(result, /until the user confirms/);
});

async function server(t, { agent, voice } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'lila-voice-'));
  const app = createDemoServer({ file: join(dir, 'state.json'), env: {}, token: 'pair', sync: async s => s, send: async () => 'id', agent, voice, memoryIndex: createLocalIndex() });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  t.after(async () => { await new Promise(r => app.server.close(r)); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const cookie = await pairedCookie(base, 'pair');
  const api = (path, body, type = 'application/json') => fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { Cookie: cookie, 'Content-Type': type }, body: type === 'application/json' && body !== undefined ? JSON.stringify(body) : body });
  return { api };
}

test('hold-to-talk: transcribe, answer with memories, speak, report what was remembered', async t => {
  const seen = [];
  const agent = async ({ ops, text, trigger }) => {
    seen.push({ text, trigger, recalled: await ops.recall(text) });
    if (/vegetarian/i.test(text)) await ops.remember('Vegetarian');
    return 'Gather fits your $38.';
  };
  const voice = { enabled: true, transcribe: async (buf, type) => (assert.equal(type, 'audio/webm'), buf.toString()), speak: async text => Buffer.from(`mp3:${text}`) };
  const { api } = await server(t, { agent, voice });

  const res = await (await api('/api/voice', 'Dinner tonight? I am vegetarian', 'audio/webm')).json();
  assert.equal(res.voice.transcript, 'Dinner tonight? I am vegetarian');
  assert.equal(seen[0].trigger, 'voice');
  assert.equal(res.voice.reply, 'Gather fits your $38.');
  assert.equal(Buffer.from(res.voice.audio, 'base64').toString(), 'mp3:Gather fits your $38.');
  assert.deepEqual(res.voice.remembered.map(m => m.text), ['Vegetarian']);
  assert.deepEqual(res.memories.map(m => m.text), ['Vegetarian']);

  // The next turn finds the memory before Claude even asks.
  await api('/api/voice', 'something vegetarian nearby', 'audio/webm');
  assert.ok(seen[1].recalled.some(m => m.text === 'Vegetarian'));

  // Read a heads-up aloud.
  const speech = await api('/api/speak', { text: 'Heads up' });
  assert.equal(speech.headers.get('content-type'), 'audio/mpeg');
  assert.equal(Buffer.from(await speech.arrayBuffer()).toString(), 'mp3:Heads up');
});

test('memories can be added, forgotten, and are cleared on reset', async t => {
  const { api } = await server(t, { agent: async () => 'ok' });
  let state = await (await api('/api/memories', { text: 'Saving for Tahoe' })).json();
  assert.equal(state.memories.length, 1);
  state = await (await api('/api/memories', { text: 'saving for tahoe' })).json(); // no duplicates
  assert.equal(state.memories.length, 1);
  state = await (await api('/api/memories/forget', { id: state.memories[0].id })).json();
  assert.equal(state.memories.length, 0);
  await api('/api/memories', { text: 'Vegetarian' });
  state = await (await api('/api/reset', {})).json();
  assert.equal(state.memories.length, 0);
});

test('voice routes explain when voice is off', async t => {
  const { api } = await server(t, { agent: async () => 'ok', voice: { enabled: false } });
  const res = await api('/api/voice', 'hi', 'audio/webm');
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /CARTESIA_API_KEY/);
  assert.equal((await (await api('/api/state')).json()).voiceEnabled, false);
});

test('starter prompts get spoken answers; voice off returns captions only', async t => {
  const spoken = [];
  const voice = { enabled: true, transcribe: async buf => buf.toString(), speak: async text => { spoken.push(text); return Buffer.from('mp3'); } };
  const { api } = await server(t, { agent: async ({ text, trigger }) => `${trigger}: ${text}`, voice });
  const on = await (await api('/api/voice/ask', { text: 'How am I doing with my spending?' })).json();
  assert.equal(on.voice.reply, 'voice: How am I doing with my spending?');
  assert.ok(on.voice.audio);
  const off = await (await api('/api/voice/ask', { text: 'Help me save', speak: false })).json();
  assert.equal(off.voice.audio, null);
  const recorded = await (await api('/api/voice?speak=0', 'hello', 'audio/webm')).json();
  assert.equal(recorded.voice.audio, null);
  assert.equal(spoken.length, 1);
});

test('a spoken "Yes." approves, but not "yes, but wait" or "No."', async () => {
  const { runAgent } = await import('./agent.mjs');
  for (const [text, approved] of [['Yes.', true], ['yes!', true], ['yes, but wait', false], ['No.', false]]) {
    let pending = { id: 'act-1', kind: 'transfer', turn: 'earlier' };
    let applied = 0;
    const ops = { state: () => ({ transactions: [], budgets: {}, period: '2026-10' }), pending: () => pending, history: () => [], recall: async () => [], appendHistory: async () => {}, applyPending: async () => { applied++; pending = null; } };
    const client = { beta: { messages: { toolRunner: ({ tools }) => (async function* () {
      const reply = await tools.find(t => t.name === 'confirm_pending_action').run({ action_id: 'act-1' });
      yield { stop_reason: 'end_turn', content: [{ type: 'text', text: reply }] };
    })() } } };
    await runAgent({ ops, text, trigger: 'voice', client });
    assert.equal(applied, approved ? 1 : 0, text);
  }
});
