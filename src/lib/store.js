import { createSeed, isValidState, confirmTransfer, addExpense } from './budget.js';

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
snapshot = load();

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
  transfer(proposal) { commit(confirmTransfer(warning ? snapshot : load(), proposal)); },
  addExpense(expense) { commit(addExpense(warning ? snapshot : load(), expense)); },
  reset() { commit(createSeed()); },
};
