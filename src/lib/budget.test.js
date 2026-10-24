import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeed, getBudgets, getTotals, parseMoney, proposeTransfer, confirmTransfer, addExpense, isValidState } from './budget.js';

const transfer = (state, overrides = {}) => proposeTransfer(state, { from: 'shopping', to: 'dining', amountCents: 2000, id: 'transfer-1', now: 1000, ...overrides });

test('seed spending is derived from transactions and matches the dinner scenario', () => {
  const state = createSeed();
  assert.deepEqual(getTotals(state), { limit: 65000, spent: 36900, remaining: 28100 });
  assert.equal(getBudgets(state).find(b => b.id === 'dining').remaining, 3800);
  assert.equal(getBudgets(state).find(b => b.id === 'shopping').remaining, 6000);
  assert.equal(isValidState(state), true);
});

test('money input preserves cents and rejects invalid precision, signs, and extremes', () => {
  assert.equal(parseMoney('20.01'), 2001);
  assert.equal(parseMoney('0.10'), 10);
  for (const value of ['0', '-20', '1.001', '1e3', '', 'Infinity', '1000001']) assert.throws(() => parseMoney(value));
});

test('proposal is read-only; confirmation preserves total allocation and transactions', () => {
  const state = createSeed();
  const before = structuredClone(state);
  const proposal = transfer(state);
  assert.deepEqual(state, before);
  const next = confirmTransfer(state, proposal, 2000);
  assert.equal(getBudgets(next).find(b => b.id === 'dining').remaining, 5800);
  assert.equal(getBudgets(next).find(b => b.id === 'shopping').remaining, 4000);
  assert.deepEqual(getTotals(next), getTotals(state));
  assert.deepEqual(next.transactions, state.transactions);
  assert.equal(next.adjustments.length, 1);
  assert.equal(isValidState(next), true);
});

test('duplicate confirmation applies one adjustment even after expiration', () => {
  const state = createSeed(); const proposal = transfer(state);
  const next = confirmTransfer(state, proposal, 2000);
  assert.equal(confirmTransfer(next, proposal, 999999), next);
});

test('invalid transfers cannot change allocations', () => {
  const state = createSeed();
  for (const overrides of [{ from: 'missing' }, { to: 'shopping' }, { amountCents: 0 }, { amountCents: -100 }, { amountCents: 0.5 }, { amountCents: 6001 }]) assert.throws(() => transfer(state, overrides));
  assert.equal(state.revision, 0);
});

test('expired confirmation is rejected', () => {
  const state = createSeed();
  assert.throws(() => confirmTransfer(state, transfer(state), 301000), /expired/);
});

test('an intervening expense invalidates a proposal', () => {
  const state = createSeed(); const proposal = transfer(state);
  const next = addExpense(state, { id: 'new', merchant: 'Lunch', category: 'dining', amountCents: 500, date: '2026-10-24' });
  assert.throws(() => confirmTransfer(next, proposal, 2000), /budget changed/);
  assert.equal(next.adjustments.length, 0);
});

test('a second proposal from the old revision cannot execute after the first', () => {
  const state = createSeed();
  const first = transfer(state);
  const second = transfer(state, { id: 'transfer-2', amountCents: 5000 });
  const next = confirmTransfer(state, first, 2000);
  assert.throws(() => confirmTransfer(next, second, 2000), /budget changed/);
});

test('manual expenses update spending and permit honest overspending display', () => {
  const state = createSeed();
  const expense = { id: 'new', merchant: '  Dinner  ', category: 'dining', amountCents: 5500, date: '2026-10-24' };
  const next = addExpense(state, expense);
  assert.equal(next.transactions[0].merchant, 'Dinner');
  assert.equal(getBudgets(next).find(b => b.id === 'dining').remaining, -1700);
  assert.equal(addExpense(next, expense), next);
  assert.throws(() => transfer(next, { from: 'dining', to: 'shopping', amountCents: 1 }), /available/);
});

test('expenses reject unsupported dates and invalid merchant/category', () => {
  const state = createSeed();
  const expense = { id: 'new', merchant: 'Lunch', category: 'dining', amountCents: 500, date: '2026-10-24' };
  for (const overrides of [{ date: '2026-11-01' }, { date: '2026-10-32' }, { merchant: '   ' }, { category: 'missing' }]) assert.throws(() => addExpense(state, { ...expense, ...overrides }));
});

test('stored data validation rejects broken or foreign state', () => {
  const state = createSeed();
  for (const candidate of [null, {}, { ...state, userId: 'someone-else' }, { ...state, budgets: {} }, { ...state, transactions: [null] }, { ...state, adjustments: [{ id: 'bad' }] }]) assert.equal(isValidState(candidate), false);
});

test('a fresh seed is independent and resets the demo', () => {
  const state = createSeed();
  state.budgets.dining = 0;
  assert.equal(createSeed().budgets.dining, 12000);
  assert.equal(createSeed().adjustments.length, 0);
});
