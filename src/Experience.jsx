import { useEffect, useState } from 'react';
import { CATEGORIES, DEMO_DATE, getBudgets, getTotals, money } from './lib/budget.js';
import { DEFAULT_PROFILE } from './lib/preferences.js';
import { store, connected } from './lib/store.js';
import { locationStatus, nativeLocation, startSharing, stopSharing } from './lib/location.js';

const asset = name => `/figma/final/${name}`;
export function Flower({ small = false }) {
  return <span className={`lila-flower ${small ? 'small' : ''}`} aria-hidden="true">
    <img className={small ? '' : 'flower-shadow'} src={asset(small ? '4-imgVector2-19431.svg' : '4-imgVector3-94ce1.svg')} alt="" />
    <img className={small ? '' : 'flower-front'} src={asset(small ? '4-imgVector1-6a197.svg' : '4-imgVector4-09619.svg')} alt="" />
    <img className="flower-center" src={asset(small ? '4-imgEllipse4-f1184.svg' : '4-imgEllipse5-49e6d.svg')} alt="" />
  </span>;
}
export function SmsLink({ state, text = '', children = 'Text Lila', className = 'button primary' }) {
  if (!state.phone) return <span className="modal-footnote">Connect your demo phone to text Lila.</span>;
  return <a className={className} href={`sms:${state.phone}?body=${encodeURIComponent(text)}`}>{children}</a>;
}

export function Home({ state, navigate }) {
  const profile = { ...DEFAULT_PROFILE, ...state.profile };
  const budgets = getBudgets(state);
  const dining = budgets.find(b => b.id === 'dining');
  const allowance = Math.max(0, Math.floor(dining.remaining / (32 - Number(DEMO_DATE.slice(-2))) / 100) * 100);
  const [selected, setSelected] = useState(5);
  const days = Array.from({ length: 7 }, (_, i) => `2026-10-${19 + i}`);
  const amounts = days.map(date => state.transactions.filter(t => t.date === date).reduce((n,t) => n + t.amountCents, 0));
  const max = Math.max(1000, ...amounts);
  const points = amounts.map((v,i) => `${20 + i * 49},${150 - v / max * 122}`).join(' ');
  return <>
    <header className="recommendation-hero">
      <div className="brand-row"><span className="lila-brand"><Flower small /><span>lila</span></span><SmsLink state={state} className="icon-button" text="Can you help me plan something within my budget?"><img src={asset('4-imgNotification1-a3ede.png')} width="24" height="24" alt="Text Lila" /></SmsLink></div>
      <h1>Need something for<br /><strong>dinner</strong> {profile.name.split(' ')[0]}?</h1>
      <button className="daily-suggestion" onClick={() => navigate('nearby')}><Flower /><span className="suggestion-copy">Aim for <strong>{money(allowance)}</strong> to stay on track</span></button>
    </header>
    <section className="daily-chart" aria-label="Daily spending this week">
      <div className="chart-heading"><strong>Oct 2026</strong><span>Daily Spend</span><span className="period-pill">This week</span></div>
      <svg viewBox="0 0 344 180" role="img" aria-label={`Selected day: ${days[selected]}, ${money(amounts[selected])} spent`}>
        {days.map((day,i) => <line key={day} x1={20+i*49} x2={20+i*49} y1="14" y2="150" stroke="#7f5679" opacity=".4" />)}
        <line x1="20" x2="324" y1="150" y2="150" stroke="#7f5679" opacity=".4" />
        <polyline points={points} fill="none" stroke="#f2eaf2" strokeWidth="1.5" />
        <circle cx={20+selected*49} cy={150-amounts[selected]/max*122} r="4" fill="white" stroke="#ad7ca6" strokeWidth="2" />
        {days.map((day,i) => <text key={day} x={20+i*49} y="171" textAnchor="middle" fill="#e5cfeb" fontSize="10">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i]}</text>)}
      </svg>
      <div className="chart-day-buttons">{days.map((day,i) => <button key={day} aria-label={`${day}: ${money(amounts[i])}`} aria-pressed={selected===i} onClick={() => setSelected(i)} />)}</div>
      <p className="chart-readout">{new Date(`${days[selected]}T12:00:00`).toLocaleDateString('en-US',{weekday:'long'})} <strong>{money(amounts[selected])}</strong></p>
    </section>
    <section className="home-next"><span className="eyebrow">A LITTLE ROOM FOR YOUR PLANS</span><h2>{state.locationInsight ? `Near ${state.locationInsight.place}` : 'Your plans, with a little flexibility.'}</h2><p>{state.locationInsight?.text || `${money(dining.remaining)} left for dining. Find a nearby option, make room in your budget, or enjoy something free.`}</p><div className="home-next-actions"><button className="button secondary" onClick={() => navigate('nearby')}>Explore nearby</button><SmsLink state={state} text="Friends invited me to dinner for $55. Can you help me figure out my options?" /></div></section>
  </>;
}

