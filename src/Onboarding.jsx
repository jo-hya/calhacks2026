import { useEffect, useState } from 'react';
import { supabase } from './lib/auth.js';

// Gate in front of the app: sign in or sign up, then a short onboarding, then the app.
// With no Supabase keys configured, the children render unchanged (demo mode).
export default function AccountGate({ children }) {
  const [user, setUser] = useState(undefined); // undefined = still loading

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!supabase) return children;
  if (user === undefined) return <Shell><p className="onboard-muted">Loading…</p></Shell>;
  if (!user) return <Shell><SignIn /></Shell>;
  if (!user.user_metadata?.onboarded) return <Shell><Onboarding user={user} /></Shell>;
  return <>
    {children}
    <button className="onboard-signout" onClick={() => supabase.auth.signOut()}>Sign out</button>
  </>;
}

function Shell({ children }) {
  return <main className="onboard"><div className="onboard-card">{children}</div></main>;
}

function SignIn() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError(''); setNotice(''); setBusy(true);
    const credentials = { email: email.trim(), password };
    const result = mode === 'signup'
      ? await supabase.auth.signUp(credentials)
      : await supabase.auth.signInWithPassword(credentials);
    setBusy(false);
    if (result.error) setError(result.error.message);
    else if (mode === 'signup' && !result.data.session) setNotice('Check your email to confirm your account, then sign in.');
  }

  return <form onSubmit={submit} className="onboard-form">
    <h1>{mode === 'signup' ? 'Create your Lila account' : 'Welcome back'}</h1>
    <label>Email<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
    <label>Password<input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={6} required value={password} onChange={e => setPassword(e.target.value)} /></label>
    {error && <p role="alert" className="onboard-error">{error}</p>}
    {notice && <p className="onboard-notice">{notice}</p>}
    <button className="button light full-width" disabled={busy}>{mode === 'signup' ? 'Sign up' : 'Sign in'}</button>
    <button type="button" className="onboard-link" onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>
      {mode === 'signup' ? 'Already have an account? Sign in' : 'New here? Create an account'}
    </button>
  </form>;
}

function Onboarding({ user }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(user.user_metadata?.name || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function finish() {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 40) { setError('Enter a first name (1–40 characters).'); return; }
    setBusy(true); setError('');
    const { error: updateError } = await supabase.auth.updateUser({ data: { name: trimmed, onboarded: true } });
    setBusy(false);
    if (updateError) setError(updateError.message);
  }

  if (step === 0) return <div className="onboard-form">
    <h1>Hi, I'm Lila</h1>
    <p>I help you make room for everyday life: I watch your spending, suggest cheaper options nearby, and move money between budgets when you ask.</p>
    <button className="button light full-width" onClick={() => setStep(1)}>Get started</button>
  </div>;

  return <form className="onboard-form" onSubmit={e => { e.preventDefault(); finish(); }}>
    <h1>What should I call you?</h1>
    <label>First name<input autoFocus maxLength={40} required value={name} onChange={e => setName(e.target.value)} /></label>
    <p className="onboard-muted">Nothing is linked to a bank yet. You can connect accounts later.</p>
    {error && <p role="alert" className="onboard-error">{error}</p>}
    <button className="button light full-width" disabled={busy}>Finish setup</button>
  </form>;
}
