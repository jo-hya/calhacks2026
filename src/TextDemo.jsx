import { useState } from 'react';
import { store } from './lib/store.js';

export default function TextDemo({ state }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(action) { setBusy(true); setError(''); try { await action(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  return <section className="content-surface text-demo">
    <h2>Try the text flow</h2>
    <p>Forward a friend's invitation to Pocket privately. These replies are scripted; the numbers come from your Nessie sandbox purchases.</p>
    <blockquote>Friends: Dinner tonight? $55 each.</blockquote>
    <p className="modal-footnote">{state.nessie ? `${state.nessie.imported} Nessie purchases imported · ${state.nessie.excluded} excluded · synced ${new Date(state.nessie.syncedAt).toLocaleTimeString()}` : 'Waiting for Nessie connection'}</p>
    <button disabled={busy} className="button secondary" onClick={() => run(() => store.sync())}>Refresh from Nessie</button>
    <div className="text-transcript" role="log" aria-label="Scripted text conversation">{state.conversation?.map((m, i) => <div key={i} className={`text-bubble ${m.who === 'You' ? 'from-you' : ''}`}><small>{m.who} · {m.channel === 'sms' ? 'Phone SMS' : 'Rehearsal'}</small><p>{m.text}</p></div>)}</div>
    <div className="text-actions">
      <button disabled={busy} className="button primary" onClick={() => run(() => store.message(state.invitation))}>Forward dinner invite</button>
      {state.pendingReply && <><button disabled={busy} className="button primary" onClick={() => run(() => store.message(state.pendingReply))}>Reply {state.pendingReply}</button><button disabled={busy} className="button secondary" onClick={() => run(() => store.message('CANCEL'))}>Reply CANCEL</button></>}
    </div>
    {error && <p role="alert" className="form-error">{error}</p>}
    <h3>Try it on your phone</h3>
    <p>Text <strong>DINNER</strong> to {state.phone || 'your Bandwidth number'}, then send the exact YES code from Pocket's reply. The app updates automatically.</p>
    {state.phone && <a className="button secondary" href={`sms:${state.phone}?body=DINNER`}>Open Messages</a>}
    <p className="modal-footnote">Use your verified phone. The webhook and tunnel must be running. Rehearsal buttons do not send SMS. Reset from Profile to repeat.</p>
    {state.smsStatus?.map((s, i) => <p key={i} className="modal-footnote">SMS: {s.status}{s.error ? ` — ${s.error}` : ''}</p>)}
  </section>;
}
