import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CATEGORIES, DEMO_DATE, getBudgets, getTotals, money } from './lib/budget.js';
import { DEFAULT_PROFILE } from './lib/preferences.js';
import { store, connected } from './lib/store.js';
import { locationStatus, nativeLocation, startSharing, stopSharing } from './lib/location.js';

export const art = name => `/figma/final/${name}`;
const pinIcon = (number, active) => L.divIcon({ className: 'map-pin-wrap', html: `<img class="map-pin${active ? ' active' : ''}" src="/figma/final/pin.png" alt="Place ${number}" />`, iconSize: [41, 41], iconAnchor: [20, 41] });
export function Flower({ small = false }) {
  return <span className={`lila-flower ${small ? 'small' : ''}`} aria-hidden="true">
    <img className={small ? '' : 'flower-shadow'} src={art(small ? '4-imgVector2-19431.svg' : '4-imgVector3-94ce1.svg')} alt="" />
    <img className={small ? '' : 'flower-front'} src={art(small ? '4-imgVector1-6a197.svg' : '4-imgVector4-09619.svg')} alt="" />
    <img className="flower-center" src={art(small ? '4-imgEllipse4-f1184.svg' : '4-imgEllipse5-49e6d.svg')} alt="" />
  </span>;
}
export function SmsLink({ state, text = '', children = 'Text Lila', className = 'button primary' }) {
  if (!state.phone) return <span className="modal-footnote">Connect your demo phone to text Lila.</span>;
  return <a className={className} href={`sms:${state.phone}?body=${encodeURIComponent(text)}`}>{children}</a>;
}

