import { createSeed, CATEGORIES } from '../src/lib/budget.js';

export async function nessie(path, body, method = body ? 'POST' : 'GET') {
  if (!process.env.NESSIE_API_KEY) throw new Error('NESSIE_API_KEY is missing.');
  const url = new URL(path, 'https://api.nessieisreal.com');
  url.searchParams.set('key', process.env.NESSIE_API_KEY);
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Nessie ${body ? 'write' : 'read'} failed (${response.status}).`);
  const text = await response.text();
  try { return JSON.parse(text); } catch { return text; }
}

export async function account() {
  const accounts = await nessie('/accounts');
  const selected = process.env.NESSIE_ACCOUNT_ID ? accounts.find(a => a._id === process.env.NESSIE_ACCOUNT_ID) : accounts.find(a => a.nickname === 'pocket');
  if (!selected) throw new Error('Set NESSIE_ACCOUNT_ID to your Lila sandbox account.');
  return selected;
}

export function importPurchases(state, purchases, merchants, accountId) {
  const byId = new Map(merchants.map(m => [m._id, m]));
  const transactions = [];
  let excluded = 0;
  const seen = new Set();
  for (const p of purchases) {
    const date = (p.purchase_date || p.transaction_date || '').slice(0, 10);
    if (!date.startsWith(state.period) || !['completed', 'executed'].includes(p.status)) { excluded++; continue; }
    const m = byId.get(p.merchant_id);
    const categories = Array.isArray(m?.category) ? m.category : [m?.category];
    const category = CATEGORIES.find(c => categories.includes(c.id))?.id;
    const amountCents = Math.round(Number(p.amount) * 100);
    if (!category || !Number.isSafeInteger(amountCents) || amountCents <= 0 || !p._id) throw new Error('A Nessie purchase needs a valid amount and merchant category (dining, shopping, groceries, transport).');
    if (seen.has(p._id)) continue;
    seen.add(p._id);
    transactions.push({ id: `nessie:${p._id}`, merchant: m.name.replace(/^Pocket demo - /, ''), category, amountCents, date, source: 'nessie' });
  }
  transactions.sort((a, b) => a.id.localeCompare(b.id));
  const manual = state.transactions.filter(t => t.source === 'manual');
  const nextTransactions = [...transactions, ...manual].map(t => state.transactionOverrides?.[t.id] ? { ...t, ...state.transactionOverrides[t.id], edited: true } : t);
  const changed = JSON.stringify(nextTransactions) !== JSON.stringify(state.transactions);
  return { ...state, importedTransactions: transactions, transactions: nextTransactions, revision: state.revision + Number(changed), nessie: { accountId, imported: transactions.length, excluded, syncedAt: new Date().toISOString(), source: 'Nessie sandbox' } };
}

export async function syncNessie(state) {
  const a = await account();
  const [purchases, merchants] = await Promise.all([nessie(`/accounts/${a._id}/purchases`), nessie('/merchants')]);
  return importPurchases(state, purchases, merchants, a._id);
}

export async function seedNessie() {
  const a = await account();
  const merchants = await nessie('/merchants');
  const existing = await nessie(`/accounts/${a._id}/purchases`);
  let created = 0;
  // The current sandbox truncates fractional purchase dollars. Use explicit
  // whole-dollar fixtures that preserve each category's original spending total.
  const wholeDollars = { t01: 19, t05: 6, t02: 37, t06: 51, t03: 10, t12: 19 };
  for (const t of createSeed().transactions) {
    const description = `pocket-demo-v1:${t.id}`;
    const amount = wholeDollars[t.id] ?? t.amountCents / 100;
    const previous = existing.find(p => p.description === description);
    if (previous) {
      if (Number(previous.amount) !== amount) await nessie(`/purchase/${previous._id}`, { amount }, 'PUT');
      continue;
    }
    const name = `Pocket demo - ${t.merchant}`;
    let merchant = merchants.find(m => m.name === name);
    if (!merchant) {
      const result = await nessie('/merchants', { name, category: t.category });
      merchant = result.objectCreated;
      if (!merchant?._id) throw new Error('Nessie did not return the created merchant.');
      merchants.push(merchant);
    }
    await nessie(`/accounts/${a._id}/purchases`, { merchant_id: merchant._id, medium: 'balance', purchase_date: t.date, amount, description, status: 'completed' });
    created++;
  }
  console.log(`Nessie sandbox: ${created} demo purchases created; existing demo purchases preserved.`);
}

// Purchases the Claude agent pays for (an approved ALT). Tagged so a demo reset can remove them.
const AGENT_TAG = 'pocket-agent:';

export async function createAgentPurchase({ id, merchant, category, amountCents, date, reconcileOnly = false }) {
  if (!id) throw new Error('A payment action ID is required.');
  const a = await account();
  const description = `${AGENT_TAG}${id}`;
  const purchases = await nessie(`/accounts/${a._id}/purchases`);
  const existing = purchases.find(p => p.description === description);
  if (existing?._id) return existing._id;
  if (reconcileOnly) throw new Error('Payment outcome is still unknown. No new payment was submitted. Check Nessie before resetting the demo.');
  const merchants = await nessie('/merchants');
  const name = `Pocket demo - ${merchant}`;
  let m = merchants.find(x => x.name === name && [x.category].flat().includes(category));
  if (!m) {
    m = (await nessie('/merchants', { name, category })).objectCreated;
    if (!m?._id) throw new Error('Nessie did not return the created merchant.');
  }
  // The sandbox stores whole dollars; the agent already proposes whole-dollar amounts.
  const result = await nessie(`/accounts/${a._id}/purchases`, { merchant_id: m._id, medium: 'balance', purchase_date: date, amount: Math.round(amountCents / 100), description, status: 'completed' });
  if (!result?.objectCreated?._id) throw new Error('Nessie did not confirm the payment ID. Check its status before retrying.');
  return result.objectCreated._id;
}

export async function deleteAgentPurchases() {
  const a = await account();
  const purchases = await nessie(`/accounts/${a._id}/purchases`);
  for (const p of purchases) if (String(p.description || '').startsWith(AGENT_TAG)) await nessie(`/purchase/${p._id}`, undefined, 'DELETE');
}
