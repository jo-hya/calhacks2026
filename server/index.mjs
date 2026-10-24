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

const PENDING_TTL_MS = 30 * 60 * 1000;
const NUDGE_COOLDOWN_MS = 20 * 60 * 1000;
const MAX_HISTORY = 24;
const TROUBLE = 'Pocket is having trouble connecting right now. Nothing changed. Please text me again in a minute.';

// `agent` is the Claude agent (on when ANTHROPIC_API_KEY is set); without it the scripted
// responder in conversation.mjs answers, as before.
export function createDemoServer({ file = '.pocket/state.json', sync = syncNessie, send = sendSMS, env = process.env, initial, token = randomBytes(24).toString('hex'),
  agent = env.ANTHROPIC_API_KEY ? runAgent : null, pay = createAgentPurchase, clearAgentPurchases = deleteAgentPurchases, locate = lookupPlace } = {}) {
  mkdirSync(resolve(file, '..'), { recursive: true });
  let data = initial || (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { state: createSeed(), proposals: {}, messages: [], inbox: {}, outbox: [] });
  data = { ...data, agent: data.agent || { pending: null, history: [] } };
  const lastNudge = new Map();
  let queue = Promise.resolve();
  let syncWarning = '';
  const serial = fn => { const result = queue.then(fn); queue = result.catch(() => {}); return result; };
  function save(next) { writeFileSync(file + '.tmp', JSON.stringify(next)); renameSync(file + '.tmp', file); data = next; }
  function view() { return { ...data.state, connectionWarning: syncWarning, conversation: data.messages, pendingReply: agent ? (livePending() ? 'YES' : null) : data.proposals.simulation ? `YES ${data.proposals.simulation.code}` : null, agentEnabled: Boolean(agent), smsStatus: data.outbox.slice(-5).map(o => ({ status: o.status, error: o.error })), phone: env.BANDWIDTH_PHONE_NUMBER || '', invitation: INVITATION }; }
  async function refresh() {
    try { const state = await sync(data.state); save({ ...data, state }); syncWarning = ''; }
    catch (error) { syncWarning = 'Nessie could not refresh. Showing the last saved purchases; text approvals require a fresh connection.'; throw error; }
  }
  function livePending() {
    const p = data.agent.pending;
    return p && p.expiresAt > Date.now() ? p : null;
  }
  const saveAgent = fields => save({ ...data, agent: { ...data.agent, ...fields } });

  // How the Claude agent reads and changes the shared data. Every change runs in `serial`,
  // but Claude's thinking happens outside it, so the app stays responsive during a turn.
  const ops = {
    state: () => data.state,
    pending: livePending,
    history: () => data.agent.history,
    setPending: action => serial(() => {
      // Validate up front so the agent can't ask the user to approve something impossible.
      if (action.kind === 'transfer') proposeTransfer(data.state, { ...action, id: 'check' });
      const pending = { ...action, id: `act-${randomBytes(4).toString('hex')}`, expiresAt: Date.now() + PENDING_TTL_MS };
      saveAgent({ pending });
      return pending;
    }),
    clearPending: () => serial(() => saveAgent({ pending: null })),
    appendHistory: (...messages) => serial(() => {
      const history = [...data.agent.history, ...messages].slice(-MAX_HISTORY);
      while (history.length && history[0].role !== 'user') history.shift();
      saveAgent({ history });
    }),
    async applyPending(id) {
      // Claim the action first so it can't run twice.
      const action = await serial(() => {
        const p = livePending();
        if (!p || p.id !== id) throw new Error('That action is no longer pending.');
        if (p.kind === 'transfer') {
          const proposal = proposeTransfer(data.state, { ...p, id: p.id });
          save({ ...data, state: confirmTransfer(data.state, proposal), agent: { ...data.agent, pending: null } });
        } else saveAgent({ pending: null });
        return p;
      });
      if (action.kind !== 'purchase') return;
      // An approved ALT: pay through Nessie, then import it like any other purchase.
      try { await pay({ ...action, date: DEMO_DATE }); }
      catch (error) { await serial(() => saveAgent({ pending: action })); throw error; }
      await serial(refresh);
    },
  };

  const log = (...messages) => serial(() => save({ ...data, messages: [...data.messages, ...messages].slice(-100) }));
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
    try { answer = await agent({ ops, text, trigger: channel === 'sms' ? 'sms' : 'simulation', bankFresh: fresh }); }
    catch (error) { console.error('Agent error:', error.message); answer = TROUBLE; }
    await log({ who: 'You', text, channel }, { who: 'Pocket', text: answer, channel });
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
      if (url.pathname === `/pair/${token}` && req.method === 'GET') {
        res.writeHead(303, { 'Set-Cookie': `pocket=${token}; HttpOnly; SameSite=Strict; Max-Age=604800; Path=/${req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`, Location: '/', 'Referrer-Policy': 'no-referrer' }); res.end(); return;
      }
      if (url.pathname.startsWith('/api/')) {
        if (!(req.headers.cookie || '').split(';').some(c => c.trim() === `pocket=${token}`)) return json(401, { error: 'Open the pairing link printed by npm run demo on this device first.' });
        if (req.method === 'GET' && url.pathname === '/api/state') return json(200, view());
        if (req.method !== 'POST' || req.headers['content-type'] !== 'application/json') return json(400, { error: 'Expected a JSON POST.' });
        const input = await body(req);
        // These wait on Claude, so they run outside `serial` (their changes go through ops).
        if (url.pathname === '/api/message') {
          if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 1000) throw new Error('Invalid message.');
          await reply(input.text.trim(), 'simulation');
          return json(200, view());
        }
        if (url.pathname === '/api/location') return json(200, { ...view(), location: await nudge(input) });
        const result = await serial(async () => {
          if (url.pathname === '/api/sync') await refresh();
          else if (url.pathname === '/api/reset') {
            // Remove purchases the agent paid for, so the demo starts from the seed again.
            if (env.NESSIE_API_KEY) await clearAgentPurchases();
            const state = await sync(createSeed());
            // Keep processed SMS IDs and outbox so delayed callbacks cannot replay actions.
            save({ ...data, state: { ...state, revision: data.state.revision + 1 }, proposals: {}, messages: [], agent: { pending: null, history: [] } });
            lastNudge.clear();
          } else if (url.pathname === '/api/expense') save({ ...data, state: addExpense(data.state, { ...input, source: 'manual' }) });
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
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('lat and lng are required.');
    if (!agent) return { sent: false, reason: 'The Claude agent is off (no ANTHROPIC_API_KEY).' };
    let where = { place, category, city, region };
    if (!category) {
      try { where = { ...(await locate(lat, lng)), ...(place && { place }) }; }
      catch { return { sent: false, reason: 'Could not look up this location.' }; }
    }
    if (!where.category) return { sent: false, reason: 'Not a place where you usually spend.', place: where.place };
    const key = where.place || `${lat.toFixed(3)},${lng.toFixed(3)}`;
    if (Date.now() - (lastNudge.get(key) ?? 0) < NUDGE_COOLDOWN_MS) return { sent: false, reason: 'Already nudged here recently.', place: where.place };
    lastNudge.set(key, Date.now());
    let fresh = true;
    try { await serial(refresh); } catch { fresh = false; }
    let text;
    try { text = await agent({ ops, trigger: 'location', location: { lat, lng, ...where }, bankFresh: fresh }); }
    catch (error) { console.error('Agent error:', error.message); lastNudge.delete(key); return { sent: false, reason: 'Pocket could not reach Claude.' }; }
    if (!text || text === 'SKIP') return { sent: false, reason: 'Plenty of room in that budget.', place: where.place };
    await log({ who: 'Pocket', text, channel: 'sms' });
    await queueTexts(`nudge-${randomBytes(4).toString('hex')}`, text);
    await serial(sendQueued);
    return { sent: true, place: where.place, text };
  }

  return { server, token, refresh: () => serial(refresh), resume: processInbox };
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
    console.log(`Pocket connected demo: http://127.0.0.1:3002/pair/${app.token}`);
    console.log(`Phone: use your ngrok HTTPS host with /pair/${app.token}`);
    console.log(process.env.ANTHROPIC_API_KEY ? 'Claude agent active. Text Pocket from your verified phone.' : 'Scripted responder active (no ANTHROPIC_API_KEY). Text DINNER from your verified phone.');
    app.resume().catch(() => console.error('Pending SMS could not be processed.'));
  });
}
