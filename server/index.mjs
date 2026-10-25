import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createSeed, addExpense, confirmTransfer, proposeTransfer, DEMO_DATE } from '../src/lib/budget.js';
import { syncNessie, createAgentPurchase, deleteAgentPurchases } from './nessie.mjs';
import { respond, INVITATION } from './conversation.mjs';
import { sendSMS } from './bandwidth.mjs';
import { runAgent } from './agent.mjs';
import { splitSms } from './sms-text.mjs';
import { lookupPlace } from './place.mjs';
import { geocodePlace, locatePlaces } from './geocode.mjs';
import { updateProfile, editExpense, DEFAULT_PROFILE } from '../src/lib/preferences.js';
import { createVoice } from './voice.mjs';
import { createMemoryIndex, memoryDoc, transactionDoc } from './memory.mjs';

const PENDING_TTL_MS = 30 * 60 * 1000;
const NUDGE_COOLDOWN_MS = 20 * 60 * 1000;
const DEMO_ARRIVAL = { place: 'Gather', category: 'dining', lat: 37.8697, lng: -122.2668, city: 'Berkeley', region: 'California' };
const MAX_HISTORY = 24;
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const MAX_MEMORIES = 50;
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const TROUBLE = 'Lila is having trouble connecting. An approved action may have completed. Check the app before trying again.';
// Everything Lila can search for: saved memories and purchases.
const indexDocs = data => [...data.memories.map(memoryDoc), ...data.state.transactions.map(transactionDoc)];

