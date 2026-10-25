import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CATEGORIES, DEMO_DATE, getBudgets, getTotals, money } from './lib/budget.js';
import { DEFAULT_PROFILE } from './lib/preferences.js';
import { store, connected } from './lib/store.js';
import { locationStatus, nativeLocation, startSharing, stopSharing } from './lib/location.js';

const asset = name => `/figma/final/${name}`;
const pinIcon = (number, active) => L.divIcon({ className: 'map-pin-wrap', html: `<img class="map-pin${active ? ' active' : ''}" src="/figma/final/pin.png" alt="Place ${number}" />`, iconSize: [41, 41], iconAnchor: [20, 41] });
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

const ChatIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" /></svg>;

const PlusIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;

export function Home({ state, navigate, onAdd }) {
  const profile = { ...DEFAULT_PROFILE, ...state.profile };
  const budgets = getBudgets(state);
  const totals = getTotals(state);
  const dining = budgets.find(b => b.id === 'dining');
  // Days left in the demo month, counting today, to spread what remains across them.
  const daysLeft = 32 - Number(DEMO_DATE.slice(-2));
  const perDay = cents => Math.max(0, Math.floor(cents / daysLeft / 100) * 100);
  const diningAllowance = perDay(dining.remaining);
  const dayBudget = perDay(totals.remaining);
  const plans = state.plans || [];
  return <>
    <header className="recommendation-hero">
      <div className="brand-row"><span className="lila-brand"><Flower small /><span>lila</span></span><button className="icon-button" aria-label="Add a purchase" onClick={onAdd}><PlusIcon /></button></div>
      <h1>Need something for<br /><strong>dinner</strong> {profile.name.split(' ')[0]}?</h1>
      <button className="daily-suggestion" onClick={() => navigate('nearby')}><Flower /><span className="suggestion-copy">Spend <strong>{money(diningAllowance)}</strong> to stay on track</span><span className="suggestion-arrow" aria-hidden="true">›</span></button>
    </header>
    <section className="home-dark">
      <div className="home-day"><span>Budget for the day</span><strong>{money(dayBudget)}</strong></div>
      <div className="home-schedule">
        <div className="section-row"><h2>Schedule</h2><button className="text-button" onClick={() => navigate('budgets')}>Modify</button></div>
        <ol className="schedule-list">{plans.map((p, i) => <li key={p.id}><span className={`schedule-dot ${i < 2 ? 'filled' : ''}`} aria-hidden="true" /><div><strong>{p.title}</strong><small>{p.detail}</small></div><span className="schedule-amount">{money(p.amountCents)}</span></li>)}</ol>
      </div>
      <section className="home-tracking" aria-label="Budget tracking">
        <div className="section-row"><h2>Budget Tracking</h2><button className="text-button" onClick={() => navigate('budgets')}>See more</button></div>
        <div className="tracking-row">{budgets.map(b => <button className="tracking-card" key={b.id} onClick={() => navigate('budgets')} aria-label={`${b.name}: ${money(b.remaining)} left`}><span className="tracking-name">{b.name}</span><strong>{money(b.remaining)}</strong></button>)}</div>
      </section>
    </section>
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
  // The map pins each recommendation; choosing a card or a pin highlights both.
  const places = state.recommendations || [];
  const [selected, setSelected] = useState(null);
  const mapHost = useRef(null), map = useRef(null), pins = useRef([]);
  useEffect(() => {
    const instance = L.map(mapHost.current, { zoomControl: false, attributionControl: false }).setView([lat, lng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(instance);
    if (loc) L.circleMarker([lat, lng], { radius: 7, color: '#fff', weight: 3, fillColor: '#3d1d46', fillOpacity: 1 }).addTo(instance);
    map.current = instance;
    return () => { instance.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    pins.current.forEach(pin => pin.remove());
    pins.current = places.flatMap((p, i) => p.lat == null ? [] : [L.marker([p.lat, p.lng], { icon: pinIcon(i + 1, i === selected), title: p.name, zIndexOffset: i === selected ? 1000 : 0 }).on('click', () => choose(i)).addTo(instance)]);
  }, [state.recommendations, selected]);
  useEffect(() => {
    const instance = map.current;
    const located = pins.current.map(pin => pin.getLatLng());
    if (instance && located.length) instance.fitBounds(located, { padding: [48, 48], maxZoom: 16 });
  }, [state.recommendationsAt]);
  function choose(i) {
    setSelected(i);
    const p = places[i];
    if (p?.lat != null) map.current?.panTo([p.lat, p.lng]);
  }
  async function find() {
    setBusy(true); setError('');
    try { await store.message(`Find up to 3 cheaper dining options near ${area}. My preferences: ${profile.preferences || 'flexible'}. Read my dining budget and save the researched recommendations to the app. Include source links and label prices as estimates. Do not propose purchases.`); }
    catch(e) { setError(e.message); } finally { setBusy(false); }
  }
  return <div className="nearby-screen">
    <div className="nearby-map">
      <div className="leaflet-host" ref={mapHost} role="region" aria-label="Map of nearby places" />
      <div className="nearby-top"><span className="lila-brand"><Flower small /><span>lila</span></span></div>
      <span className="map-weekly">⌄ WEEKLY</span>
    </div>
    <section className="nearby-results">
      <p className="nearby-budget">Dining: <strong>{money(dining.remaining)} left</strong></p>
      <h1>{area}</h1>
      {places.map((p,i) => <article className={`place-card${i === selected ? ' selected' : ''}`} key={`${p.name}-${i}`} tabIndex={0} onClick={() => choose(i)} onKeyDown={e => { if (e.key === 'Enter') choose(i); }} aria-current={i === selected || undefined}>
        <div className="place-thumb" aria-hidden="true"><span>{p.name.slice(0,1)}</span></div>
        <div className="place-body"><h2>{i+1}. {p.name}</h2><p>{p.description}</p><span className="price-estimate">About {money(Math.round(p.estimatedPrice*100))} per person · estimate</span><div className="place-links"><a href={p.sourceUrl} target="_blank" rel="noreferrer">Details ↗</a><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name+' '+p.area)}`} target="_blank" rel="noreferrer">Directions ↗</a><SmsLink state={state} className="text-link" text={`Tell me more about ${p.name}.`} /></div></div>
      </article>)}
      {!places.length && <div className="nearby-empty"><Flower /><h2>Find your next little favorite.</h2><p>Lila uses your budget and preferences to find a few places worth trying.</p></div>}
      <button className="button primary full-width" disabled={busy || !connected || !state.agentEnabled} onClick={find}>{busy ? 'Lila is finding a few options…' : places.length ? 'Find fresh suggestions' : 'Find places for me'}</button>{busy && <p className="modal-footnote" role="status">Checking your budget and looking up real places. You can keep exploring the app.</p>}{error && <p role="alert" className="form-error">{error}</p>}<LocationControl state={state} />
    </section>
  </div>;
}

export function Setup({ state, onComplete }) {
  const profile = { ...DEFAULT_PROFILE, ...state.profile };
  const [step, setStep] = useState(0);
  const [name, setName] = useState(profile.name);
  const [area, setArea] = useState(profile.area);
  const [preferences, setPreferences] = useState(profile.preferences);
  const [budgets, setBudgets] = useState(Object.fromEntries(CATEGORIES.map(c => [c.id, String(state.budgets[c.id]/100)])));
  const [locationOn, setLocationOn] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Dollar inputs become integer cents; anything malformed is reported on the budget step.
  const centsFromBudgets = () => Object.fromEntries(Object.entries(budgets).map(([key, value]) => {
    if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('Use dollar amounts with up to two decimal places.');
    return [key, Math.round(Number(value) * 100)];
  }));
  async function save(e) {
    e.preventDefault(); setError('');
    if (step === 0) { if (!name.trim() || !area.trim()) { setError('Add your name and area to get started.'); return; } setStep(1); return; }
    if (step === 1) { try { centsFromBudgets(); setStep(2); } catch (err) { setError(err.message); } return; }
    setBusy(true);
    try {
      await store.updateProfile({ name, area, preferences, budgets: centsFromBudgets(), onboarded: true });
      // Location is only switched on by an explicit opt-in here; Nearby shows the status afterwards.
      if (locationOn) { try { await startSharing(); } catch { /* Nearby shows the status and error */ } }
      onComplete();
    }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  const heading = ['Make yourself at home.', 'Give your plans some room.', 'Let Lila look out for you.'][step];
  const intro = ['A few details help Lila find things you’ll actually enjoy.', 'Set your monthly categories. You can adjust these here or by texting Lila.', 'Nearby heads-ups are optional. Lila only checks your location to spot places where you usually spend.'][step];
  return <form className="setup-form" onSubmit={save}><span className="setup-step">{step+1} of 3 · YOUR LITTLE START</span><h2>{heading}</h2><p>{intro}</p>
    {step === 0 && <><label>Your name<input value={name} onChange={e=>setName(e.target.value)} maxLength={80} required autoComplete="given-name" /></label><label>City or neighborhood<input value={area} onChange={e=>setArea(e.target.value)} maxLength={80} required /></label><label>Things you enjoy<input value={preferences} onChange={e=>setPreferences(e.target.value)} maxLength={500} placeholder="Vegetarian, coffee, walks, low-key dinners…" /></label></>}
    {step === 1 && <><div className="setup-source"><strong>{connected ? 'Nessie sandbox connected' : 'Sample purchases'}</strong><p>Demo purchases help you try Lila. No real bank account or payments.</p></div><div className="form-pair">{CATEGORIES.map(c=><label key={c.id}>{c.name} ($)<input value={budgets[c.id]} onChange={e=>setBudgets({...budgets,[c.id]:e.target.value})} inputMode="decimal" required /></label>)}</div><p className="setup-total">Monthly total <strong>{money(Math.round(Object.values(budgets).reduce((n,v)=>n+(Number(v)||0),0)*100))}</strong></p><p className="modal-footnote">{state.phone ? `Text Lila at ${state.phone} from your preverified demo phone.` : 'SMS is available when connected to the demo backend.'}</p></>}
    {step === 2 && <><div className="setup-source"><strong>What Lila checks</strong><p>When you're near a place you usually spend, Lila can text one budget heads-up, even while the app is closed. Your location isn't shared, and you can pause it anytime in Nearby.</p></div><label className="check-row"><input type="checkbox" checked={locationOn} onChange={e=>setLocationOn(e.target.checked)} /> Turn on nearby heads-ups</label></>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions">{step>0 && <button type="button" className="button secondary" onClick={()=>{ setError(''); setStep(step-1); }}>Back</button>}<button className="button primary" disabled={busy}>{busy ? 'Saving…' : step === 2 ? 'Make room for life' : 'Continue'}</button></div></form>;
}

// Presentation shortcut: the server waits, then treats the phone as arriving at Gather.
// Lock the phone after tapping so the heads-up text arrives while Lila is closed.
export function DemoArrival({ state }) {
  const [note, setNote] = useState('');
  const enabled = state.profile?.locationEnabled;
  async function arrive() {
    setNote('');
    try { await store.demoArrival(10); setNote('Arriving at Gather in 10 seconds. Lock your phone now.'); }
    catch (e) { setNote(e.message); }
  }
  return <div className="location-control"><div><strong>Demo: arrive at Gather</strong><span>{enabled ? 'Sends a real heads-up text in 10 seconds' : 'Turn on nearby heads-ups first'}</span></div><button className="button secondary" disabled={!connected || !enabled || !state.agentEnabled} onClick={arrive}>Arrive</button>{note && <p role="status">{note}</p>}</div>;
}
