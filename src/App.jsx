import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CATEGORIES, DEMO_DATE, money, parseMoney, getBudgets, getTotals, proposeTransfer } from './lib/budget.js';
import { store } from './lib/store.js';

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
  return <span className={`category-icon ${small ? 'small' : ''}`} style={{ background: category.tint, color: category.color }}><Icon name={category.icon} size={small ? 18 : 22} /></span>;
}

function DinnerIllustration() {
  return <svg className="dinner-illustration" viewBox="0 0 180 150" fill="none" aria-hidden="true">
    <path d="M17 126c33-12 113-10 148 0" stroke="#dccbad" strokeWidth="2" />
    <ellipse cx="96" cy="78" rx="53" ry="52" fill="#e8dbc3" />
    <circle cx="91" cy="72" r="49" fill="#fffdf5" stroke="#d6c6aa" strokeWidth="2" />
    <circle cx="91" cy="72" r="36" stroke="#e4d8c1" strokeWidth="2" />
    <path d="M71 73c-3-17 29-25 33-8 4 14-25 17-22 5 3-9 28-8 28 6 0 12-27 18-35 7-8-10 15-22 25-14" stroke="#d9ae60" strokeWidth="5" strokeLinecap="round" />
    <path d="M92 54c-13-11-18-7-14 0 3 4 10 3 14 0ZM94 55c1-14 12-18 13-8 0 5-8 8-13 8Z" fill="#7e9361" />
    <circle cx="75" cy="87" r="4" fill="#c67e5e" /><circle cx="108" cy="83" r="4" fill="#c67e5e" />
    <path d="M25 32v29c0 8 12 8 12 0V32M31 32v82M151 32v82m0-82c-13 8-13 35 0 35" stroke="#8c997c" strokeWidth="3" strokeLinecap="round" />
    <path d="m137 17 3-8m5 14 8-3M45 21l-5-7" stroke="#bda276" strokeWidth="2" strokeLinecap="round" />
  </svg>;
}

const NAV = [{ id: 'overview', label: 'Overview', icon: 'grid' }, { id: 'budgets', label: 'Budgets', icon: 'wallet' }, { id: 'transactions', label: 'Transactions', icon: 'receipt' }, { id: 'activity', label: 'Activity', icon: 'activity' }];
const titles = {
  overview: ['A little clarity. A lot more living.', 'A thoughtful look at where your money is going.'],
  budgets: ['Make room for what matters.', 'Your categories, your priorities. A little flexibility goes a long way.'],
  transactions: ['The little things add up.', 'A clear view of your everyday spending.'],
  activity: ['Every adjustment, in one place.', 'Follow the small changes you make to your monthly budget.'],
};

function initialPage() {
  const hash = window.location.hash.slice(1);
  return NAV.some(n => n.id === hash) ? hash : 'overview';
}

