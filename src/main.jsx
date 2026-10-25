import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import AccountGate from './Onboarding.jsx';
import './styles.css';
import './lila-final.css';
import './onboarding.css';
import { Capacitor } from '@capacitor/core';

createRoot(document.getElementById('root')).render(<React.StrictMode><AccountGate><App /></AccountGate></React.StrictMode>);

if (import.meta.env.PROD && !Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // The online app remains usable if the browser disables service workers.
    });
  });
}