// `agent` is the Claude agent (on when ANTHROPIC_API_KEY is set); without it the scripted
// responder in conversation.mjs answers, as before.
export function createDemoServer({ file = '.pocket/state.json', sync = syncNessie, send = sendSMS, env = process.env, initial, token = randomBytes(24).toString('hex'),
  agent = env.ANTHROPIC_API_KEY ? runAgent : null, pay = createAgentPurchase, clearAgentPurchases = deleteAgentPurchases, locate = lookupPlace, geocode = geocodePlace,
  voice = createVoice({ env }), memoryIndex = createMemoryIndex({ env }) } = {}) {
  mkdirSync(resolve(file, '..'), { recursive: true });
  let data = initial || (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { state: createSeed(), proposals: {}, messages: [], inbox: {}, outbox: [] });
  data = { ...data, agent: data.agent || { pending: null, history: [] }, memories: data.memories || [] };
  // Saved demos from before a category existed get its seed budget and plans.
  data = { ...data, state: { ...data.state, budgets: { ...createSeed().budgets, ...data.state.budgets }, plans: data.state.plans ?? createSeed().plans } };
  // Search covers what the user told Lila plus their purchases.
  memoryIndex.sync(indexDocs(data));
  const lastNudge = new Map();
  const sessions = new Map(); // session cookie -> expiry time
  const paying = new Set();
  let queue = Promise.resolve();
  let syncWarning = '';
  const serial = fn => { const result = queue.then(fn); queue = result.catch(() => {}); return result; };
  // Every save keeps the search index in step with the saved memories and purchases.
  function save(next) { writeFileSync(file + '.tmp', JSON.stringify(next)); renameSync(file + '.tmp', file); data = next; memoryIndex.sync(indexDocs(next)); }
  function view() { return { ...data.state, connectionWarning: syncWarning, conversation: data.messages, pendingReply: agent ? (livePending() ? 'YES' : null) : data.proposals.simulation ? `YES ${data.proposals.simulation.code}` : null, agentEnabled: Boolean(agent), voiceEnabled: voice.enabled, memories: data.memories, smsStatus: data.outbox.slice(-5).map(o => ({ status: o.status, error: o.error })), phone: env.BANDWIDTH_PHONE_NUMBER || '', invitation: INVITATION }; }
  async function refresh() {
    try {
      const state = await sync(data.state);
      save({ ...data, state });
      syncWarning = '';
    }
    catch (error) { syncWarning = 'Nessie could not refresh. Showing the last saved purchases; text approvals require a fresh connection.'; throw error; }
  }
  function livePending() {
    const p = data.agent.pending;
    return p && (p.attempted || p.expiresAt > Date.now()) ? p : null;
  }
  const saveAgent = fields => save({ ...data, agent: { ...data.agent, ...fields } });

  // How the Claude agent reads and changes the shared data. Every change runs in `serial`,
  // but Claude's thinking happens outside it, so the app stays responsive during a turn.
  // Budget moves and profile changes the user asks for by text apply at once. The last one is
  // kept so a later "undo" can reverse it, as long as the budgets still match what it produced.
  const changeKey = state => JSON.stringify([state.budgets, state.profile?.name, state.profile?.area, state.profile?.preferences]);
  const saveChange = (state, undo) => save({ ...data, state, agent: { ...data.agent, lastChange: { undo, after: changeKey(state) } } });
  const ops = {
    state: () => data.state,
    updateProfile: input => serial(() => { save({ ...data, state: updateProfile(data.state, input) }); return data.state.profile; }),
    moveBudget: ({ from, to, amountCents }) => serial(() => {
      const before = data.state;
      const state = confirmTransfer(before, { id: `move-${randomBytes(4).toString('hex')}`, from, to, amountCents, revision: before.revision, expiresAt: Date.now() + 60 * 1000 });
      saveChange(state, { kind: 'transfer', from: to, to: from, amountCents });
    }),
    updateProfileNow: input => serial(() => {
      const profile = { ...DEFAULT_PROFILE, ...data.state.profile };
      const previous = { name: profile.name, area: profile.area, preferences: profile.preferences, budgets: { ...data.state.budgets } };
      saveChange(updateProfile(data.state, { ...input, onboarded: true }), { kind: 'profile', input: previous });
    }),
    undoLast: () => serial(() => {
      const last = data.agent.lastChange;
      if (!last) throw new Error('There is no recent change to undo.');
      if (changeKey(data.state) !== last.after) throw new Error('Your budget changed after that, so it can’t be undone automatically. Tell Lila what you want instead.');
      const { undo } = last;
      const state = undo.kind === 'transfer'
        ? confirmTransfer(data.state, { id: `undo-${randomBytes(4).toString('hex')}`, from: undo.from, to: undo.to, amountCents: undo.amountCents, revision: data.state.revision, expiresAt: Date.now() + 60 * 1000 })
        : updateProfile(data.state, undo.input);
      save({ ...data, state, agent: { ...data.agent, lastChange: null } });
    }),
    recommendations: async items => {
      const places = await locatePlaces(items, geocode);
      return serial(() => { save({ ...data, state: { ...data.state, recommendations: places, recommendationsAt: new Date().toISOString() } }); });
    },
    pending: livePending,
    history: () => data.agent.history,
    setPending: action => serial(() => {
      if (data.agent.pending?.attempted) throw new Error('Check the previous payment with YES before proposing another action; its outcome is uncertain.');
      // Validate up front so the agent can't ask the user to approve something impossible.
      if (action.kind === 'transfer') proposeTransfer(data.state, { ...action, id: 'check' });
      if (action.kind === 'edit') editExpense(data.state, action.expense);
      if (action.kind === 'expense') addExpense(data.state, { ...action.expense, id: 'check' });
      if (action.kind === 'profile') updateProfile(data.state, action.input);
      const pending = {
        ...action,
        id: `act-${randomBytes(4).toString('hex')}`,
        // Keep the exact financial revision that the user is being asked to approve.
        // Approval must be renewed when transactions or allocations change.
        revision: data.state.revision,
        expiresAt: Date.now() + PENDING_TTL_MS,
      };
      saveAgent({ pending });
      return pending;
    }),
    clearPending: () => serial(() => {
      if (data.agent.pending?.attempted) throw new Error('The payment was already submitted and cannot be cancelled here. Reply YES to check its status.');
      saveAgent({ pending: null });
    }),
    appendHistory: (...messages) => serial(() => {
      const history = [...data.agent.history, ...messages].slice(-MAX_HISTORY);
      while (history.length && history[0].role !== 'user') history.shift();
      saveAgent({ history });
    }),
    // Memory (Moss): facts the user told Lila, plus purchases, searchable by meaning.
    async recall(query, topK = 4) {
      // Facts from a forwarded text stay out of replies until the user confirms them in the app.
      const unconfirmed = new Set(data.memories.filter(m => !m.confirmed).map(m => `mem:${m.id}`));
      return (await memoryIndex.search(query, topK)).filter(d => !unconfirmed.has(d.id)).map(d => ({ id: d.id, kind: d.metadata?.kind, text: d.text }));
    },
    confirm: id => serial(() => {
      const key = String(id).replace(/^mem:/, '');
      if (!data.memories.some(m => m.id === key)) return false;
      save({ ...data, memories: data.memories.map(m => m.id === key ? { ...m, confirmed: true } : m) });
      return true;
    }),
    remember: (fact, source = 'app') => serial(() => {
      const text = fact.trim();
      const existing = data.memories.find(m => m.text.toLowerCase() === text.toLowerCase());
      if (existing) return existing;
      const memory = { id: randomBytes(4).toString('hex'), text, createdAt: new Date().toISOString(), source, confirmed: source !== 'text' };
      save({ ...data, memories: [...data.memories, memory].slice(-MAX_MEMORIES) });
      return memory;
    }),
    forget: id => serial(() => {
      const key = String(id).replace(/^mem:/, '');
      if (!data.memories.some(m => m.id === key)) return false;
      save({ ...data, memories: data.memories.filter(m => m.id !== key) });
      return true;
    }),
    async applyPending(id) {
      // Claim the action first so it can't run twice.
      const action = await serial(() => {
        const p = livePending();
        if (!p || p.id !== id) throw new Error('That action is no longer pending.');
        // Approval applies to the budget revision it was proposed on. A purchase is re-checked too,
        // unless this is a retry after a failed payment (the retry only looks for the original purchase).
        const checked = ['transfer', 'edit', 'expense', 'profile'].includes(p.kind) || (p.kind === 'purchase' && !p.attempted);
        if (checked && p.revision !== data.state.revision) {
          throw new Error('Your budget changed since this review. Ask Lila for a fresh proposal before approving it.');
        }
        if (p.kind === 'purchase') saveAgent({ pending: { ...p, attempted: true } });
        else {
          const state = p.kind === 'transfer' ? confirmTransfer(data.state, proposeTransfer(data.state, { ...p, id: p.id }))
            : p.kind === 'edit' ? editExpense(data.state, p.expense)
            : p.kind === 'profile' ? updateProfile(data.state, p.input)
            : addExpense(data.state, { ...p.expense, id: p.id, source: 'manual' });
          save({ ...data, state, agent: { ...data.agent, pending: null } });
        }
        return { ...p, reconcileOnly: Boolean(p.attempted) };
      });
      if (action.kind !== 'purchase') return;
      // An approved ALT: pay through Nessie, then import it like any other purchase.
      // Persist the attempt before contacting Nessie. After a timeout or restart,
      // retry only looks up this action's purchase; it must never submit it again.
      // Two approvals that arrive together must not both reach Nessie.
      if (paying.has(id)) throw new Error('That payment is already being processed. Check the app before trying again.');
      paying.add(id);
      try { await pay({ ...action, date: DEMO_DATE }); }
      finally { paying.delete(id); }
      await serial(() => { if (data.agent.pending?.id === id) saveAgent({ pending: null }); });
      await serial(refresh);
    },
  };

  // `at` lets the app's chat show just the current conversation.
  const log = (...messages) => serial(() => { const at = new Date().toISOString(); save({ ...data, messages: [...data.messages, ...messages.map(m => ({ ...m, at }))].slice(-100) }); });
  const queueTexts = (id, text) => serial(() => save({ ...data, outbox: [...data.outbox, ...splitSms(text).map((part, i) => ({ id: i ? `${id}-${i + 1}` : id, text: part, status: 'queued' }))] }));

  // One reply to a user message, from Claude or (without a key) the scripted responder.
  async function reply(text, channel) {
    let fresh = true;
    try { await serial(refresh); } catch { fresh = false; }
    if (!agent) {
      return serial(() => {
        const next = fresh ? respond(data, text, channel) : { ...data, reply: 'Nessie is unavailable. No budget changes made. Please try again shortly.' };
        save(next);
        return next.reply;
      });
    }
    let answer;
    try { answer = await agent({ ops, text, trigger: ['sms', 'voice'].includes(channel) ? channel : 'simulation', bankFresh: fresh }); }
    catch (error) { console.error('Agent error:', error.message); answer = TROUBLE; }
    await log({ who: 'You', text, channel }, { who: 'Lila', text: answer, channel });
    return answer;
  }

  // Inbox events are answered one at a time, in order; texts go out after each answer.
  let inboxQueue = Promise.resolve();
  const processInbox = () => (inboxQueue = inboxQueue.then(drain).catch(() => console.error('SMS processing failed; pending messages retained.')));
  async function drain() {
    for (const [id, event] of Object.entries(data.inbox)) {
      if (event.done) continue;
      const answer = await reply(event.text, 'sms');
      await serial(() => save({ ...data, inbox: { ...data.inbox, [id]: { ...event, done: true } } }));
      await queueTexts(id, answer);
    }
    await serial(sendQueued);
  }
  async function sendQueued() {
    for (const item of data.outbox.filter(o => o.status === 'queued')) {
      const update = fields => save({ ...data, outbox: data.outbox.map(o => o.id === item.id ? { ...o, ...fields } : o) });
      // Persist before sending: a crash after provider acceptance must not blindly resend.
      update({ status: 'sending' });
      try { const providerId = await send(item.text); update({ status: 'accepted', providerId }); }
      catch (error) { update({ status: 'failed', error: error.message }); }
    }
  }
  async function body(req) {
    const chunks = []; let size = 0;
    for await (const c of req) { size += c.length; if (size > 100000) throw new Error('Request too large.'); chunks.push(c); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    try {
      if (url.pathname === '/health') return json(200, { ok: true });
      if (url.pathname === '/webhooks/bandwidth' && req.method === 'POST') {
        if (!env.BANDWIDTH_WEBHOOK_TOKEN || url.searchParams.get('token') !== env.BANDWIDTH_WEBHOOK_TOKEN) return json(401, { error: 'Unauthorized' });
        const events = await body(req);
        if (!Array.isArray(events) || events.some(e => !e || typeof e.type !== 'string' || !e.message || typeof e.message.id !== 'string' || (e.type === 'message-received' && typeof e.message.text !== 'string'))) return json(400, { error: 'Invalid callbacks' });
        // This synchronous write cannot interleave with another commit. Acknowledge
        // immediately even while a queued Nessie read or outbound SMS is in flight.
        {
          const inbox = { ...data.inbox }; let outbox = data.outbox;
          for (const e of events) {
            const m = e.message;
            if (m.applicationId !== env.BANDWIDTH_APPLICATION_ID) continue;
            if (e.type === 'message-received') {
              if (m.from !== env.BANDWIDTH_VERIFIED_PHONE_NUMBER || !Array.isArray(m.to) || m.to.length !== 1 || m.to[0] !== env.BANDWIDTH_PHONE_NUMBER || m.id.startsWith('pocket-simulated-')) continue;
              if (!inbox[m.id]) inbox[m.id] = { text: m.text, done: false };
            } else if (['message-delivered', 'message-failed'].includes(e.type)) {
              outbox = outbox.map(o => o.providerId === m.id ? { ...o, status: e.type === 'message-delivered' ? 'delivered' : 'failed', error: e.type === 'message-failed' ? 'Carrier reported delivery failure.' : undefined } : o);
            }
          }
          save({ ...data, inbox, outbox });
        }
        res.writeHead(204); res.end();
        setImmediate(processInbox);
        return;
      }
      // The printed pairing token only exchanges for a random session cookie, so the link
      // itself is never a bearer credential for the API. Sessions expire and reset on restart.
      if (url.pathname === `/pair/${token}` && req.method === 'GET') {
        const session = randomBytes(32).toString('hex');
        sessions.set(session, Date.now() + SESSION_MS);
        res.writeHead(303, { 'Set-Cookie': `pocket=${session}; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MS / 1000}; Path=/${req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`, Location: '/', 'Referrer-Policy': 'no-referrer' }); res.end(); return;
      }
      if (url.pathname.startsWith('/api/')) {
        const session = (req.headers.cookie || '').split(';').map(c => c.trim()).find(c => c.startsWith('pocket='))?.slice('pocket='.length);
        if (!session || !(sessions.get(session) > Date.now())) { sessions.delete(session); return json(401, { error: 'Open the pairing link printed by npm run demo on this device first.' }); }
        if (req.method === 'GET' && url.pathname === '/api/state') return json(200, view());
        // Voice takes a raw recording, so it comes before the JSON-only check below.
        if (req.method === 'POST' && url.pathname === '/api/voice') { const result = await talk(req, url); return json(200, { ...view(), voice: result }); }
        if (req.method !== 'POST' || req.headers['content-type'] !== 'application/json') return json(400, { error: 'Expected a JSON POST.' });
        const input = await body(req);
        // These wait on Claude, so they run outside `serial` (their changes go through ops).
        if (url.pathname === '/api/message') {
          if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 1000) throw new Error('Invalid message.');
          await reply(input.text.trim(), 'simulation');
          return json(200, view());
        }
        // Await first: the view must reflect what the turn changed.
        if (url.pathname === '/api/location') { const result = await nudge(input); return json(200, { ...view(), location: result }); }
        if (url.pathname === '/api/demo-arrival') {
          // Presentation shortcut: act as if the phone just reported arriving at the demo
          // restaurant. The delay leaves time to lock the phone so the text lands while
          // Lila is closed. Everything after the location fix (agent, SMS) is the real path.
          const delaySeconds = Math.min(60, Math.max(0, Number(input.delaySeconds) || 0));
          lastNudge.delete(DEMO_ARRIVAL.place);
          setTimeout(() => nudge(DEMO_ARRIVAL).then(r => console.log('Demo arrival:', r.sent ? 'texted' : r.reason)).catch(e => console.error('Demo arrival failed:', e.message)), delaySeconds * 1000);
          return json(200, { ...view(), scheduledInSeconds: delaySeconds });
        }
        if (url.pathname === '/api/voice/ask') {
          // A typed or tapped question (e.g. a starter prompt) answered like a spoken one.
          if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 1000) throw new Error('Invalid message.');
          const result = await answerAloud(input.text.trim(), input.speak !== false);
          return json(200, { ...view(), voice: result });
        }
        if (url.pathname === '/api/speak') {
          // Reads a text aloud, e.g. a heads-up notification ("Listen").
          if (!voice.enabled) throw new Error('Voice is off (no CARTESIA_API_KEY).');
          if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 600) throw new Error('Invalid text.');
          const audio = await voice.speak(input.text.trim());
          res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' }); res.end(audio); return;
        }
        if (url.pathname === '/api/memories') {
          if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 140) throw new Error('Invalid memory.');
          await ops.remember(input.text);
          return json(200, view());
        }
        if (url.pathname === '/api/memories/confirm') {
          await ops.confirm(input.id);
          return json(200, view());
        }
        if (url.pathname === '/api/memories/forget') {
          await ops.forget(input.id);
          return json(200, view());
        }
        const result = await serial(async () => {
          if (url.pathname === '/api/sync') await refresh();
          else if (url.pathname === '/api/reset') {
            // Remove purchases the agent paid for, so the demo starts from the seed again.
            if (env.NESSIE_API_KEY) await clearAgentPurchases();
            const state = await sync(createSeed());
            // Keep processed SMS IDs and outbox so delayed callbacks cannot replay actions.
            // Keep who the user is (onboarding/preferences); budgets and spending return to the seed.
            save({ ...data, state: { ...state, profile: data.state.profile, revision: data.state.revision + 1 }, proposals: {}, messages: [], agent: { pending: null, history: [] }, memories: [] });
            lastNudge.clear();
          } else if (url.pathname === '/api/expense') save({ ...data, state: addExpense(data.state, { ...input, source: 'manual' }) });
          else if (url.pathname === '/api/expense/edit') save({ ...data, state: editExpense(data.state, input) });
          else if (url.pathname === '/api/profile') save({ ...data, state: updateProfile(data.state, input) });
          else if (url.pathname === '/api/proposal') {
            const p = proposeTransfer(data.state, input);
            save({ ...data, proposals: { ...data.proposals, [p.id]: p } });
            return p;
          } else if (url.pathname === '/api/transfer') {
            const p = data.proposals[input.id];
            if (!p) throw new Error('Review this transfer first.');
            await refresh(); save({ ...data, state: confirmTransfer(data.state, p) });
          } else throw new Error('Unknown operation.');
          return view();
        });
        return json(200, result);
      }
      if (req.method !== 'GET') return json(404, { error: 'Not found' });
      const root = resolve('dist');
      const target = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!target.startsWith(root + sep) || !existsSync(target)) return json(404, { error: 'Run npm run build first.' });
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }[extname(target)] || 'application/octet-stream';
      let content = readFileSync(target);
      if (extname(target) === '.html') content = content.toString().replace('<head>', '<head><script>window.__POCKET_CONNECTED__=true;</script>');
      res.writeHead(200, { 'Content-Type': mime, 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' }); res.end(content);
    } catch (error) { json(400, { error: error.message }); }
  });
  // The app reports where the phone is; if it's somewhere you'd spend money, the agent
  // decides whether a heads-up text is worth sending. `place`/`category` skip the lookup
  // (the demo's "pretend I'm at" buttons send them).
  async function nudge({ lat, lng, place, category, city, region }) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('A valid location is required.');
    if (data.state.profile?.locationEnabled === false) return { sent: false, reason: 'Location heads-ups are paused.' };
    if (!agent) return { sent: false, reason: 'The Claude agent is off (no ANTHROPIC_API_KEY).' };
    let where = { place, category, city, region };
    if (!category) {
      try { where = { ...(await locate(lat, lng)), ...(place && { place }) }; }
      catch { return { sent: false, reason: 'Could not look up this location.' }; }
    }
    await serial(() => save({ ...data, state: { ...data.state, lastLocation: { lat, lng, ...where, updatedAt: new Date().toISOString() } } }));
    if (!where.category) return { sent: false, reason: 'Not a place where you usually spend.', place: where.place };
    const key = where.place || `${lat.toFixed(3)},${lng.toFixed(3)}`;
    if (Date.now() - (lastNudge.get(key) ?? 0) < NUDGE_COOLDOWN_MS) return { sent: false, reason: 'Already nudged here recently.', place: where.place };
    lastNudge.set(key, Date.now());
    let fresh = true;
    try { await serial(refresh); } catch { fresh = false; }
    if (!fresh) { lastNudge.delete(key); return { sent: false, reason: 'Waiting for a fresh budget.' }; }
    let text;
    try { text = await agent({ ops, trigger: 'location', location: { lat, lng, ...where }, bankFresh: fresh }); }
    catch (error) { console.error('Agent error:', error.message); lastNudge.delete(key); return { sent: false, reason: 'Lila could not reach Claude.' }; }
    if (!text || text === 'SKIP') return { sent: false, reason: 'Plenty of room in that budget.', place: where.place };
    await log({ who: 'Lila', text, channel: 'sms' });
    await queueTexts(`nudge-${randomBytes(4).toString('hex')}`, text);
    await serial(sendQueued);
    await serial(() => save({ ...data, state: { ...data.state, locationInsight: { place: where.place, category: where.category, text, createdAt: new Date().toISOString() } } }));
    return { sent: true, place: where.place, text };
  }

  // Hold-to-talk: the app sends the recording, Lila answers like a text reply, and the
  // answer comes back as text plus spoken audio. `remembered` lists facts saved this turn
  // (the app shows "Remembered: ...").
  // `?speak=0` (Lila's voice turned off in the app) skips speech and returns captions only.
  async function talk(req, url) {
    if (!voice.enabled) throw new Error('Voice is off (no CARTESIA_API_KEY).');
    const type = String(req.headers['content-type'] || '');
    if (!type.startsWith('audio/')) throw new Error('Send the recording as audio/webm, audio/mp4 or audio/wav.');
    const chunks = []; let size = 0;
    for await (const c of req) { size += c.length; if (size > MAX_AUDIO_BYTES) throw new Error('Recording too long.'); chunks.push(c); }
    const transcript = await voice.transcribe(Buffer.concat(chunks), type);
    return answerAloud(transcript, url.searchParams.get('speak') !== '0');
  }

  // A spoken-style reply (also used by the voice screen's starter prompts), plus the facts
  // remembered during the turn.
  async function answerAloud(transcript, speak) {
    const known = new Set(data.memories.map(m => m.id));
    const answer = transcript ? await reply(transcript, 'voice') : "Sorry, I didn't catch that. Try again?";
    let audio = null;
    // Hands-free voice sends pauses and background noise too; stay quiet when no words were heard.
    if (speak && voice.enabled && transcript) {
      try { audio = (await voice.speak(answer)).toString('base64'); } catch (error) { console.error('Speech failed:', error.message); }
    }
    return { transcript, reply: answer, audio, audioType: 'audio/mpeg', remembered: data.memories.filter(m => !known.has(m.id)) };
  }

  return { server, token, refresh: () => serial(refresh), resume: processInbox, memoryIndex, ops };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = createDemoServer();
  try { await app.refresh(); } catch (error) {
    const saved = existsSync('.pocket/state.json') && JSON.parse(readFileSync('.pocket/state.json', 'utf8'));
    if (!saved?.state?.nessie) { console.error(error.message); process.exit(1); }
    console.warn('Nessie is temporarily unavailable. Serving the saved snapshot with a warning; approvals still require a fresh read.');
  }
  app.server.listen(3002, '127.0.0.1', () => {
    writeFileSync('.pocket/device-link.json', JSON.stringify({ token: app.token, port: 3002 }));
    console.log(`Lila connected demo: http://127.0.0.1:3002/pair/${app.token}`);
    console.log(`Phone: use your ngrok HTTPS host with /pair/${app.token}`);
    console.log(process.env.ANTHROPIC_API_KEY ? 'Claude agent active. Text Lila from your verified phone.' : 'Scripted responder active (no ANTHROPIC_API_KEY). Text DINNER from your verified phone.');
    console.log(`Voice: ${process.env.CARTESIA_API_KEY ? 'on (Cartesia)' : 'off (no CARTESIA_API_KEY)'} · Memory search: ${app.memoryIndex.kind === 'moss' ? 'Moss' : 'local (no MOSS_PROJECT_ID / MOSS_PROJECT_KEY)'}`);
    app.resume().catch(() => console.error('Pending SMS could not be processed.'));
  });
}
