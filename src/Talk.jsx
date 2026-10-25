import { useEffect, useRef, useState } from 'react';
import { store, connected } from './lib/store.js';
import { DEFAULT_PROFILE } from './lib/preferences.js';
import { createVoiceSession, voiceSupported } from './lib/voiceSession.js';
import { art } from './Experience.jsx';

// Chat and voice with Lila (Figma "Lila • Chat conversation" and "Lila • Voice conversation").
// Both go to the same agent as texts, so anything Lila can do by SMS she can do here.
const STARTERS = [
  { text: 'How am I doing with my spending?', icon: 'chat-wallet-80e49.svg' },
  { text: 'Help me save for a trip next month', icon: 'chat-sprout-108b1.svg' },
];
const firstName = state => ({ ...DEFAULT_PROFILE, ...state.profile }).name.split(' ')[0];

function TalkHeader({ onBack, backLabel }) {
  return <header className="lf-talk-header">
    <button className="lf-talk-back" aria-label={backLabel} onClick={onBack}><img src={art('talk-arrow-left-fbb45.svg')} alt="" /></button>
    <span className="lf-talk-brand"><img src={art('talk-logo-79e59.svg')} alt="" /><span>lila</span></span>
    <span className="lf-talk-spacer" aria-hidden="true" />
  </header>;
}

function TalkFlower({ mode }) {
  return <div className={`lf-talk-flower ${mode}`} aria-hidden="true">
    <span className="lf-tf-shadow"><img src={art('talk-flower-shadow.svg')} alt="" /></span>
    <span className="lf-tf-front"><img src={art('talk-flower-front.svg')} alt="" /></span>
    <img className="lf-tf-center" src={art('talk-flower-center-34d20.svg')} alt="" />
  </div>;
}

// `since` is the time of the last message before this chat began, so the thread shows
// only this conversation.
export function ChatScreen({ state, navigate, since }) {
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const end = useRef(null);
  const thread = (state.conversation || []).filter(m => m.channel !== 'sms' && m.at && m.at > since);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [thread.length, pending]);

  async function send(text) {
    const clean = text.trim();
    if (!clean || pending) return;
    if (!connected) { setError('Connect to the Lila server to chat: run npm run demo and open the pairing link.'); return; }
    setError(''); setPending(clean); setDraft('');
    try { await store.message(clean); }
    catch (e) { setError(e.message); setDraft(clean); }
    finally { setPending(''); }
  }

  return <section className="lf-talk lf-chat" aria-label="Chat with Lila">
    <TalkHeader onBack={() => navigate('overview')} backLabel="Back to Home" />
    <div className="lf-talk-body">
      {!thread.length && !pending ? <div className="lf-talk-sanctuary">
        <h1 className="lf-talk-title">Let’s chat, {firstName(state)}!</h1>
        <TalkFlower mode="chat" />
        <div className="lf-starters">
          <p>Not sure where to start? Try asking</p>
          {STARTERS.map(s => <button key={s.text} className="lf-starter" onClick={() => send(s.text)}>
            <img src={art(s.icon)} alt="" /><span>{s.text}</span><img src={art('chat-arrow-up-right-65c38.svg')} alt="" />
          </button>)}
        </div>
      </div> : <ol className="lf-thread" aria-live="polite">
        {thread.map((m, i) => <li key={`${m.at}-${i}`} className={`lf-bubble ${m.who === 'You' ? 'from-you' : 'from-lila'}`}>{m.text}</li>)}
        {pending && <><li className="lf-bubble from-you">{pending}</li><li className="lf-typing"><img src={art('talk-logo-79e59.svg')} alt="" />Lila is thinking…</li></>}
      </ol>}
      {error && <p className="lf-talk-note" role="alert">{error}</p>}
      <div ref={end} />
    </div>
    <form className="lf-composer" onSubmit={e => { e.preventDefault(); send(draft); }}>
      <img src={art('chat-message-circle-65db2.svg')} alt="" />
      <label className="sr-only" htmlFor="lila-message">Message Lila</label>
      <input id="lila-message" value={draft} onChange={e => setDraft(e.target.value)} placeholder="Type a message to Lila…" maxLength={1000} autoComplete="off" enterKeyHint="send" />
      <button type="button" className="lf-composer-mic" aria-label="Talk to Lila" onClick={() => navigate('voice')}><img src={art('chat-mic-a6257.svg')} alt="" /></button>
      <button className="lf-composer-send" aria-label="Send message" disabled={!draft.trim() || Boolean(pending)}><img src={art('chat-send-ed660.svg')} alt="" /></button>
    </form>
  </section>;
}