// Shared pieces of the Figma "Final" screens.
// The soft purple light behind dark screens, placed by the design's ellipse position.
export const Glow = ({ x, y }) => <img className="lf-glow" src={art('2-imgEllipse2-2c086.svg')} alt="" aria-hidden="true" style={{ left: x - 70, top: y - 70 }} />;
// "lila" wordmark with its flower; `tone` picks the dark (white screens) or light artwork.
export function LilaBrand({ tone = 'dark', logo = true }) {
  return <div className={`lf-brand${tone === 'light' ? ' on-dark' : ''}`}>
    {logo && <span className="lf-logo" aria-hidden="true">{tone === 'dark'
      ? <><img className="lf-logo-shadow" src={art('4-imgVector2-19431.svg')} alt="" /><img className="lf-logo-front" src={art('4-imgVector1-6a197.svg')} alt="" /><img className="lf-logo-center" src={art('4-imgEllipse4-f1184.svg')} alt="" /></>
      : <img src={art('dashboard-logo-0eabe.svg')} alt="" />}</span>}
    <span>lila</span>
  </div>;
}
export const PlusButton = ({ tone = 'dark', label, onClick }) => <button className="lf-plus" aria-label={label} onClick={onClick}><img src={art(tone === 'dark' ? 'plus-dark-55779.svg' : 'plus-light-fd6a3.svg')} alt="" /></button>;
// Category artwork from the design; Groceries has none, so it uses a drawn basket.
const CATEGORY_ART = { dining: ['3-imgMeat1-c4edf.png', 16, true], shopping: ['3-imgMeat2-9dbcb.png', 15, true], transport: ['3-imgMeat3-50a37.png', 15, false], social: ['3-imgMeat4-627cf.png', 14, true] };
export function CategoryArt({ id }) {
  const [file, size, flip] = CATEGORY_ART[id] || [];
  return <span className="lf-cat-icon" aria-hidden="true"><img src={art('3-imgEllipse4-061cb.svg')} alt="" />
    {file ? <img className="lf-cat-art" src={art(file)} alt="" style={{ width: size, height: size, transform: flip ? 'scaleX(-1)' : undefined }} />
      : <svg className="lf-cat-art" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10h18l-2 10H5L3 10ZM7 10l3-7m7 7-3-7M9 14v3m6-3v3" /></svg>}
  </span>;
}
// The design lists Groceries after the others; it keeps every category.
const DISPLAY_ORDER = ['dining', 'shopping', 'transport', 'social', 'groceries'];
export const inDisplayOrder = budgets => [...budgets].sort((a, b) => DISPLAY_ORDER.indexOf(a.id) - DISPLAY_ORDER.indexOf(b.id));
const firstName = state => ({ ...DEFAULT_PROFILE, ...state.profile }).name.split(' ')[0];

export function Home({ state, navigate, onAdd }) {
  const budgets = inDisplayOrder(getBudgets(state));
  const totals = getTotals(state);
  const dining = budgets.find(b => b.id === 'dining');
  // Days left in the demo month, counting today, to spread what remains across them.
  const daysLeft = 32 - Number(DEMO_DATE.slice(-2));
  const perDay = cents => Math.max(0, Math.floor(cents / daysLeft / 100) * 100);
  const diningAllowance = perDay(dining.remaining);
  const dayBudget = perDay(totals.remaining);
  const plans = state.plans || [];
  const dot = i => i === plans.length - 1 ? 'schedule-dot-3-c997e.svg' : i === 0 ? 'schedule-dot-1-78c14.svg' : 'schedule-dot-2-1d9d8.svg';
  return <div className="lf-screen lf-home">
    <Glow x={58} y={679} /><Glow x={-80} y={67} />
    <header className="lf-hero">
      <LilaBrand />
      <PlusButton label="Add a purchase" onClick={onAdd} />
      <h1>Need something for<br /><strong>dinner</strong> <span>{firstName(state)}?</span></h1>
      <button className="lf-suggestion" onClick={() => navigate('nearby')}>
        <span className="lf-big-flower" aria-hidden="true">
          <span className="lf-big-flower-shadow"><img src={art('home-flower-shadow-5597f.svg')} alt="" /></span>
          <span className="lf-big-flower-front"><img src={art('home-flower-front-b45d1.svg')} alt="" /></span>
          <img className="lf-big-flower-center" src={art('4-imgEllipse5-49e6d.svg')} alt="" />
        </span>
        <span className="lf-reveal">Spend <strong>{money(diningAllowance)}</strong> to stay on track</span>
        <img className="lf-suggestion-arrow lf-reveal" src={art('suggestion-arrow-f64d0.svg')} alt="" />
      </button>
    </header>
    <p className="lf-day-label">Budget for the day</p>
    <p className="lf-day-amount">{money(dayBudget)}</p>
    <div className="lf-section-head"><h2>Schedule</h2><button onClick={() => navigate('budgets')}>Modify</button></div>
    <ol className="lf-schedule">{plans.map((p, i) => <li key={p.id}>
      <img className={`lf-dot${i === plans.length - 1 ? ' pulse' : ''}`} src={art(dot(i))} alt="" />
      {i < plans.length - 1 && <img className="lf-line" src={art('schedule-line-f65b6.svg')} alt="" />}
      <div className="lf-plan"><strong>{p.title}</strong><small>{p.detail}</small></div>
      <span className="lf-plan-amount">{money(p.amountCents)}</span>
    </li>)}</ol>
    <div className="lf-section-head lf-tracking-head"><h2>Budget Tracking</h2><button onClick={() => navigate('budgets')}>See more</button></div>
    <div className="lf-tracking" aria-label="Budget tracking">{budgets.map(b => <button className="lf-track-card" key={b.id} onClick={() => navigate('budgets')} aria-label={`${b.name}: ${money(b.remaining)} left`}>
      <CategoryArt id={b.id} /><span className="lf-track-name">{b.name}</span><strong>{money(b.remaining)}</strong>
    </button>)}</div>
  </div>;
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

export function Nearby({ state, onAdd }) {
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
    const instance = L.map(mapHost.current, { zoomControl: false }).setView([lat, lng], 14);
    instance.attributionControl.setPrefix(false);
    // OpenStreetMap's terms require the credit line; CSS mutes the tiles toward the design's light map.
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(instance);
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
  return <div className="lf-screen lf-nearby">
    <Glow x={-45} y={496} />
    <div className="lf-map">
      <div className="leaflet-host" ref={mapHost} role="region" aria-label="Map of nearby places" />
      <LilaBrand logo={false} />
      <PlusButton label="Add a purchase" onClick={onAdd} />
    </div>
    <section className="lf-places">
      <p className="lf-places-budget"><strong>Dining</strong>: <em>{money(dining.remaining)} left</em></p>
      <h1>{area}</h1>
      {places.map((p,i) => <article className={`lf-place${i === selected ? ' selected' : ''}`} key={`${p.name}-${i}`} tabIndex={0} onClick={() => choose(i)} onKeyDown={e => { if (e.key === 'Enter') choose(i); }} aria-current={i === selected || undefined}>
        <div className="lf-place-thumb" aria-hidden="true">{p.name.slice(0,1)}</div>
        <div className="lf-place-body"><h2>{i+1}. {p.name}</h2><p>{p.description}</p>
          {i === selected && <div className="lf-place-more"><span>About {money(Math.round(p.estimatedPrice*100))} per person · estimate</span><a href={p.sourceUrl} target="_blank" rel="noreferrer">Details ↗</a><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name+' '+p.area)}`} target="_blank" rel="noreferrer">Directions ↗</a></div>}
        </div>
      </article>)}
      {!places.length && <div className="nearby-empty"><Flower /><h2>Find your next little favorite.</h2><p>Lila uses your budget and preferences to find a few places worth trying.</p></div>}
      <button className="button primary full-width lf-find" disabled={busy || !connected || !state.agentEnabled} onClick={find}>{busy ? 'Lila is finding a few options…' : places.length ? 'Find fresh suggestions' : 'Find places for me'}</button>{busy && <p className="modal-footnote" role="status">Checking your budget and looking up real places. You can keep exploring the app.</p>}{error && <p role="alert" className="form-error">{error}</p>}<LocationControl state={state} />
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
