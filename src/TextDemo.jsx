import { useState } from 'react';
import { store } from './lib/store.js';
import { locationSupported, isSharing, startSharing, stopSharing } from './lib/location.js';

// Demo spots for "pretend I'm at": Berkeley places in each kind of budget.
const PRETEND = [
  { label: 'Gather (restaurant)', place: 'Gather', category: 'dining', lat: 37.8697, lng: -122.2668 },
  { label: 'Uniqlo (clothing)', place: 'Uniqlo', category: 'shopping', lat: 37.8705, lng: -122.2681 },
];

export default function TextDemo({ state }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [sharing, setSharing] = useState(isSharing());
  const [lastLocation, setLastLocation] = useState(null);
  const agent = state.agentEnabled;
  async function run(action) { setBusy(true); setError(''); try { await action(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  const send = text => run(async () => { await store.message(text); setDraft(''); });
  function toggleSharing() {
    if (sharing) { stopSharing(); setSharing(false); return; }
    startSharing(setLastLocation, e => setError(e.message));
    setSharing(true);
  }
  const describe = l => l && (l.sent ? `Pocket texted you about ${l.place}.` : `No text${l.place ? ` for ${l.place}` : ''}: ${l.reason}`);

  return <section className="content-surface text-demo">
    <h2>Try the text flow</h2>
    <p>{agent
      ? 'Text Pocket like a friend. Replies are written by Claude from your Nessie sandbox purchases, and money only moves after you reply YES.'
      : "Forward a friend's invitation to Pocket privately. These replies are scripted; the numbers come from your Nessie sandbox purchases."}</p>
    <blockquote>Friends: Dinner tonight? $55 each.</blockquote>
    <p className="modal-footnote">{state.nessie ? `${state.nessie.imported} Nessie purchases imported · ${state.nessie.excluded} excluded · synced ${new Date(state.nessie.syncedAt).toLocaleTimeString()}` : 'Waiting for Nessie connection'}</p>
    <button disabled={busy} className="button secondary" onClick={() => run(() => store.sync())}>Refresh from Nessie</button>
    <div className="text-transcript" role="log" aria-label="Text conversation">{state.conversation?.map((m, i) => <div key={i} className={`text-bubble ${m.who === 'You' ? 'from-you' : ''}`}><small>{m.who} · {m.channel === 'sms' ? 'Phone SMS' : 'Rehearsal'}</small><p>{m.text}</p></div>)}</div>
    <div className="text-actions">
      <button disabled={busy} className="button primary" onClick={() => send(state.invitation)}>Forward dinner invite</button>
      {state.pendingReply && <><button disabled={busy} className="button primary" onClick={() => send(state.pendingReply)}>Reply {state.pendingReply}</button><button disabled={busy} className="button secondary" onClick={() => send('CANCEL')}>Reply CANCEL</button></>}
      {agent && <form className="text-compose" onSubmit={e => { e.preventDefault(); if (draft.trim()) send(draft.trim()); }}>
        <label><span className="sr-only">Message Pocket</span><input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Reply, e.g. ALT, KEEP or Berkeley 94704" maxLength={1000} /></label>
        <button disabled={busy || !draft.trim()} className="button secondary">Send</button>
      </form>}
      {busy && agent && <p className="modal-footnote">Pocket is thinking… this can take up to a minute.</p>}
    </div>
    {error && <p role="alert" className="form-error">{error}</p>}

    {agent && <>
      <h3>Location heads-ups</h3>
      <p>While Pocket is open, it can share your location so the agent texts you when you arrive somewhere your budget is tight.</p>
      {locationSupported() && <button className="button secondary" onClick={toggleSharing}>{sharing ? 'Stop sharing location' : 'Share my location'}</button>}
      <div className="text-actions">{PRETEND.map(p => <button key={p.place} disabled={busy} className="button secondary" onClick={() => run(async () => setLastLocation(await store.location(p)))}>Pretend I'm at {p.label}</button>)}</div>
      {lastLocation && <p className="modal-footnote">{describe(lastLocation)}</p>}
    </>}

    <h3>Try it on your phone</h3>
    <p>{agent
      ? <>Text {state.phone || 'your Bandwidth number'} from your verified phone: forward the dinner invite or ask anything about your budget. Reply YES to approve a move or payment.</>
      : <>Text <strong>DINNER</strong> to {state.phone || 'your Bandwidth number'}, then send the exact YES code from Pocket's reply. The app updates automatically.</>}</p>
    {state.phone && <a className="button secondary" href={`sms:${state.phone}?body=${agent ? encodeURIComponent(state.invitation) : 'DINNER'}`}>Open Messages</a>}
    <p className="modal-footnote">Use your verified phone. The webhook and tunnel must be running. Rehearsal messages do not send SMS{agent ? '; location heads-ups do' : ''}. Reset from Profile to repeat.</p>
    {state.smsStatus?.map((s, i) => <p key={i} className="modal-footnote">SMS: {s.status}{s.error ? ` — ${s.error}` : ''}</p>)}
  </section>;
}
