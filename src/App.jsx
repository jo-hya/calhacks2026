import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CATEGORIES, DEMO_DATE, money, parseMoney, getBudgets, getTotals } from './lib/budget.js';
import { store, connected } from './lib/store.js';
import TextDemo from './TextDemo.jsx';
import InstallPocket from './InstallPocket.jsx';
import { Home, Nearby, Setup, LocationControl, SmsLink } from './Experience.jsx';
import { DEFAULT_PROFILE } from './lib/preferences.js';

const asset = name => `/figma/${name}`;
function Asset({ name, className = '' }) { return <img className={className} src={asset(name)} alt="" aria-hidden="true" />; }
const paths = {
  pocket: <><path d="M5 4h14v10c0 5-7 8-7 8s-7-3-7-8V4Z" /><path d="m9 10 3 3 3-3" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  wallet: <><path d="M20 8H5a2 2 0 0 1 0-4h13v4M4 8v11a1 1 0 0 0 1 1h15V8" /><path d="M20 12h-6v4h6M16 14h.01" /></>,
  receipt: <><path d="M6 3 9 5l3-2 3 2 3-2v18l-3-2-3 2-3-2-3 2Z" /><path d="M9 9h6M9 13h6" /></>,
  activity: <><path d="M3 12h4l3-8 4 16 3-8h4" /></>,
  arrow: <><path d="M5 12h14m-5-5 5 5-5 5" /></>,
  chevron: <path d="m9 5 7 7-7 7" />,
  down: <path d="m7 10 5 5 5-5" />,
  transfer: <><path d="M4 8h16m-4-4 4 4-4 4M20 16H4m4-4-4 4 4 4" /></>,
  dining: <><path d="M5 3v6a3 3 0 0 0 6 0V3M8 3v18M19 3c-4 3-4 8 0 8v10M19 3v8" /></>,
  bag: <><path d="M5 7h14l1 14H4L5 7Z" /><path d="M9 8V5a3 3 0 0 1 6 0v3" /></>,
  basket: <><path d="M3 10h18l-2 10H5L3 10ZM7 10l3-7m7 7-3-7M9 14v3m6-3v3" /></>,
  train: <><rect x="6" y="3" width="12" height="15" rx="3" /><path d="M6 10h12M9 14h.01M15 14h.01M9 18l-2 3m8-3 2 3" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 11h18" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  reset: <><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  leaf: <><path d="M20 3C7 2 1 10 7 17s15 0 13-14ZM5 21 16 9" /></>,
  spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10h.01" /></>,
};

function Icon({ name, size = 20, ...props }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name] || paths.wallet}</svg>;
}


function CategoryIcon({ category, small = false }) {
  const files = { dining: 'dining.png', shopping: 'clothing.png', transport: 'transport.png' };
  return <span className={`category-icon ${small ? 'small' : ''}`}><Asset name={small ? 'feed-circle.svg' : 'category-circle.svg'} className="circle-art" />{files[category.id] ? <Asset name={files[category.id]} className={`category-art ${category.id}`} /> : <Icon name="basket" size={16} />}</span>;
}
const NAV = [{ id: 'overview', label: 'Home', asset: 'home.svg' }, { id: 'nearby', label: 'Nearby', asset: 'final/1-imgLiSearch-4c9cf.svg' }, { id: 'budgets', label: 'Budgets', asset: 'pie.svg' }, { id: 'profile', label: 'Spending and profile', asset: 'user.svg' }];
function initialPage() { const hash = window.location.hash.slice(1); return [...NAV.map(n => n.id), 'transactions', 'texts', 'activity', 'settings'].includes(hash) ? hash : 'overview'; }

