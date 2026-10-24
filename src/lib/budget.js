export const PERIOD = '2026-10';
export const DEMO_DATE = '2026-10-24';
export const CATEGORIES = [
  { id: 'dining', name: 'Dining', icon: 'dining', color: '#b78a4c', tint: '#f5ead7', description: 'Good food, good company' },
  { id: 'shopping', name: 'Shopping', icon: 'bag', color: '#9681ae', tint: '#eee8f4', description: 'A few things just for you' },
  { id: 'groceries', name: 'Groceries', icon: 'basket', color: '#7d9561', tint: '#ebf0df', description: 'The everyday essentials' },
  { id: 'transport', name: 'Transport', icon: 'train', color: '#6c91a5', tint: '#e5eef3', description: 'Places to be, people to see' },
];

export function createSeed() {
  return {
    schemaVersion: 1, revision: 0, userId: 'pocket-demo', period: PERIOD, currency: 'USD',
    budgets: { dining: 12000, shopping: 15000, groceries: 22000, transport: 16000 },
    transactions: [
      { id: 't01', merchant: 'Sweetgreen', category: 'dining', amountCents: 1850, date: '2026-10-23' },
      { id: 't02', merchant: "Trader Joe’s", category: 'groceries', amountCents: 3650, date: '2026-10-22' },
      { id: 't03', merchant: 'BART', category: 'transport', amountCents: 950, date: '2026-10-22' },
      { id: 't04', merchant: 'Uniqlo', category: 'shopping', amountCents: 4500, date: '2026-10-21' },
      { id: 't05', merchant: 'Blue Bottle Coffee', category: 'dining', amountCents: 650, date: '2026-10-20' },
      { id: 't06', merchant: 'Berkeley Bowl', category: 'groceries', amountCents: 5150, date: '2026-10-18' },
      { id: 't07', merchant: 'Toss Noodle Bar', category: 'dining', amountCents: 2200, date: '2026-10-17' },
      { id: 't08', merchant: 'Bookshop', category: 'shopping', amountCents: 2700, date: '2026-10-15' },
      { id: 't09', merchant: 'AC Transit pass', category: 'transport', amountCents: 8000, date: '2026-10-12' },
      { id: 't10', merchant: 'Gather', category: 'dining', amountCents: 3500, date: '2026-10-10' },
      { id: 't11', merchant: 'Thrift store', category: 'shopping', amountCents: 1800, date: '2026-10-08' },
      { id: 't12', merchant: 'BART', category: 'transport', amountCents: 1950, date: '2026-10-05' },
    ],
    adjustments: [],
  };
}

export const money = (cents, decimals = false) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: decimals || cents % 100 !== 0 ? 2 : 0,
  maximumFractionDigits: 2,
}).format(cents / 100);

export function parseMoney(value) {
  if (!/^\d+(\.\d{1,2})?$/.test(String(value).trim())) throw new Error('Enter a positive amount with up to two decimal places.');
  const [whole, fraction = ''] = String(value).trim().split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 100000000) throw new Error('Enter an amount between $0.01 and $1,000,000.');
  return cents;
}

export function getBudgets(state) {
  return CATEGORIES.map(category => {
    const spent = state.transactions.filter(t => t.category === category.id && t.date.startsWith(state.period)).reduce((sum, t) => sum + t.amountCents, 0);
    const limit = state.budgets[category.id];
    return { ...category, limit, spent, remaining: limit - spent };
  });
}

export function getTotals(state) {
  return getBudgets(state).reduce((totals, budget) => ({ limit: totals.limit + budget.limit, spent: totals.spent + budget.spent, remaining: totals.remaining + budget.remaining }), { limit: 0, spent: 0, remaining: 0 });
}

export function proposeTransfer(state, { from, to, amountCents, id, now = Date.now() }) {
  if (!CATEGORIES.some(c => c.id === from) || !CATEGORIES.some(c => c.id === to)) throw new Error('Choose two valid categories.');
  if (from === to) throw new Error('Choose different source and destination categories.');
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error('Enter a positive amount.');
  const budgets = getBudgets(state);
  const source = budgets.find(b => b.id === from);
  if (amountCents > source.remaining) throw new Error(`Only ${money(Math.max(0, source.remaining))} is available in ${source.name}.`);
  if (!id) throw new Error('A transfer ID is required.');
  return { id, from, to, amountCents, revision: state.revision, expiresAt: now + 5 * 60 * 1000 };
}

export function confirmTransfer(state, proposal, now = Date.now()) {
  if (state.adjustments.some(a => a.id === proposal.id)) return state;
  if (proposal.revision !== state.revision) throw new Error('Your budget changed. Close this review and try again with the latest amounts.');
  if (!Number.isFinite(proposal.expiresAt) || proposal.expiresAt <= now) throw new Error('This review expired. Go back and review your transfer again.');
  proposeTransfer(state, proposal);
  return {
    ...state, revision: state.revision + 1,
    budgets: { ...state.budgets, [proposal.from]: state.budgets[proposal.from] - proposal.amountCents, [proposal.to]: state.budgets[proposal.to] + proposal.amountCents },
    adjustments: [{ id: proposal.id, from: proposal.from, to: proposal.to, amountCents: proposal.amountCents, createdAt: new Date(now).toISOString() }, ...state.adjustments],
  };
}

export function addExpense(state, expense) {
  if (!expense.id || !expense.merchant.trim() || expense.merchant.trim().length > 80) throw new Error('Enter a merchant name (80 characters or fewer).');
  if (!CATEGORIES.some(c => c.id === expense.category)) throw new Error('Choose a category.');
  if (!Number.isSafeInteger(expense.amountCents) || expense.amountCents <= 0) throw new Error('Enter a positive amount.');
  if (!/^2026-10-(0[1-9]|[12]\d|3[01])$/.test(expense.date)) throw new Error('Choose a date in October 2026, the demo budget month.');
  if (state.transactions.some(t => t.id === expense.id)) return state;
  return { ...state, revision: state.revision + 1, transactions: [{ ...expense, merchant: expense.merchant.trim() }, ...state.transactions] };
}

export function isValidState(state) {
  const validAmount = value => Number.isSafeInteger(value) && value >= 0 && value <= 100000000;
  const validCategory = value => CATEGORIES.some(c => c.id === value);
  return Boolean(state && state.schemaVersion === 1 && state.userId === 'pocket-demo' && state.period === PERIOD && state.currency === 'USD'
    && Number.isSafeInteger(state.revision) && state.revision >= 0
    && CATEGORIES.every(c => validAmount(state.budgets?.[c.id]))
    && Array.isArray(state.transactions) && state.transactions.every(t => t && typeof t.id === 'string' && typeof t.merchant === 'string' && validCategory(t.category) && validAmount(t.amountCents) && t.amountCents > 0 && /^2026-10-(0[1-9]|[12]\d|3[01])$/.test(t.date))
    && Array.isArray(state.adjustments) && state.adjustments.every(a => a && typeof a.id === 'string' && validCategory(a.from) && validCategory(a.to) && a.from !== a.to && validAmount(a.amountCents) && a.amountCents > 0 && typeof a.createdAt === 'string' && Number.isFinite(Date.parse(a.createdAt))));
}
