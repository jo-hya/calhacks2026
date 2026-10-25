import { CATEGORIES, addExpense } from './budget.js';

export const DEFAULT_PROFILE = { name: 'Sam', area: 'San Francisco', preferences: '', onboarded: false, locationEnabled: false };

export function updateProfile(state, input) {
  const profile = { ...DEFAULT_PROFILE, ...state.profile };
  for (const field of ['name', 'area', 'preferences']) {
    if (input[field] !== undefined) {
      if (typeof input[field] !== 'string' || input[field].trim().length > (field === 'preferences' ? 500 : 80)) throw new Error(`Please enter a valid ${field}.`);
      profile[field] = input[field].trim();
    }
  }
  if (!profile.name) throw new Error('Please enter your name.');
  for (const field of ['onboarded', 'locationEnabled']) if (input[field] !== undefined) {
    if (typeof input[field] !== 'boolean') throw new Error(`Invalid ${field}.`);
    profile[field] = input[field];
  }
  let budgets = state.budgets;
  if (input.budgets !== undefined) {
    if (!input.budgets || !CATEGORIES.every(c => Number.isSafeInteger(input.budgets[c.id]) && input.budgets[c.id] >= 0 && input.budgets[c.id] <= 100000000)) throw new Error('Enter a valid allocation for every category.');
    budgets = Object.fromEntries(CATEGORIES.map(c => [c.id, input.budgets[c.id]]));
    if (!Object.values(budgets).some(n => n > 0)) throw new Error('Set at least one category budget.');
  }
  return { ...state, profile, budgets, revision: state.revision + 1 };
}

export function editExpense(state, input) {
  const previous = state.transactions.find(t => t.id === input.id);
  if (!previous) throw new Error('That purchase could not be found. Refresh and try again.');
  const changes = Object.fromEntries(['merchant', 'category', 'amountCents', 'date'].map(key => [key, input[key] ?? previous[key]]));
  // Reuse the same validation as a manual purchase without changing its source ID.
  addExpense({ ...state, transactions: [] }, { id: input.id, ...changes });
  changes.merchant = changes.merchant.trim();
  return { ...state, revision: state.revision + 1,
    transactionOverrides: { ...state.transactionOverrides, [input.id]: changes },
    transactions: state.transactions.map(t => t.id === input.id ? { ...t, ...changes, edited: true } : t),
  };
}