const STATUS = {
  idle: 'Tap the wave to start talking.',
  starting: 'Getting your mic ready…',
  listening: 'Listening…',
  hearing: 'Listening…',
  thinking: 'Thinking…',
  speaking: '',
  muted: 'Muted. Tap the mic to talk again.',
  paused: 'Paused. Tap the wave to keep talking.',
  stopped: '',
};
const WAVES = ['voice-wave-1-0a8b2.svg', 'voice-wave-2-b9121.svg', 'voice-wave-3-5c10b.svg', 'voice-wave-4-fb0bb.svg', 'voice-wave-5-012b8.svg'];

// Hands-free: listening starts on arrival; pauses end each turn (see lib/voiceSession.js).
export function VoiceScreen({ state, navigate }) {
  const [status, setStatus] = useState('idle');
  const [turn, setTurn] = useState(null);
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const session = useRef(null);
  const unavailable = !connected ? 'Voice needs the Lila server: run npm run demo and open the pairing link.'
    : !state.voiceEnabled ? 'Voice is off. Add CARTESIA_API_KEY to the server’s .env and restart it.'
    : !voiceSupported() ? 'This browser can’t record audio. Try Chrome or Safari, or chat instead.' : '';

  function start() {
    if (unavailable || session.current) return;
    setError(''); setMuted(false);
    const s = createVoiceSession({ send: blob => store.voice(blob, true), onState: setStatus, onTurn: setTurn, onError: setError });
    session.current = s;
    s.start().catch(e => {
      s.stop(); session.current = null; setStatus('idle');
      setError(e.name === 'NotAllowedError' ? 'Lila needs your microphone to talk. Allow it in your browser or phone settings, then tap the wave.' : e.message);
    });
  }
  useEffect(() => { start(); return () => { session.current?.stop(); session.current = null; }; }, [unavailable]);

  const live = status === 'hearing' || status === 'speaking';
  const waveLabel = !session.current ? 'Start talking' : status === 'paused' ? 'Keep talking' : 'Pause';
  return <section className="lf-talk lf-voice" aria-label="Talk to Lila">
    <TalkHeader onBack={() => navigate('chat')} backLabel="Back to chat" />
    <div className="lf-talk-body">
      <div className="lf-talk-sanctuary">
        <h1 className="lf-talk-title">Let’s talk, {firstName(state)}!</h1>
        <TalkFlower mode="voice" />
      </div>
      <div className="lf-voice-caption" aria-live="polite">
        {turn && <p className="lf-voice-you">“{turn.transcript}”</p>}
        {turn && status !== 'thinking' && <p className="lf-voice-reply">{turn.reply}</p>}
        <p className={`lf-voice-status${unavailable || error ? ' problem' : ''}`}>{unavailable || error || STATUS[status]}</p>
      </div>
    </div>
    <div className="lf-voice-controls">
      <span className="lf-call"><button className="lf-mute" aria-label={muted ? 'Unmute microphone' : 'Mute microphone'} aria-pressed={muted} disabled={!session.current} onClick={() => setMuted(session.current.toggleMute())}><img src={art('voice-mic-off-f712e.svg')} alt="" /></button></span>
      <span className="lf-call"><button className="lf-wave-button" aria-label={waveLabel} disabled={Boolean(unavailable)} onClick={() => session.current ? session.current.togglePause() : start()}>
        <span className={`lf-wave${live ? ' live' : ''}`} aria-hidden="true">{WAVES.map((w, i) => <img key={w} className={`lf-bar lf-bar-${i + 1}`} src={art(w)} alt="" />)}</span>
      </button></span>
      <span className="lf-call"><button className="lf-end" aria-label="End conversation" onClick={() => { session.current?.stop(); session.current = null; navigate('chat'); }}><img src={art('voice-end-2cf54.svg')} alt="" /></button></span>
    </div>
  </section>;
}
