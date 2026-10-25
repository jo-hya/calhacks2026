// Hands-free talking with Lila. The mic stays open; a pause after speech ends the turn, the
// recording goes to the server (Cartesia transcribes it, Lila answers, Cartesia speaks), the
// answer plays, then Lila listens again. Lila's own voice is never recorded: the mic is only
// read while it's the user's turn.
//
// States: starting, listening, hearing (the user is talking), thinking, speaking, muted,
// paused, stopped.

const SILENCE_MS = 900;        // a pause this long ends the user's turn
const MIN_SPEECH_MS = 350;     // shorter sounds (a cough, a bump) are ignored
const MAX_TURN_MS = 20000;     // very long turns are sent anyway
const IDLE_RESTART_MS = 15000; // silent audio is dropped so recordings stay small
const MIN_THRESHOLD = 0.015;   // RMS level that counts as speech in a quiet room
// A zero-length WAV: playing it during the starting tap lets later replies play on iPhone.
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

export const voiceSupported = () => typeof window !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder && (window.AudioContext || window.webkitAudioContext));

/**
 * `send(blob)` resolves to `{ transcript, reply, audio, audioType }` (audio is base64).
 * `onState(state)`, `onTurn({ transcript, reply })`, `onError(message)` report progress.
 */
export function createVoiceSession({ send, onState = () => {}, onTurn = () => {}, onError = () => {} }) {
  let stream = null, context = null, analyser = null, samples = null, recorder = null, chunks = [], frame = 0;
  let state = 'starting', muted = false, paused = false, stopped = false;
  let recordStart = 0, speechStart = 0, lastVoice = 0, noise = MIN_THRESHOLD / 3;
  const audio = new Audio();
  const set = next => { state = next; onState(next); };
  const mimeType = TYPES.find(type => window.MediaRecorder?.isTypeSupported?.(type));

  function discard() {
    const r = recorder;
    recorder = null; chunks = [];
    if (r) { r.ondataavailable = null; r.onstop = null; if (r.state !== 'inactive') r.stop(); }
  }

  function listen() {
    discard();
    if (stopped) return;
    if (paused) { set('paused'); return; }
    if (muted) { set('muted'); return; }
    const r = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    r.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    r.start(250);
    recorder = r; recordStart = performance.now(); speechStart = 0;
    set('listening');
  }

  function finishTurn() {
    const r = recorder, recorded = chunks;
    recorder = null; chunks = [];
    set('thinking');
    r.onstop = async () => {
      const blob = new Blob(recorded, { type: r.mimeType || mimeType || 'audio/webm' });
      try {
        const result = await send(blob);
        if (stopped) return;
        // Nothing intelligible (a door, a cough): keep listening without a reply.
        if (!result?.transcript) { listen(); return; }
        onTurn(result);
        if (result.audio && !paused) speak(result.audio, result.audioType);
        else listen();
      } catch (error) {
        if (stopped) return;
        onError(error.message);
        listen();
      }
    };
    r.stop();
  }

  function speak(base64, type = 'audio/mpeg') {
    set('speaking');
    audio.onended = () => { if (state === 'speaking') listen(); };
    audio.src = `data:${type};base64,${base64}`;
    audio.play().catch(() => { if (state === 'speaking') listen(); });
  }

  // Each animation frame: measure the mic level and decide where the user's turn is.
  function tick() {
    if (stopped) return;
    frame = requestAnimationFrame(tick);
    if (state !== 'listening' && state !== 'hearing') return;
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const s of samples) sum += s * s;
    const level = Math.sqrt(sum / samples.length);
    const now = performance.now();
    const threshold = Math.max(MIN_THRESHOLD, noise * 3);
    if (level > threshold) {
      lastVoice = now;
      if (!speechStart) { speechStart = now; set('hearing'); }
    } else if (!speechStart) {
      noise = noise * 0.95 + level * 0.05; // learn the room's background level between turns
    }
    if (speechStart && now - lastVoice > SILENCE_MS) {
      if (lastVoice - speechStart >= MIN_SPEECH_MS) finishTurn();
      else { speechStart = 0; set('listening'); }
    } else if (speechStart && now - speechStart > MAX_TURN_MS) finishTurn();
    else if (!speechStart && now - recordStart > IDLE_RESTART_MS) listen();
  }

  return {
    async start() {
      set('starting');
      // Unlock playback while we still have the user's tap.
      audio.src = SILENT_WAV;
      audio.play().catch(() => {});
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (stopped) { media.getTracks().forEach(t => t.stop()); return; }
      stream = media;
      const Context = window.AudioContext || window.webkitAudioContext;
      context = new Context();
      await context.resume();
      analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      samples = new Float32Array(analyser.fftSize);
      context.createMediaStreamSource(stream).connect(analyser);
      listen();
      tick();
    },
    toggleMute() {
      muted = !muted;
      if (muted && (state === 'listening' || state === 'hearing')) { discard(); set('muted'); }
      else if (!muted && state === 'muted') listen();
      return muted;
    },
    togglePause() {
      paused = !paused;
      if (paused) { audio.pause(); if (state !== 'thinking') { discard(); set('paused'); } }
      else if (state === 'paused') listen();
      return paused;
    },
    stop() {
      stopped = true;
      cancelAnimationFrame(frame);
      discard();
      audio.pause();
      stream?.getTracks().forEach(t => t.stop());
      context?.close().catch(() => {});
      set('stopped');
    },
  };
}
