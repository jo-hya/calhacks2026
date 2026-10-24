import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';

export default function InstallPocket() {
  const [prompt, setPrompt] = useState(null);
  const [help, setHelp] = useState(false);
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true);
  useEffect(() => {
    const available = event => { event.preventDefault(); setPrompt(event); };
    const done = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener('beforeinstallprompt', available);
    window.addEventListener('appinstalled', done);
    return () => { window.removeEventListener('beforeinstallprompt', available); window.removeEventListener('appinstalled', done); };
  }, []);
  async function install() {
    if (!prompt) { setHelp(value => !value); return; }
    try { await prompt.prompt(); await prompt.userChoice; }
    catch { setHelp(true); }
    finally { setPrompt(null); }
  }
  if (installed || Capacitor.isNativePlatform()) return null;
  return <aside className="install-pocket" aria-label="Install Pocket">
    <button className="button light full-width" onClick={install}>Install Pocket</button>
    {help && <div className="install-help"><p><strong>Android:</strong> Open this page in Chrome, then tap the menu and choose Install app or Add to Home screen.</p><p><strong>iPhone:</strong> Open this page in Safari, tap Share, then Add to Home Screen. Turn on Open as Web App if shown.</p><p>Open your private pairing link before installing. Keep the demo laptop running.</p></div>}
  </aside>;
}