export default function App() {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [page, setPage] = useState(initialPage);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const budgets = getBudgets(state);
  const totals = getTotals(state);
  const profile = { ...DEFAULT_PROFILE, ...state.profile };
  useEffect(() => { if ((!connected || state.nessie) && !state.profile?.onboarded) setModal({ type: 'setup' }); }, [Boolean(state.nessie), state.profile?.onboarded]);
  const dining = budgets.find(b => b.id === 'dining');
  const mainRef = useRef(null);
  useEffect(() => { const handler = () => setPage(initialPage()); window.addEventListener('hashchange', handler); return () => window.removeEventListener('hashchange', handler); }, []);
  useEffect(() => { if (toast) { const id = setTimeout(() => setToast(''), 5000); return () => clearTimeout(id); } }, [toast]);
  function navigate(id, category = 'all') { setPage(id); setFilter(category); setSearch(''); window.location.hash = id; mainRef.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); }
  function complete(message) { setModal(null); setToast(message); }
  const warning = store.getWarning();
  const navItem = item => <a key={item.id} href={`#${item.id}`} aria-label={item.label} title={item.label} aria-current={page === item.id ? 'page' : undefined} className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={e => { e.preventDefault(); navigate(item.id); }}><Asset name={item.asset} /></a>;
  return <div className={`app-shell page-${page}`}>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <div className="ambient" aria-hidden="true"><Asset name="glow.svg" className="glow glow-top" /><Asset name="glow.svg" className="glow glow-bottom" /></div>
    <main id="main-content" ref={mainRef} tabIndex={-1}>
      {warning && <div className="warning" role="alert">{warning}</div>}


      {page === 'texts' && <><PageHeading title="Lila texts" subtitle="Make room for plans with friends." /><TextDemo state={state} /></>}
      {page === 'overview' && <Home state={state} navigate={navigate} />}
      {page === 'nearby' && <Nearby state={state} />}
      {page === 'profile' && <>
        <header className="home-header"><div className="welcome"><button className="avatar" aria-label="Open profile" onClick={() => navigate('settings')}><Asset name="avatar.svg" /><span>{profile.name.slice(0,1)}</span></button><div><strong>{profile.name}</strong></div><button className="notification-button" aria-label="Dinner suggestion" onClick={() => setModal({ type: 'dinner' })}><Asset name="notification.png" /><Asset name="notification-dot.svg" className="notification-dot" /></button></div><div className="monthly-spending"><h1>Monthly Spending</h1><div><strong>{money(totals.spent)}</strong><span>/ {money(totals.limit)}</span></div></div></header>
        <section className="feed-surface" aria-label="Recent spending"><SpendingFeed transactions={state.transactions} onEdit={() => navigate('transactions')} /><button className="button secondary full-width" onClick={() => setModal({ type: 'expense' })}>Add a missing purchase</button><button className="settings-row" onClick={() => navigate('settings')}>Preferences &amp; settings<Icon name="chevron" /></button></section>
      </>}
      {page === 'budgets' && <div className="budget-screen"><h1 className="sr-only">Your budgets</h1><section className="balance-card" aria-label="Monthly budget summary"><span className="month-label"><Asset name="month-chevron.svg" />OCT 2026</span><div className="balance-amount">{money(totals.remaining)}<span>left this month</span></div><div className="total-progress" role="progressbar" aria-label="Monthly budget spent" aria-valuenow={Math.round(totals.spent / totals.limit * 100)} aria-valuemin={0} aria-valuemax={Math.max(100, Math.round(totals.spent / totals.limit * 100))}>{budgets.map(b => <span key={b.id} style={{ width: `${b.spent / Math.max(totals.limit, totals.spent) * 100}%`, background: b.color }} />)}</div><div className="balance-stats"><div><span>Total budget</span><strong>{money(totals.limit)}</strong></div><div><span>Spent so far</span><strong>{money(totals.spent)}</strong></div><div><span>Budget remaining</span><strong>{Math.round(totals.remaining / totals.limit * 100)}%</strong></div></div></section><section className="budget-list" aria-label="Budget categories">{budgets.map(b => <button className="budget-card" key={b.id} onClick={() => setModal({ type: 'category', category: b.id })} aria-label={`View ${b.name} budget, ${money(b.remaining)} remaining`}><div className="budget-card-top"><CategoryIcon category={b} /><h2>{b.name}</h2><Asset name="category-chevron.svg" className="category-chevron" /></div><div className="budget-remaining"><strong>{money(Math.abs(b.remaining))}</strong> {b.remaining < 0 ? 'over budget' : 'left'}</div><div className="category-progress"><span style={{ width: `${Math.min(100, b.limit ? b.spent / b.limit * 100 : 100)}%`, background: b.color }} /></div><div className="budget-card-footer"><span>{money(b.spent)} spent</span><span>of {money(b.limit)}</span></div></button>)}</section><button className="button light full-width" onClick={() => setModal({ type: 'transfer' })}><Icon name="transfer" />Move budget</button></div>}
      {page === 'transactions' && <><PageHeading title="Your spending" subtitle="The little things, all in one place." /><section className="content-surface"><div className="transaction-toolbar"><label className="search-input"><span className="sr-only">Search transactions</span><input placeholder="Search a merchant…" value={search} onChange={e => setSearch(e.target.value)} /></label><label><span className="sr-only">Filter by category</span><select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All categories</option>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div><TransactionList onEdit={transaction => setModal({ type: 'expense', transaction })} transactions={state.transactions.filter(t => (filter === 'all' || t.category === filter) && t.merchant.toLowerCase().includes(search.toLowerCase())).sort((a,b) => b.date.localeCompare(a.date))} /><button className="button primary full-width" onClick={() => setModal({ type: 'expense' })}><Icon name="plus" />Add expense</button></section></>}
      {page === 'activity' && <><PageHeading title="Your activity" subtitle="A little flexibility goes a long way." /><section className="content-surface"><h2>Budget adjustments</h2>{state.adjustments.length ? <ActivityList adjustments={state.adjustments} /> : <div className="empty-state"><Icon name="transfer" size={32} /><h3>A fresh start.</h3><p>Your confirmed budget moves will appear here.</p></div>}<button className="button primary full-width" onClick={() => setModal({ type: 'transfer' })}>Move budget<Icon name="transfer" /></button></section></>}
      {page === 'settings' && <><PageHeading title="Your pocket" subtitle="Make room for what matters." /><section className="content-surface profile-panel"><span className="profile-avatar">{profile.name.slice(0,1)}</span><h2>{profile.name}</h2><p>{profile.area} · Personal demo account</p><button className="settings-row" onClick={() => setModal({ type: 'setup' })}>Preferences &amp; monthly budget<Icon name="chevron" /></button><LocationControl state={state} /><SmsLink state={state} /><button className="settings-row" onClick={() => navigate('activity')}>Budget activity<Icon name="chevron" /></button><InstallPocket /><button className="settings-row" onClick={() => navigate('transactions')}>All transactions<Icon name="chevron" /></button><button className="settings-row" onClick={() => setModal({ type: 'dinner' })}>Make room for dinner<Icon name="chevron" /></button><button className="settings-row" onClick={() => setModal({ type: 'reset' })}>Reset demo<Icon name="reset" /></button><p className="modal-footnote">October 2026 · USD<br />{connected ? 'Shared demo backed by Nessie sandbox purchases.' : 'Demo data saved on this device.'}</p></section></>}
    </main>
    <nav className="bottom-nav" aria-label="Main navigation">{NAV.slice(0,2).map(navItem)}<button className="add-button" aria-label="Add to your pocket" onClick={() => setModal({ type: 'actions' })}><Asset name="plus.svg" /></button>{NAV.slice(2).map(navItem)}</nav>
    <div className="toast-region" role="status" aria-live="polite">{toast && <div className="toast"><Icon name="check" />{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><Icon name="close" /></button></div>}</div>
    {modal && <Modal title={modal.type === 'setup' ? 'Welcome to Lila.' : modal.type === 'transfer' ? 'Make a little room.' : modal.type === 'expense' ? (modal.transaction ? 'A little correction.' : 'Add an expense.') : modal.type === 'reset' ? 'A fresh start?' : modal.type === 'actions' ? 'A little more possibility.' : modal.type === 'dinner' ? 'Dinner with your people?' : `${CATEGORIES.find(c => c.id === modal.category).name} pocket`} onClose={() => setModal(null)}>
      {modal.type === 'setup' && <Setup state={state} onComplete={() => complete('Your pocket is ready.')} />}
      {modal.type === 'actions' && <div className="action-options"><button onClick={() => setModal({ type: 'expense' })}><Icon name="plus" /><span><strong>Add a purchase</strong><small>Record something your pocket missed.</small></span><Icon name="chevron" /></button><button onClick={() => setModal({ type: 'transfer' })}><Icon name="transfer" /><span><strong>Move budget</strong><small>Make room between your categories.</small></span><Icon name="chevron" /></button></div>}
      {modal.type === 'dinner' && <><p className="modal-description">A $55 plan. {money(dining.remaining)} in your dining pocket.</p><div className="transfer-review"><Icon name="dining" size={38} /><h3>{dining.remaining >= 5500 ? 'You have room for dinner.' : `${money(5500 - dining.remaining)} more would cover it.`}</h3><p>Your total monthly budget stays the same.</p></div><button className="button primary full-width" onClick={() => dining.remaining >= 5500 ? (setModal(null), navigate('transactions', 'dining')) : setModal({ type: 'transfer', from: 'shopping', to: 'dining', amount: '20' })}>{dining.remaining >= 5500 ? 'View dining spending' : 'Make room for dinner'}<Icon name="arrow" /></button></>}
      {modal.type === 'transfer' && <TransferForm state={state} initial={modal} onComplete={complete} />}
      {modal.type === 'expense' && <ExpenseForm transaction={modal.transaction} onComplete={complete} />}
      {modal.type === 'reset' && <><p className="modal-description">{connected ? 'Restore starting allocations, reload Nessie purchases, and clear shared demo expenses, reviews, and adjustments on every connected device.' : 'Restore the starting October budgets and transactions. This clears the expenses and adjustments you added on this device.'}</p>{!connected && <div className="reset-summary"><span>Dining remaining<strong>$38</strong></span><span>Clothing remaining<strong>$60</strong></span></div>}<div className="modal-actions"><button className="button secondary" onClick={() => setModal(null)}>Keep changes</button><button className="button primary" onClick={async () => { try { await store.reset(); complete('Your pockets are ready for a fresh start.'); } catch (error) { setToast(error.message); } }}>Reset demo</button></div></>}
      {modal.type === 'category' && <CategoryDetail category={budgets.find(b => b.id === modal.category)} state={state} onTransfer={() => setModal({ type: 'transfer', to: modal.category, from: modal.category === 'shopping' ? 'dining' : 'shopping' })} onTransactions={() => { setModal(null); navigate('transactions', modal.category); }} />}
    </Modal>}
  </div>;
}
function PageHeading({ title, subtitle }) { return <header className="page-heading"><h1>{title}</h1><p>{subtitle}</p></header>; }
function FeedIcon({ transaction }) {
  let name = transaction.category === 'shopping' || transaction.category === 'groceries' ? 'feed-shopping.png' : transaction.category === 'transport' ? (/Lyft/i.test(transaction.merchant) ? 'feed-car.png' : 'feed-ticket.png') : /coffee/i.test(transaction.merchant) ? 'feed-coffee.png' : 'feed-dining.png';
  return <span className="feed-icon"><Asset name="feed-circle.svg" /><Asset name={name} className={`feed-art ${name.replace('.png','')}`} /></span>;
}
function SpendingFeed({ transactions, onEdit }) {
  const grouped = Object.groupBy([...transactions].sort((a,b) => b.date.localeCompare(a.date)), t => t.date);
  return Object.entries(grouped).map(([date, items], i) => <section className="feed-day" key={date}><div className="feed-day-heading"><h2>{date === DEMO_DATE ? 'Today' : date === '2026-10-23' ? 'Yesterday' : date === '2026-10-22' ? '2 Days Ago' : new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month:'short', day:'numeric' })}</h2>{i === 0 && <button onClick={onEdit}>View all</button>}</div>{items.map(t => <div className="feed-row" key={t.id}><FeedIcon transaction={t} /><p>Spent <strong>{money(t.amountCents)}</strong> at <strong>{t.merchant}</strong>.</p><span>{CATEGORIES.find(c => c.id === t.category).name}</span></div>)}</section>);
}
function TransactionList({ transactions, onEdit }) {
  if (!transactions.length) return <div className="empty-state"><Icon name="search" size={28} /><h3>No matching transactions.</h3><p>Try another merchant or category.</p></div>;
  return <div className="transaction-list">{transactions.map(t => <div className="transaction-row" key={t.id}><FeedIcon transaction={t} /><div className="merchant-cell"><strong>{t.merchant}</strong><span>{new Date(`${t.date}T12:00:00`).toLocaleDateString('en-US', { month:'short', day:'numeric' })} · {CATEGORIES.find(c => c.id === t.category).name}</span></div>{onEdit && <button className="edit-purchase" aria-label={`Edit ${t.merchant} purchase`} onClick={() => onEdit(t)}>Edit</button>}<strong className="transaction-amount">−{money(t.amountCents, true)}</strong></div>)}</div>;
}
function ActivityList({ adjustments }) {
  return <div className="activity-list">{adjustments.map(a => <div className="activity-row" key={a.id}><span className="activity-icon"><Icon name="transfer" size={18} /></span><div><strong>{money(a.amountCents)} moved to {CATEGORIES.find(c => c.id === a.to).name.toLowerCase()}</strong><p>From {CATEGORIES.find(c => c.id === a.from).name.toLowerCase()} · Allocation adjustment</p><time dateTime={a.createdAt}>{new Date(a.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time></div><span className="confirmed"><Icon name="check" size={12} />Confirmed</span></div>)}</div>;
}

function Modal({ title, onClose, children }) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    dialog.showModal();
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = oldOverflow; dialog.close(); opener?.focus(); };
  }, []);
  return <dialog ref={dialogRef} className="modal" aria-labelledby="modal-title" onCancel={e => { e.preventDefault(); onCloseRef.current(); }} onClick={e => { if (e.target === dialogRef.current) { const r = dialogRef.current.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onCloseRef.current(); } }}><div className="modal-inner"><div className="modal-heading"><span className="eyebrow">YOUR MONEY, YOUR CALL</span><button className="icon-button" onClick={onClose} aria-label="Close dialog"><Icon name="close" /></button></div><h2 id="modal-title">{title}</h2>{children}</div></dialog>;
}