export default function App() {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [page, setPage] = useState(initialPage);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const budgets = getBudgets(state);
  const totals = getTotals(state);
  const dining = budgets.find(b => b.id === 'dining');
  const mainRef = useRef(null);

  useEffect(() => {
    const handleHash = () => setPage(initialPage());
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);
  useEffect(() => { if (toast) { const id = setTimeout(() => setToast(''), 5000); return () => clearTimeout(id); } }, [toast]);

  function navigate(id, category = 'all') {
    setPage(id); setFilter(category); setSearch(''); window.location.hash = id;
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function complete(message) { setModal(null); setToast(message); }
  const warning = store.getWarning();

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside className="sidebar">
      <a className="brand" href="#overview" aria-label="Pocket home"><span className="brand-mark"><Icon name="pocket" size={28} /></span>pocket<span className="brand-dot">.</span></a>
      <span className="nav-label">YOUR EVERYDAY MONEY</span>
      <nav aria-label="Main navigation">{NAV.map(item => <a key={item.id} href={`#${item.id}`} className={`nav-item ${page === item.id ? 'active' : ''}`} aria-current={page === item.id ? 'page' : undefined} onClick={e => { e.preventDefault(); navigate(item.id); }}><Icon name={item.icon} /><span>{item.label}</span>{page === item.id && <span className="nav-dot" />}</a>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-note"><Icon name="leaf" size={24} /><p>A little intention.<br />More possibilities.</p><span>Build habits that feel like you.</span></div>
      <button className="reset-button" onClick={() => setModal({ type: 'reset' })}><Icon name="reset" size={17} />Reset demo</button>
      <div className="profile"><span className="avatar">J</span><div><strong>Jamie Parker</strong><span>Personal demo account</span></div><span className="profile-dot" /></div></div>
    </aside>

    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb">My pocket <span>/</span> <strong>{NAV.find(n => n.id === page).label}</strong></div><div className="topbar-right"><span className="demo-badge"><span />Demo workspace</span><span className="mobile-avatar">J</span><span className="topbar-date"><Icon name="calendar" size={16} />October 2026</span></div></header>
      <main id="main-content" ref={mainRef} tabIndex={-1}>
        {warning && <div className="warning" role="alert"><Icon name="info" />{warning}</div>}
        <section className="page-heading"><div><div className="eyebrow">{page === 'overview' ? 'YOUR MONTH AT A GLANCE' : `YOUR ${page.toUpperCase()}`}</div><h1>{titles[page][0]}</h1><p>{titles[page][1]}</p></div><button className="button primary" onClick={() => setModal({ type: page === 'transactions' ? 'expense' : 'transfer' })}><Icon name={page === 'transactions' ? 'plus' : 'transfer'} size={18} />{page === 'transactions' ? 'Add expense' : 'Move budget'}</button></section>

        {(page === 'overview' || page === 'budgets') && <>
          <div className="hero-grid">
            <section className="balance-card" aria-label="Monthly budget summary"><div className="balance-top"><span><span className="light-dot" />YOUR ROOM TO SPEND</span><span className="month-label">OCT 01 — OCT 31</span></div><div className="balance-amount">{money(totals.remaining)}<span>left this month</span></div><p className="balance-caption">A budget for your life. With room to enjoy it.</p><div className="total-progress" role="progressbar" aria-label="Monthly budget spent" aria-valuenow={Math.round(totals.spent / totals.limit * 100)} aria-valuemin={0} aria-valuemax={Math.max(100, Math.round(totals.spent / totals.limit * 100))}>{budgets.map(b => <span key={b.id} style={{ width: `${Math.max(0, b.spent / Math.max(totals.limit, totals.spent) * 100)}%`, background: b.color }} />)}</div><div className="balance-stats"><div><span>Total budget</span><strong>{money(totals.limit)}</strong></div><div><span>Spent so far</span><strong>{money(totals.spent)}</strong></div><div><span>Budget remaining</span><strong>{Math.round(totals.remaining / totals.limit * 100)}%</strong></div></div><span className="balance-decoration" aria-hidden="true"><Icon name="pocket" size={185} /></span></section>
            <section className="dinner-card"><div className="eyebrow"><Icon name="spark" size={15} />LIFE HAPPENS. MAKE ROOM.</div><div className="dinner-body"><div><h2>Dinner with<br />your people?</h2><p>A $55 plan.<br />{money(dining.remaining)} in your dining pocket.</p></div><DinnerIllustration /></div><div className={`dinner-insight ${dining.remaining >= 5500 ? 'covered' : ''}`}><Icon name={dining.remaining >= 5500 ? 'check' : 'info'} size={16} /><span>{dining.remaining >= 5500 ? 'This fits your dining budget.' : `${money(5500 - dining.remaining)} more would cover the plan.`}</span></div><button className="dinner-link" onClick={() => dining.remaining >= 5500 ? navigate('transactions', 'dining') : setModal({ type: 'transfer', from: 'shopping', to: 'dining', amount: '20' })}>{dining.remaining >= 5500 ? 'Explore your dining spending' : 'Make room for dinner'}<Icon name="arrow" size={18} /></button></section>
          </div>

          <section className="budgets-section"><div className="section-heading"><div><h2>Your pockets <span className="count">04</span></h2><p>A place for every part of your life.</p></div>{page === 'overview' ? <button className="text-button" onClick={() => navigate('budgets')}>View budgets <Icon name="arrow" size={17} /></button> : <span className="muted-meta">Monthly allocations · USD</span>}</div><div className="budget-grid">{budgets.map(b => <button key={b.id} className="budget-card" onClick={() => setModal({ type: 'category', category: b.id })} aria-label={`View ${b.name} budget, ${money(b.remaining)} remaining`}><div className="budget-card-top"><CategoryIcon category={b} /><Icon name="chevron" size={16} /></div><h3>{b.name}</h3><div className={`budget-remaining ${b.remaining < 0 ? 'negative' : ''}`}>{money(Math.abs(b.remaining))}<span>{b.remaining < 0 ? 'over budget' : 'left'}</span></div><div className="category-progress"><span style={{ width: `${Math.min(100, b.limit ? b.spent / b.limit * 100 : 100)}%`, background: b.color }} /></div><div className="budget-card-footer"><span>{money(b.spent)} spent</span><span>of {money(b.limit)}</span></div></button>)}</div></section>
        </>}

        {page === 'overview' && <div className="lower-grid"><section className="panel"><div className="section-heading"><h2>Recent transactions</h2><button className="text-button" onClick={() => navigate('transactions')}>View all <Icon name="arrow" size={16} /></button></div><TransactionList transactions={[...state.transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4)} compact /></section><section className="panel activity-panel"><div className="section-heading"><h2>A little flexibility</h2><span className="mini-icon"><Icon name="transfer" size={17} /></span></div>{state.adjustments.length ? <ActivityList adjustments={state.adjustments.slice(0, 2)} /> : <div className="activity-intro"><div className="flexibility-art" aria-hidden="true"><span><Icon name="bag" size={24} /></span><Icon name="transfer" size={22} /><span><Icon name="dining" size={24} /></span></div><h3>Plans change. Your budget can too.</h3><p>Move a little between pockets without changing your total monthly budget.</p></div>}<button className="text-button activity-cta" onClick={() => state.adjustments.length ? navigate('activity') : setModal({ type: 'transfer' })}>{state.adjustments.length ? 'See all adjustments' : 'Make your first adjustment'}<Icon name="arrow" size={17} /></button></section></div>}

        {page === 'budgets' && <section className="budget-explainer"><span className="explainer-icon"><Icon name="leaf" size={27} /></span><div><h3>Flexible pockets. One monthly plan.</h3><p>Moving budget changes your category allocations. Your spending stays the same, and no money moves between bank accounts.</p></div><button className="button secondary" onClick={() => navigate('activity')}>View adjustments<Icon name="arrow" size={17} /></button></section>}

        {page === 'transactions' && <section className="panel transaction-panel"><div className="transaction-toolbar"><label className="search-input"><Icon name="search" size={18} /><input aria-label="Search transactions" placeholder="Search a merchant…" value={search} onChange={e => setSearch(e.target.value)} /></label><label className="filter-select"><span className="sr-only">Filter by category</span><select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All categories</option>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div><TransactionList transactions={[...state.transactions].filter(t => (filter === 'all' || t.category === filter) && t.merchant.toLowerCase().includes(search.toLowerCase())).sort((a, b) => b.date.localeCompare(a.date))} /><div className="list-footnote">Demo transactions · October 2026 · All amounts in USD</div></section>}

        {page === 'activity' && <section className="panel full-activity"><div className="section-heading"><h2>Budget adjustments</h2><span className="muted-meta">{state.adjustments.length} confirmed</span></div>{state.adjustments.length ? <ActivityList adjustments={state.adjustments} /> : <div className="empty-state"><span className="empty-icon"><Icon name="transfer" size={30} /></span><h3>A fresh start for your pockets.</h3><p>Once you confirm a budget move, you’ll see exactly what changed here.</p><button className="button primary" onClick={() => setModal({ type: 'transfer' })}>Move budget<Icon name="arrow" size={17} /></button></div>}</section>}

        <footer className="page-footer"><span><Icon name="pocket" size={15} />Small steps. More possibilities.</span><span>Demo data · Saved in this browser</span><button className="mobile-reset" onClick={() => setModal({ type: 'reset' })}>Reset demo</button></footer>
      </main>
    </div>
    <div className="toast-region" role="status" aria-live="polite">{toast && <div className="toast"><Icon name="check" size={18} />{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><Icon name="close" size={16} /></button></div>}</div>
    {modal && <Modal title={modal.type === 'transfer' ? 'Make a little room.' : modal.type === 'expense' ? 'Add an expense.' : modal.type === 'reset' ? 'A fresh start?' : `${CATEGORIES.find(c => c.id === modal.category).name} pocket`} onClose={() => setModal(null)}>
      {modal.type === 'transfer' && <TransferForm state={state} initial={modal} onComplete={complete} />}
      {modal.type === 'expense' && <ExpenseForm onComplete={complete} />}
      {modal.type === 'reset' && <><p className="modal-description">Restore the original October demo budgets and transactions. This clears the expenses and budget adjustments you added in this browser.</p><div className="reset-summary"><span>Dining remaining<strong>$38</strong></span><span>Shopping remaining<strong>$60</strong></span></div><div className="modal-actions"><button className="button secondary" onClick={() => setModal(null)}>Keep my changes</button><button className="button primary" onClick={() => { store.reset(); complete('Demo reset. Your pockets are ready for a fresh start.'); }}>Reset demo</button></div></>}
      {modal.type === 'category' && <CategoryDetail category={budgets.find(b => b.id === modal.category)} state={state} onTransfer={() => setModal({ type: 'transfer', to: modal.category, from: modal.category === 'shopping' ? 'dining' : 'shopping' })} onTransactions={() => { setModal(null); navigate('transactions', modal.category); }} />}
    </Modal>}
  </div>;
}

function TransactionList({ transactions, compact = false }) {
  if (!transactions.length) return <div className="empty-state small-empty"><Icon name="search" size={28} /><h3>No matching transactions.</h3><p>Try another merchant or category.</p></div>;
  return <div className={`transaction-list ${compact ? 'compact' : ''}`}>{!compact && <div className="transaction-table-head"><span>Merchant</span><span>Category</span><span>Date</span><span>Amount</span></div>}{transactions.map(t => {
    const category = CATEGORIES.find(c => c.id === t.category);
    return <div className="transaction-row" key={t.id}><div className="merchant-cell"><CategoryIcon category={category} small /><div><strong>{t.merchant}</strong><span>{compact ? category.name : 'Demo expense'}</span></div></div>{!compact && <span className="category-tag" style={{ background: category.tint, color: category.color }}>{category.name}</span>}<span className="transaction-date">{new Date(`${t.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span><strong className="transaction-amount">−{money(t.amountCents, true)}</strong></div>;
  })}</div>;
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
  return <dialog ref={dialogRef} className="modal" aria-labelledby="modal-title" onCancel={e => { e.preventDefault(); onCloseRef.current(); }} onClick={e => { if (e.target === dialogRef.current) { const r = dialogRef.current.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onCloseRef.current(); } }}><div className="modal-inner"><div className="modal-heading"><span className="eyebrow">YOUR POCKET, YOUR CALL</span><button className="icon-button" onClick={onClose} aria-label="Close dialog"><Icon name="close" /></button></div><h2 id="modal-title">{title}</h2>{children}</div></dialog>;
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

  function review(e) {
    e.preventDefault();
    try { setProposal(proposeTransfer(state, { from, to, amountCents: parseMoney(amount), id: crypto.randomUUID() })); setError(''); }
    catch (err) { setError(err.message); }
  }
  function confirm() {
    try { store.transfer(proposal); onComplete(`${money(proposal.amountCents)} moved from ${source.name.toLowerCase()} to ${destination.name.toLowerCase()}.`); }
    catch (err) { setError(err.message); }
  }

  return <><p className="modal-description">{proposal ? 'Take a look before you make the move. Nothing changes until you confirm.' : 'Shift your allocation between categories. Your total budget stays the same.'}</p>{proposal ? <div className="transfer-review"><span className="review-amount">{money(proposal.amountCents)}</span><span className="review-route">{source.name}<Icon name="arrow" size={18} />{destination.name}</span><div className="review-balances">{[source, destination].map((b, i) => <div key={b.id}><span>{b.name} remaining</span><strong>{money(b.remaining)}<Icon name="arrow" size={16} />{money(b.remaining + (i ? 1 : -1) * proposal.amountCents)}</strong></div>)}</div><p><Icon name="info" size={15} />This adjusts your budget. It does not move real money.</p></div> : <form id="transfer-form" onSubmit={review}><div className="form-pair"><label>Move from<select value={from} onChange={e => setFrom(e.target.value)}>{budgets.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><small>{money(source.remaining)} available</small></label><label>Move to<select value={to} onChange={e => setTo(e.target.value)}>{budgets.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><small>{money(destination.remaining)} remaining</small></label></div><label className="amount-label">Amount<span className="amount-input"><span>$</span><input aria-label="Transfer amount" value={amount} inputMode="decimal" onChange={e => setAmount(e.target.value)} placeholder="20.00" required autoComplete="off" /></span></label><div className="amount-presets">{['10', '20', '50'].map(value => <button className={amount === value ? 'selected' : ''} type="button" key={value} onClick={() => setAmount(value)}>${value}</button>)}</div></form>}{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions">{proposal && <button className="button secondary" onClick={() => { setProposal(null); setError(''); }}>Back</button>}{proposal ? <button className="button primary" onClick={confirm}><Icon name="check" size={17} />Confirm transfer</button> : <button className="button primary full-width" type="submit" form="transfer-form">Review transfer<Icon name="arrow" size={17} /></button>}</div><p className="modal-footnote">Demo workspace · Changes are saved in this browser</p></>;
}

function ExpenseForm({ onComplete }) {
  const [error, setError] = useState('');
  function submit(e) {
    e.preventDefault(); const data = new FormData(e.currentTarget);
    try { store.addExpense({ id: crypto.randomUUID(), merchant: String(data.get('merchant')), category: String(data.get('category')), amountCents: parseMoney(data.get('amount')), date: String(data.get('date')) }); onComplete('Expense added. Your budget is up to date.'); }
    catch (err) { setError(err.message); }
  }
  return <form onSubmit={submit}><p className="modal-description">Record a purchase in your demo budget. This is a manual entry, not a bank payment.</p><label>Merchant<input name="merchant" placeholder="e.g. Your favorite coffee spot" maxLength={80} required /></label><div className="form-pair"><label>Amount ($)<input name="amount" inputMode="decimal" placeholder="0.00" required /></label><label>Category<select name="category">{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div><label>Date<input name="date" type="date" defaultValue={DEMO_DATE} min="2026-10-01" max="2026-10-31" required /></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="submit" className="button primary full-width"><Icon name="plus" size={17} />Add expense</button></div></form>;
}

function CategoryDetail({ category, state, onTransfer, onTransactions }) {
  const adjustments = state.adjustments.filter(a => a.from === category.id || a.to === category.id);
  return <><p className="modal-description">{category.description}. October 2026.</p><div className="category-detail-summary"><CategoryIcon category={category} /><div><span>Remaining allocation</span><strong>{money(category.remaining)}</strong></div></div><div className="reset-summary"><span>Allocated<strong>{money(category.limit)}</strong></span><span>Spent<strong>{money(category.spent)}</strong></span></div><h3 className="detail-subtitle">Recent spending</h3><TransactionList transactions={[...state.transactions].filter(t => t.category === category.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3)} compact />{adjustments.length > 0 && <><h3 className="detail-subtitle">Latest adjustment</h3><ActivityList adjustments={adjustments.slice(0, 1)} /></>}<div className="modal-actions"><button className="button secondary" onClick={onTransactions}>All transactions</button><button className="button primary" onClick={onTransfer}>Move budget<Icon name="transfer" size={17} /></button></div></>;
}
