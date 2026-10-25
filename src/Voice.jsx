import { useEffect, useRef, useState } from 'react';
import { store, connected } from './lib/store.js';
import { Flower } from './Experience.jsx';

// Voice and chat with Lila. Speech is recognized and read aloud by the browser; the words go
// through the same agent as SMS, so anything Lila can do by text she can do here.
const Recognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
const SUGGESTIONS = ['How am I doing with my spending?', 'Help me save for a trip next month'];

const MicIcon = ({ off = false }) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />{off && <path d="M3 3l18 18" />}</svg>;
const SpeakerIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z" /><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" /></svg>;
const BackIcon = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6" /></svg>;

export default function VoiceScreen({ state, navigate }) {
  const profile = { ...state.profile };
  const name = (profile.name || 'there').split(' ')[0];
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(true);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const recognition = useRef(null);
  const spoken = useRef(null);
  const last = state.conversation?.at(-1);

  // Read Lila's newest reply aloud when the speaker is on.
  useEffect(() => {
    if (!last || last.who !== 'Lila' || last.text === spoken.current) return;
    spoken.current = last.text;
    if (speaking && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(last.text));
    }
  }, [last?.text, speaking]);
  useEffect(() => () => { recognition.current?.abort(); window.speechSynthesis?.cancel(); }, []);

  async function send(text) {
    const clean = text.trim();
    if (!clean) return;
    if (!connected) { setNote('Connect to the demo backend to talk with Lila.'); return; }
    setBusy(true); setNote('');
    try { await store.message(clean); setDraft(''); }
    catch (error) { setNote(error.message); }
    finally { setBusy(false); }
  }

  function toggleListening() {
    if (listening) { recognition.current?.stop(); setListening(false); return; }
    if (!Recognition) { setNote('Voice isn’t available in this browser. Type to Lila below.'); return; }
    const r = new Recognition();
    r.lang = 'en-US'; r.interimResults = false; r.maxAlternatives = 1;
    r.onresult = event => { setListening(false); send(event.results[0][0].transcript); };
    r.onerror = () => { setListening(false); setNote('I couldn’t hear that. Try again, or type to Lila below.'); };
    r.onend = () => setListening(false);
    recognition.current = r;
    r.start();
    setListening(true);
  }

  return <section className="voice-screen" aria-label="Talk to Lila">
    <header className="voice-top">
      <button className="icon-button voice-back" aria-label="Back to Home" onClick={() => navigate('overview')}><BackIcon /></button>
      <span className="lila-brand voice-brand"><Flower small /><span>lila</span></span>
      <span className="voice-top-spacer" aria-hidden="true" />
    </header>
    <h1 className="voice-title">Let’s talk, {name}.</h1>
    <div className="voice-flower" aria-hidden="true"><Flower /></div>
    {last && <p className="voice-last" aria-live="polite"><strong>{last.who === 'You' ? 'You' : 'Lila'}:</strong> {last.text}</p>}
    <p className="voice-hint">Not sure where to start? Try asking</p>
    <div className="voice-chips">{SUGGESTIONS.map(s => <button key={s} className="voice-chip" disabled={busy} onClick={() => send(s)}>{s}<span aria-hidden="true">↗</span></button>)}</div>
    <form className="voice-type" onSubmit={e => { e.preventDefault(); send(draft); }}>
      <label><span className="sr-only">Message Lila</span><input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Or type to Lila…" maxLength={1000} /></label>
      <button className="button primary" disabled={busy || !draft.trim()}>{busy ? 'Sending…' : 'Send'}</button>
    </form>
    {note && <p className="modal-footnote" role="status">{note}</p>}
    <div className="voice-controls">
      <button className={`voice-mic ${listening ? 'on' : ''}`} aria-pressed={listening} aria-label={listening ? 'Stop listening' : 'Start talking'} onClick={toggleListening}><MicIcon off={!listening} /></button>
      <button className={`voice-speaker ${speaking ? 'on' : ''}`} aria-pressed={speaking} aria-label={speaking ? 'Mute Lila’s voice' : 'Hear Lila’s voice'} onClick={() => { setSpeaking(s => !s); window.speechSynthesis?.cancel(); }}><SpeakerIcon /></button>
    </div>
  </section>;
}