function TransferForm({ state, initial, onComplete }) {
  const [from, setFrom] = useState(initial.from || 'shopping');
  const [to, setTo] = useState(initial.to || 'dining');
  const [amount, setAmount] = useState(initial.amount || '20');
  const [proposal, setProposal] = useState(null);
  const [error, setError] = useState('');
  const budgets = getBudgets(state);
  const source = budgets.find(b => b.id === from);
  const destination = budgets.find(b => b.id === to);

  async function review(e) {
    e.preventDefault();
    try { setProposal(await store.propose({ from, to, amountCents: parseMoney(amount), id: crypto.randomUUID() })); setError(''); }
    catch (err) { setError(err.message); }
  }
  async function confirm() {
    try { await store.transfer(proposal); onComplete(`${money(proposal.amountCents)} moved from ${source.name.toLowerCase()} to ${destination.name.toLowerCase()}.`); }
    catch (err) { setError(err.message); }
  }

  return <><p className="modal-description">{proposal ? 'Take a look before you make the move. Nothing changes until you confirm.' : 'Shift your allocation between categories. Your total budget stays the same.'}</p>{proposal ? <div className="transfer-review"><span className="review-amount">{money(proposal.amountCents)}</span><span className="review-route">{source.name}<Icon name="arrow" size={18} />{destination.name}</span><div className="review-balances">{[source, destination].map((b, i) => <div key={b.id}><span>{b.name} remaining</span><strong>{money(b.remaining)}<Icon name="arrow" size={16} />{money(b.remaining + (i ? 1 : -1) * proposal.amountCents)}</strong></div>)}</div><p><Icon name="info" size={15} />This adjusts your budget. It does not move real money.</p></div> : <form id="transfer-form" onSubmit={review}><div className="form-pair"><label>Move from<select value={from} onChange={e => setFrom(e.target.value)}>{budgets.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><small>{money(source.remaining)} available</small></label><label>Move to<select value={to} onChange={e => setTo(e.target.value)}>{budgets.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><small>{money(destination.remaining)} remaining</small></label></div><label className="amount-label">Amount<span className="amount-input"><span>$</span><input aria-label="Transfer amount" value={amount} inputMode="decimal" onChange={e => setAmount(e.target.value)} placeholder="20.00" required autoComplete="off" /></span></label><div className="amount-presets">{['10', '20', '50'].map(value => <button className={amount === value ? 'selected' : ''} type="button" key={value} onClick={() => setAmount(value)}>${value}</button>)}</div></form>}{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions">{proposal && <button className="button secondary" onClick={() => { setProposal(null); setError(''); }}>Back</button>}{proposal ? <button className="button primary" onClick={confirm}><Icon name="check" size={17} />Confirm transfer</button> : <button className="button primary full-width" type="submit" form="transfer-form">Review transfer<Icon name="arrow" size={17} /></button>}</div><p className="modal-footnote">{connected ? 'Shared demo - Changes appear on your phone too' : 'Demo workspace - Changes are saved in this browser'}</p></>;
}

function ExpenseForm({ onComplete, transaction }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); if (busy) return; setBusy(true); const data = new FormData(e.currentTarget);
    try { await (transaction ? store.editExpense : store.addExpense)({ id: transaction?.id || crypto.randomUUID(), merchant: String(data.get('merchant')), category: String(data.get('category')), amountCents: parseMoney(data.get('amount')), date: String(data.get('date')) }); onComplete(transaction ? 'Purchase updated. Your budget is up to date.' : 'Expense added. Your budget is up to date.'); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <form onSubmit={submit}><p className="modal-description">{transaction ? 'Correct this purchase. Imported originals are preserved, and your edits stay after syncing.' : 'Add a purchase you already made. This records spending; it does not make a payment.'}</p><label>Merchant<input defaultValue={transaction?.merchant} name="merchant" placeholder="e.g. Your favorite coffee spot" maxLength={80} required /></label><div className="form-pair"><label>Amount ($)<input defaultValue={transaction ? (transaction.amountCents / 100).toFixed(2) : undefined} name="amount" inputMode="decimal" placeholder="0.00" required /></label><label>Category<select name="category" defaultValue={transaction?.category}>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div><label>Date<input name="date" type="date" defaultValue={transaction?.date || DEMO_DATE} min="2026-10-01" max="2026-10-31" required /></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button disabled={busy} type="submit" className="button primary full-width"><Icon name="check" size={17} />{busy ? 'Saving…' : transaction ? 'Save correction' : 'Add expense'}</button></div></form>;
}

function CategoryDetail({ category, state, onTransfer, onTransactions }) {
  const adjustments = state.adjustments.filter(a => a.from === category.id || a.to === category.id);
  return <><p className="modal-description">{category.description}. October 2026.</p><div className="category-detail-summary"><CategoryIcon category={category} /><div><span>Remaining allocation</span><strong>{money(category.remaining)}</strong></div></div><div className="reset-summary"><span>Allocated<strong>{money(category.limit)}</strong></span><span>Spent<strong>{money(category.spent)}</strong></span></div><h3 className="detail-subtitle">Recent spending</h3><TransactionList transactions={[...state.transactions].filter(t => t.category === category.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3)} compact />{adjustments.length > 0 && <><h3 className="detail-subtitle">Latest adjustment</h3><ActivityList adjustments={adjustments.slice(0, 1)} /></>}<div className="modal-actions"><button className="button secondary" onClick={onTransactions}>All transactions</button><button className="button primary" onClick={onTransfer}>Move budget<Icon name="transfer" size={17} /></button></div></>;
}