export function LocationControl({ state }) {
  const [status, setStatus] = useState({ active: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { const refresh = () => locationStatus().then(setStatus).catch(() => {}); refresh(); const id = setInterval(refresh, 5000); return () => clearInterval(id); }, []);
  async function toggle() {
    setBusy(true); setError('');
    try { if (status.active) await stopSharing(); else await startSharing(); setStatus(await locationStatus()); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <div className="location-control"><div><strong>Nearby heads-ups</strong><span>{status.active ? 'On · looking out for your budget' : 'Off · your location stays private'}</span></div><button className="button secondary" disabled={busy || !connected} onClick={toggle}>{busy ? 'One moment…' : status.active ? 'Pause' : 'Enable'}</button><p>{nativeLocation ? 'Allow location to get a text near spending spots, even when you switch apps or lock your phone. Pause anytime.' : 'Location works while this page is open. Background heads-ups are available in the Android app.'}</p>{status.active && status.message && <p role="status">{status.message}</p>}{error && <p role="alert" className="form-error">{error}</p>}</div>;
}

export function Nearby({ state }) {
  const dining = getBudgets(state).find(b => b.id === 'dining');
  const profile = { ...DEFAULT_PROFILE, ...state.profile };
  const loc = state.lastLocation;
  const lat = loc?.lat ?? 37.7599, lng = loc?.lng ?? -122.4148;
  const area = loc?.city || profile.area;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function find() {
    setBusy(true); setError('');
    try { await store.message(`Find up to 3 cheaper dining options near ${area}. My preferences: ${profile.preferences || 'flexible'}. Read my dining budget and save the researched recommendations to the app. Include source links and label prices as estimates. Do not propose purchases.`); }
    catch(e) { setError(e.message); } finally { setBusy(false); }
  }
  return <div className="nearby-screen"><div className="nearby-map"><iframe title="Nearby map" src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng-.014},${lat-.014},${lng+.014},${lat+.014}&layer=mapnik&marker=${lat},${lng}`} loading="lazy" /><span className="map-label">{loc ? 'Your latest location' : 'Explore San Francisco'}</span><a className="map-open" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(area+' restaurants')}`} target="_blank" rel="noreferrer">Open map ↗</a></div>
    <section className="nearby-results"><p className="nearby-budget">Dining: <strong>{money(dining.remaining)} left</strong></p><h1>{area}</h1><p className="nearby-intro">A good time can fit your pocket.</p>
      {state.recommendations?.map((p,i) => <article className="place-card" key={`${p.name}-${i}`}><div className="place-number">{i+1}</div><div><h2>{p.name}</h2><p>{p.description}</p><span className="price-estimate">About {money(Math.round(p.estimatedPrice*100))} per person · estimate</span><div className="place-links"><a href={p.sourceUrl} target="_blank" rel="noreferrer">Details ↗</a><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name+' '+p.area)}`} target="_blank" rel="noreferrer">Directions ↗</a><SmsLink state={state} className="text-link" text={`Tell me more about ${p.name}.`} /></div></div></article>)}
      {!state.recommendations?.length && <div className="nearby-empty"><Flower /><h2>Find your next little favorite.</h2><p>Lila uses your budget and preferences to find a few places worth trying.</p></div>}
      <button className="button primary full-width" disabled={busy || !connected || !state.agentEnabled} onClick={find}>{busy ? 'Lila is finding a few options…' : state.recommendations?.length ? 'Find fresh suggestions' : 'Find places for me'}</button>{busy && <p className="modal-footnote" role="status">Checking your budget and looking up real places. You can keep exploring the app.</p>}{error && <p role="alert" className="form-error">{error}</p>}<LocationControl state={state} />
    </section></div>;
}

export function Setup({ state, onComplete }) {
  const profile = { ...DEFAULT_PROFILE, ...state.profile };
  const [step, setStep] = useState(0);
  const [name, setName] = useState(profile.name);
  const [area, setArea] = useState(profile.area);
  const [preferences, setPreferences] = useState(profile.preferences);
  const [budgets, setBudgets] = useState(Object.fromEntries(CATEGORIES.map(c => [c.id, String(state.budgets[c.id]/100)])));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault(); setError('');
    if (step === 0) { if (!name.trim() || !area.trim()) { setError('Add your name and area to get started.'); return; } setStep(1); return; }
    setBusy(true);
    try { const cents = Object.fromEntries(Object.entries(budgets).map(([key,value]) => { if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('Use dollar amounts with up to two decimal places.'); return [key, Math.round(Number(value)*100)]; })); await store.updateProfile({ name, area, preferences, budgets: cents, onboarded: true }); onComplete(); }
    catch(e) { setError(e.message); } finally { setBusy(false); }
  }
  return <form className="setup-form" onSubmit={save}><span className="setup-step">{step+1} of 2 · YOUR LITTLE START</span><h2>{step === 0 ? 'Make yourself at home.' : 'Give your plans some room.'}</h2><p>{step === 0 ? 'A few details help Lila find things you’ll actually enjoy.' : 'Set your monthly categories. You can adjust these here or by texting Lila.'}</p>{step === 0 ? <><label>Your name<input value={name} onChange={e=>setName(e.target.value)} maxLength={80} required autoComplete="given-name" /></label><label>City or neighborhood<input value={area} onChange={e=>setArea(e.target.value)} maxLength={80} required /></label><label>Things you enjoy<input value={preferences} onChange={e=>setPreferences(e.target.value)} maxLength={500} placeholder="Vegetarian, coffee, walks, low-key dinners…" /></label></> : <><div className="setup-source"><strong>{connected ? 'Nessie sandbox connected' : 'Sample purchases'}</strong><p>Demo purchases help you try Lila. No real bank account or payments.</p></div><div className="form-pair">{CATEGORIES.map(c=><label key={c.id}>{c.name} ($)<input value={budgets[c.id]} onChange={e=>setBudgets({...budgets,[c.id]:e.target.value})} inputMode="decimal" required /></label>)}</div><p className="setup-total">Monthly total <strong>{money(Math.round(Object.values(budgets).reduce((n,v)=>n+(Number(v)||0),0)*100))}</strong></p><p className="modal-footnote">{state.phone ? `Text Lila at ${state.phone} from your preverified demo phone.` : 'SMS is available when connected to the demo backend.'} Location is optional; enable it from Nearby.</p></>}{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions">{step>0 && <button type="button" className="button secondary" onClick={()=>setStep(0)}>Back</button>}<button className="button primary" disabled={busy}>{busy ? 'Saving…' : step === 0 ? 'Continue' : 'Make room for life'}</button></div></form>;
}
