import { createSeed, isValidState, confirmTransfer, addExpense, proposeTransfer } from './budget.js';

export const connected = Boolean(window.__POCKET_CONNECTED__);

export const STORAGE_KEY = 'pocket.demo.v1';
let snapshot = createSeed();
let warning = '';
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createSeed();
    const parsed = JSON.parse(raw);
    if (!isValidState(parsed)) throw new Error('Invalid saved demo');
    return parsed;
  } catch {
    warning = 'Saved demo data could not be loaded. The starting budget is shown; reset the demo to start fresh.';
    return snapshot;
  }
}
snapshot = connected ? createSeed() : load();
if (connected) warning = 'Connecting to your shared Pocket budget...';

async function request(path, body) {
  const response = await fetch(`/api/${path}`, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body && JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Pocket could not connect.');
  return result;
}
function publish(next) { snapshot = next; warning = next.connectionWarning || ''; listeners.forEach(listener => listener()); }
async function remote(path, body) { const next = await request(path, body); publish(next); return next; }
async function refresh() {
  try { await remote('state'); } catch (error) { warning = error.message; snapshot = { ...snapshot }; listeners.forEach(listener => listener()); }
}
if (connected) { refresh(); setInterval(refresh, 3000); }

function commit(next) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    warning = '';
  } catch {
    warning = 'Browser storage is unavailable. Changes last for this visit only.';
  }
  snapshot = next;
  listeners.forEach(listener => listener());
}

window.addEventListener('storage', event => {
  if (connected) return;
  if (event.key === STORAGE_KEY || event.key === null) {
    snapshot = load();
    listeners.forEach(listener => listener());
  }
});

// Browser-local demo adapter. Replace this boundary with authenticated server calls
// for Supabase/agent integration. localStorage is not an atomic multi-user database.
export const store = {
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  getSnapshot: () => snapshot,
  getWarning: () => warning,
  async propose(input) { return connected ? request('proposal', input) : proposeTransfer(snapshot, input); },
  async transfer(proposal) { if (connected) return remote('transfer', { id: proposal.id }); commit(confirmTransfer(warning ? snapshot : load(), proposal)); },
  async addExpense(expense) { if (connected) return remote('expense', expense); commit(addExpense(warning ? snapshot : load(), expense)); },
  async reset() { if (connected) return remote('reset', {}); commit(createSeed()); },
  message(text) { return remote('message', { text }); },
  sync() { return remote('sync', {}); },
};
